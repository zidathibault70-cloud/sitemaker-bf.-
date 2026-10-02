const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const FROM = process.env.EMAIL_FROM || 'SiteMaker BF <onboarding@resend.dev>';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const codes = new Map();
const root = __dirname;
const publishedSites = new Map();
const publishedPublications = new Map();
const DATA_DIR = path.join(root, 'data');
const WALLET_FILE = path.join(DATA_DIR, 'wallet.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SOCIAL_FILE = path.join(DATA_DIR, 'social.json');
const PUBLICATIONS_FILE = path.join(DATA_DIR, 'publications.json');
const DEV_KEY_FILE = path.join(DATA_DIR, 'developer-key.json');
const FREE_CREATIONS = Number(process.env.FREE_CREATIONS || 2);
const SITE_CREATION_PRICE = Number(process.env.SITE_CREATION_PRICE || 500);
const PUBLICATION_CREATION_PRICE = Number(process.env.PUBLICATION_CREATION_PRICE || 250);
const SITE_CREDITS_PER_PACKAGE = Number(process.env.SITE_CREDITS_PER_PACKAGE || 2);
const PUBLICATION_CREDITS_PER_PACKAGE = Number(process.env.PUBLICATION_CREDITS_PER_PACKAGE || 3);
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
let walletDb = {users:{}, requests:[]};
let usersDb = {users:{}};
let socialDb = {follows:{}};
let publicationsDb = {items:{}};
try { walletDb = JSON.parse(fs.readFileSync(WALLET_FILE,'utf8')); } catch(e) {}
try { usersDb = JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); } catch(e) {}
try { socialDb = JSON.parse(fs.readFileSync(SOCIAL_FILE,'utf8')); } catch(e) {}
try { publicationsDb = JSON.parse(fs.readFileSync(PUBLICATIONS_FILE,'utf8')); } catch(e) {}
Object.entries(publicationsDb.items||{}).forEach(([slug,d])=>publishedPublications.set(slug,d));
const DEFAULT_DEV_KEY = 'DEV-BF-7Q4M-29XK-81PZ';
const DEFAULT_AGENT_KEY = 'AGENT-BF-6N8R-42WC-75LM';
let developerKey = process.env.DEV_KEY || DEFAULT_DEV_KEY;
if(!process.env.DEV_KEY){ try { fs.writeFileSync(DEV_KEY_FILE, JSON.stringify({key:developerKey,createdAt:new Date().toISOString()},null,2)); } catch(e) {} }
function authAgent(key){ return String(key||'') === (process.env.AGENT_KEY || DEFAULT_AGENT_KEY); }
function saveWalletDb(){ fs.writeFileSync(WALLET_FILE, JSON.stringify(walletDb,null,2)); }
function saveUsersDb(){ fs.writeFileSync(USERS_FILE, JSON.stringify(usersDb,null,2)); }
function saveSocialDb(){ fs.writeFileSync(SOCIAL_FILE, JSON.stringify(socialDb,null,2)); }
function savePublicationsDb(){ fs.writeFileSync(PUBLICATIONS_FILE, JSON.stringify(publicationsDb,null,2)); }
function followersOf(email){ const key=String(email||'').toLowerCase(); return Object.values(socialDb.follows||{}).filter(x=>x.creator===key).length; }
function isFollowing(follower,creator){ return !!socialDb.follows[String(follower||'').toLowerCase()+'::'+String(creator||'').toLowerCase()]; }
function walletUser(email){ const key=String(email||'').trim().toLowerCase(); if(!key) throw new Error('Email utilisateur requis.'); if(!walletDb.users[key]) walletDb.users[key]={balance:0}; return walletDb.users[key]; }
function ensureUser(email, profile={}){ const key=String(email||'').trim().toLowerCase(); if(!key) throw new Error('Email utilisateur requis.'); if(!usersDb.users[key]) usersDb.users[key]={email:key,name:String(profile.name||key.split('@')[0]),phone:String(profile.phone||''),createdAt:new Date().toISOString(),freeCreations:FREE_CREATIONS,paidCreations:0}; else { if(profile.name) usersDb.users[key].name=String(profile.name); if(profile.phone) usersDb.users[key].phone=String(profile.phone); } saveUsersDb(); return usersDb.users[key]; }
function creationCost(type){ return type==='site'?SITE_CREATION_PRICE:PUBLICATION_CREATION_PRICE; }
function consumeCreation(email,type){ const u=ensureUser(email); if(u.freeCreations>0){ u.freeCreations--; saveUsersDb(); return {ok:true,source:'free',cost:0}; } if(u.paidCreations>0){ u.paidCreations--; saveUsersDb(); return {ok:true,source:'paid-credit',cost:0}; } const cost=creationCost(type); const w=walletUser(email); if(w.balance<cost) return {ok:false,error:`Crédit insuffisant. Cette création coûte ${cost} F CFA. Recharge ton portefeuille ou achète des crédits.`}; w.balance-=cost; saveWalletDb(); saveUsersDb(); return {ok:true,source:'wallet',cost}; }
function restoreCreation(email,type){ const u=ensureUser(email); if(u.freeCreations<FREE_CREATIONS) u.freeCreations++; else u.paidCreations++; saveUsersDb(); }
function authDeveloper(key){ return String(key||'')===developerKey; }
function requestId(){ return 'REQ-'+Date.now()+'-'+crypto.randomInt(1000,9999); }
function slugify(v){ return String(v||'site').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50) || 'site'; }
function publicSiteHtml(d){
  const links=(d.platforms||[]).map(x=>`<span style="margin-right:10px">${String(x)}</span>`).join('');
  return `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(d.name||'SiteMaker')}</title><body style="margin:0;font-family:Arial;background:#f5f7fb;color:#172033"><main style="max-width:760px;margin:auto;padding:24px"><section style="background:${d.color||'#2459dc'};color:white;border-radius:24px;padding:28px"><div style="font-size:13px;opacity:.85">Site créé avec SiteMaker BF</div>${d.logo?`<img src="${d.logo}" style="max-width:120px;max-height:80px;margin-top:12px">`:''}<h1>${String(d.name||'')}</h1><p>${String(d.desc||'')}</p></section><section style="background:white;border-radius:20px;padding:22px;margin-top:16px"><h2>Outils</h2><p>🛒 Produits · 📱 Réseaux sociaux · 💬 Contact · 💳 Paiement</p><p>${String(d.sections||'Accueil · Produits · À propos · Contact')}</p></section><section style="background:white;border-radius:20px;padding:22px;margin-top:16px"><h2>Réseaux</h2><p>${links}</p><p>Retrait : ${String(d.method||'')} · ${String(d.num||'')}</p></section></main></body></html>`;
}
function publicPublicationHtml(d){
  const links=(d.platforms||[]).map(x=>`<span style="margin-right:10px">${String(x)}</span>`).join('');
  return `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(d.name||'Publication')}</title><body style="margin:0;font-family:Arial;background:#f5f7fb"><main style="max-width:620px;margin:auto;padding:20px"><article style="background:white;border-radius:22px;overflow:hidden;box-shadow:0 8px 25px #0001">${d.image?`<img src="${d.image}" style="width:100%;max-height:340px;object-fit:cover">`:''}<div style="padding:22px"><div style="font-size:12px;color:#667085">${String(d.category||'Produit')}</div><h1>${String(d.name||'')}</h1><p>${String(d.desc||'')}</p><h2>${new Intl.NumberFormat('fr-FR').format(Number(d.price||0))} F CFA</h2><p>📞 ${String(d.contact||'')}</p><p>${links}</p></div></article></main></body></html>`;
}


function json(res, status, data){
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});
  res.end(body);
}
function makeCode(){ return crypto.randomInt(100000,1000000).toString(); }
function validEmail(e){ return typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
function body(req){ return new Promise((resolve,reject)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}}); }); }
async function sendViaResend(email,code){
  if(!RESEND_API_KEY) throw new Error('RESEND_API_KEY non configurée');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:FROM,to:[email],subject:'Votre code SiteMaker BF',html:`<div style="font-family:Arial,sans-serif"><h2>SiteMaker BF</h2><p>Votre code de vérification :</p><p style="font-size:30px;font-weight:800;letter-spacing:8px">${code}</p><p>Ne partagez jamais ce code.</p></div>`})});
  if(!r.ok) throw new Error('Resend a refusé l’envoi');
  return r.json();
}
function serve(req,res){
  let u=decodeURIComponent((req.url||'/').split('?')[0]);
  if(u==='/') u='/index.html';
  const file=path.normalize(path.join(root,u));
  if(!file.startsWith(root)) return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found')} const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
    if(req.method==='POST' && req.url==='/api/ai/chat'){
      const d=await body(req);
      if(!OPENAI_API_KEY) return json(res,503,{error:'Le service IA n’est pas encore configuré. Ajoute OPENAI_API_KEY dans Render.'});
      const messages=Array.isArray(d.messages)?d.messages.slice(-12):[];
      const clean=messages.filter(m=>m && (m.role==='user'||m.role==='assistant') && typeof m.content==='string' && m.content.trim()).map(m=>({role:m.role,content:m.content.slice(0,6000)}));
      if(!clean.length) return json(res,400,{error:'Écris une question.'});
      const input=[{role:'developer',content:'Tu es l’assistant officiel de SiteMaker BF. Réponds en français, de façon claire, utile et adaptée aux débutants. Aide sur la création de sites, publications, commerce en ligne, cours, projets et utilisation de SiteMaker. Ne prétends pas avoir effectué une action que tu n’as pas effectuée. Si une information dépend de SiteMaker et n’est pas fournie, explique la limite plutôt que d’inventer.'},...clean];
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:OPENAI_MODEL,input})});
      const raw=await r.text();
      let out={}; try{out=JSON.parse(raw)}catch(e){out={}};
      if(!r.ok) return json(res,r.status,{error:out?.error?.message||'Le service IA a refusé la demande.'});
      const answer=String(out.output_text||'').trim();
      if(!answer) return json(res,502,{error:'L’IA n’a pas renvoyé de réponse.'});
      return json(res,200,{ok:true,answer,model:OPENAI_MODEL});
    }
    if(req.method==='POST' && req.url==='/api/send-code'){
      const d=await body(req), email=String(d.email||'').trim();
      if(!validEmail(email)) return json(res,400,{error:'Adresse email invalide.'});
      const code=makeCode();
      if(!RESEND_API_KEY) return json(res,503,{error:'Le serveur n’a pas encore sa clé d’envoi e-mail (RESEND_API_KEY).'});
      await sendViaResend(email,code); codes.set(email.toLowerCase(),{code,createdAt:Date.now()}); return json(res,200,{ok:true});
    }
    if(req.method==='POST' && req.url==='/api/generate-code'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase();
      if(!validEmail(email)) return json(res,400,{error:'Adresse email invalide.'});
      const code=makeCode(); codes.set(email,{code,createdAt:Date.now()}); return json(res,200,{ok:true,code});
    }
    if(req.method==='POST' && req.url==='/api/verify-code'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase(), code=String(d.code||'').trim(), item=codes.get(email);
      if(!item || item.code!==code) return json(res,401,{ok:false,error:'Code incorrect.'});
      if(Date.now()-item.createdAt>10*60*1000) return json(res,401,{ok:false,error:'Code expiré.'});
      codes.delete(email); const profile={name:String(d.name||''),phone:String(d.phone||'')}; ensureUser(email,profile); return json(res,200,{ok:true});
    }

    if(req.method==='GET' && req.url.startsWith('/api/account?')){
      const q=new URL(req.url,'http://localhost'); const email=q.searchParams.get('email');
      if(!email) return json(res,400,{error:'Email utilisateur requis.'});
      const u=ensureUser(email), w=walletUser(email);
      return json(res,200,{ok:true,profile:u,freeCreations:u.freeCreations,paidCreations:u.paidCreations,sitePrice:SITE_CREATION_PRICE,publicationPrice:PUBLICATION_CREATION_PRICE,siteCreditsPerPackage:SITE_CREDITS_PER_PACKAGE,publicationCreditsPerPackage:PUBLICATION_CREDITS_PER_PACKAGE,balance:w.balance});
    }
    if(req.method==='POST' && req.url==='/api/profile/update'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase();
      if(!validEmail(email)) return json(res,400,{error:'Adresse email invalide.'});
      const u=ensureUser(email);
      if(typeof d.name==='string' && d.name.trim()) u.name=d.name.trim().slice(0,80);
      if(typeof d.phone==='string') u.phone=d.phone.trim().slice(0,30);
      if(typeof d.whatsapp==='string') u.whatsapp=d.whatsapp.trim().slice(0,30);
      if(typeof d.telegram==='string') u.telegram=d.telegram.trim().slice(0,100);
      if(typeof d.instagram==='string') u.instagram=d.instagram.trim().slice(0,150);
      if(typeof d.tiktok==='string') u.tiktok=d.tiktok.trim().slice(0,150);
      if(typeof d.bio==='string') u.bio=d.bio.trim().slice(0,500);
      saveUsersDb();
      return json(res,200,{ok:true,profile:u});
    }
    if(req.method==='POST' && req.url==='/api/credits/buy'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase(), type=String(d.type||'').trim(), qty=Math.max(1,Math.floor(Number(d.quantity||1)));
      if(!email || !['site','publication'].includes(type)) return json(res,400,{error:'Email et type de crédit requis.'});
      const price=creationCost(type)*qty, w=walletUser(email); if(w.balance<price) return json(res,400,{error:`Solde insuffisant. Il faut ${price} F CFA.`});
      const u=ensureUser(email); w.balance-=price; const creditsPerPackage=type==='site'?SITE_CREDITS_PER_PACKAGE:PUBLICATION_CREDITS_PER_PACKAGE; const granted=creditsPerPackage*qty; u.paidCreations+=granted; saveWalletDb(); saveUsersDb();
      return json(res,200,{ok:true,paidCreations:u.paidCreations,balance:w.balance,charged:price,packages:qty,granted});
    }
    if(req.method==='POST' && req.url==='/api/developer/dashboard'){
      const d=await body(req); if(!authDeveloper(d.key)) return json(res,401,{error:'Code développeur incorrect.'});
      const users=Object.values(usersDb.users); const pending=walletDb.requests.filter(x=>x.status==='pending');
      const totalBalance=Object.values(walletDb.users).reduce((a,u)=>a+Number(u.balance||0),0);
      return json(res,200,{ok:true,stats:{users:users.length,pendingRequests:pending.length,totalBalances:totalBalance,sitesPublished:publishedSites.size,publicationsPublished:publishedPublications.size},pricing:{site:SITE_CREATION_PRICE,publication:PUBLICATION_CREATION_PRICE,siteCreditsPerPackage:SITE_CREDITS_PER_PACKAGE,publicationCreditsPerPackage:PUBLICATION_CREDITS_PER_PACKAGE,free:FREE_CREATIONS},users:users.map(u=>({email:u.email,name:u.name,createdAt:u.createdAt,freeCreations:u.freeCreations,paidCreations:u.paidCreations,balance:Number(walletUser(u.email).balance||0)})),requests:walletDb.requests.slice().reverse()});
    }
    if(req.method==='POST' && req.url==='/api/developer/settings'){
      const d=await body(req); if(!authDeveloper(d.key)) return json(res,401,{error:'Code développeur incorrect.'});
      return json(res,200,{ok:true,message:'Les prix par défaut sont configurés côté serveur via SITE_CREATION_PRICE et PUBLICATION_CREATION_PRICE.'});
    }

    if(req.method==='GET' && req.url.startsWith('/api/wallet?')){
      const q=new URL(req.url,'http://localhost'); const email=q.searchParams.get('email');
      if(!email) return json(res,400,{error:'Email utilisateur requis.'});
      const u=walletUser(email); const requests=walletDb.requests.filter(x=>x.email===email.toLowerCase()).slice(-30).reverse();
      return json(res,200,{ok:true,balance:u.balance,requests});
    }
    if(req.method==='POST' && req.url==='/api/wallet/deposit'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase(), amount=Number(d.amount), method=String(d.method||'').trim(), reference=String(d.reference||'').trim();
      if(!email || !amount || amount<1 || !method || !reference) return json(res,400,{error:'Email, montant, méthode et référence sont requis.'});
      const r={id:requestId(),type:'deposit',email,amount,method,reference,status:'pending',createdAt:new Date().toISOString()}; walletDb.requests.push(r); saveWalletDb();
      return json(res,201,{ok:true,request:r});
    }
    if(req.method==='POST' && req.url==='/api/wallet/withdraw'){
      const d=await body(req), email=String(d.email||'').trim().toLowerCase(), amount=Number(d.amount), method=String(d.method||'').trim(), destination=String(d.destination||'').trim();
      if(!email || !amount || amount<1 || !method || !destination) return json(res,400,{error:'Email, montant, méthode et numéro de retrait sont requis.'});
      const u=walletUser(email);
      const pending=walletDb.requests.filter(x=>x.email===email&&x.type==='withdraw'&&x.status==='pending').reduce((a,x)=>a+x.amount,0);
      if(amount+pending>u.balance) return json(res,400,{error:'Solde disponible insuffisant pour cette demande.'});
      const r={id:requestId(),type:'withdraw',email,amount,method,destination,status:'pending',createdAt:new Date().toISOString()}; walletDb.requests.push(r); saveWalletDb();
      return json(res,201,{ok:true,request:r});
    }
    if(req.method==='POST' && req.url==='/api/agent/requests'){
      const d=await body(req); if(!authAgent(d.key)) return json(res,401,{error:'Clé agent incorrecte.'});
      return json(res,200,{ok:true,requests:walletDb.requests.slice().reverse()});
    }
    if(req.method==='POST' && req.url==='/api/agent/validate'){
      const d=await body(req); if(!authAgent(d.key)) return json(res,401,{error:'Clé agent incorrecte.'});
      const r=walletDb.requests.find(x=>x.id===d.id); if(!r) return json(res,404,{error:'Demande introuvable.'});
      if(r.status!=='pending') return json(res,400,{error:'Cette demande a déjà été traitée.'});
      const u=walletUser(r.email);
      if(String(d.action||'')==='approve'){
        if(r.type==='deposit') u.balance+=r.amount;
        else { if(r.amount>u.balance) return json(res,400,{error:'Solde insuffisant au moment de la validation.'}); u.balance-=r.amount; }
        r.status='approved'; r.validatedAt=new Date().toISOString();
      } else if(String(d.action||'')==='reject'){ r.status='rejected'; r.validatedAt=new Date().toISOString(); }
      else return json(res,400,{error:'Action invalide.'});
      saveWalletDb(); return json(res,200,{ok:true,request:r,balance:u.balance});
    }

    if(req.method==='GET' && req.url.startsWith('/api/marketplace')){
      const q=new URL(req.url,'http://localhost'), viewer=(q.searchParams.get('email')||'').toLowerCase();
      const items=[...publishedPublications.entries()].reverse().map(([slug,d])=>({slug,url:'/publication/'+slug,name:d.name,desc:d.desc,price:Number(d.price||0),image:d.image||'',category:d.category||'Produit',ownerEmail:d.ownerEmail||d.email,ownerName:(usersDb.users[d.ownerEmail||d.email]||{}).name||d.ownerEmail||d.email,followers:followersOf(d.ownerEmail||d.email),following:viewer?isFollowing(viewer,d.ownerEmail||d.email):false,createdAt:d.createdAt||''}));
      return json(res,200,{ok:true,items});
    }
    if(req.method==='GET' && req.url.startsWith('/api/channel?')){
      const q=new URL(req.url,'http://localhost'), email=(q.searchParams.get('email')||'').toLowerCase(), viewer=(q.searchParams.get('viewer')||'').toLowerCase();
      if(!email) return json(res,400,{error:'Créateur requis.'});
      const u=usersDb.users[email]; if(!u) return json(res,404,{error:'Créateur introuvable.'});
      const products=[...publishedPublications.entries()].filter(([slug,d])=>(d.ownerEmail||d.email||'').toLowerCase()===email).map(([slug,d])=>({slug,url:'/publication/'+slug,name:d.name,desc:d.desc,price:Number(d.price||0),image:d.image||'',category:d.category||'Produit',createdAt:d.createdAt||''})).reverse();
      return json(res,200,{ok:true,profile:u,followers:followersOf(email),following:viewer?isFollowing(viewer,email):false,products});
    }
    if(req.method==='POST' && req.url==='/api/follow'){
      const d=await body(req), follower=String(d.follower||'').trim().toLowerCase(), creator=String(d.creator||'').trim().toLowerCase();
      if(!follower||!creator||follower===creator) return json(res,400,{error:'Compte invalide pour le suivi.'});
      if(!usersDb.users[follower]||!usersDb.users[creator]) return json(res,404,{error:'Utilisateur introuvable.'});
      const key=follower+'::'+creator;
      if(socialDb.follows[key]) delete socialDb.follows[key]; else socialDb.follows[key]={follower,creator,createdAt:new Date().toISOString()};
      saveSocialDb();
      return json(res,200,{ok:true,following:!!socialDb.follows[key],followers:followersOf(creator)});
    }
    if(req.method==='POST' && req.url==='/api/publish-site'){
      const d=await body(req); const email=String(d.email||'').trim().toLowerCase(); if(!email||!String(d.name||'').trim()||!String(d.desc||'').trim()) return json(res,400,{error:'Email, nom et description requis.'});
      const consumed=consumeCreation(email,'site'); if(!consumed.ok) return json(res,402,consumed);
      let base=slugify(d.name), slug=base, i=2; while(publishedSites.has(slug)){slug=base+'-'+i++;}
      d.ownerEmail=email; publishedSites.set(slug,d); return json(res,200,{ok:true,url:'/site/'+slug,creation:consumed});
    }
    if(req.method==='POST' && req.url==='/api/publish-publication'){
      const d=await body(req); const email=String(d.email||'').trim().toLowerCase(); if(!email||!String(d.name||'').trim()||!Number(d.price)) return json(res,400,{error:'Email, nom et prix requis.'});
      const consumed=consumeCreation(email,'publication'); if(!consumed.ok) return json(res,402,consumed);
      let base=slugify(d.name), slug=base, i=2; while(publishedPublications.has(slug)){slug=base+'-'+i++;}
      d.ownerEmail=email; d.createdAt=new Date().toISOString(); publishedPublications.set(slug,d); publicationsDb.items[slug]=d; savePublicationsDb(); return json(res,200,{ok:true,url:'/publication/'+slug,creation:consumed});
    }
    if(req.method==='GET' && req.url.startsWith('/site/')){
      const slug=req.url.slice('/site/'.length).split('?')[0], d=publishedSites.get(slug); if(!d) return json(res,404,{error:'Site introuvable.'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(publicSiteHtml(d));
    }
    if(req.method==='GET' && req.url.startsWith('/publication/')){
      const slug=req.url.slice('/publication/'.length).split('?')[0], d=publishedPublications.get(slug); if(!d) return json(res,404,{error:'Publication introuvable.'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(publicPublicationHtml(d));
    }
    serve(req,res);
  }catch(e){ json(res,500,{error:e.message||'Erreur serveur'}); }
});
server.listen(PORT,()=>console.log(`SiteMaker BF : http://localhost:${PORT}`));
