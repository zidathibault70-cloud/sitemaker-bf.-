# SiteMaker BF — version 24 (GitHub + Render)

Projet prêt à être placé à la racine d'un dépôt GitHub puis déployé comme **Render Web Service**.

## Fichiers importants
- `index.html` : interface utilisateur
- `server.js` : serveur Node.js et API
- `package.json` : démarrage du serveur
- `render.yaml` : configuration Render
- `data/` : données de test/runtime

## Déploiement Render
- Type : **Web Service**
- Build command : `npm install`
- Start command : `npm start`
- Node : 20

## Variables secrètes
Configure dans Render, dans **Environment**, les variables `DEV_KEY`, `AGENT_KEY` et, si l'envoi d'e-mails est activé, `RESEND_API_KEY`.

Ne mets jamais de mot de passe, clé API de paiement ou secret dans `index.html` ou dans un dépôt public.

## Crédits
- 2 créations gratuites par utilisateur.
- 500 F CFA = 2 sites supplémentaires.
- 250 F CFA = 3 publications supplémentaires.

## Argent réel
La partie dépôt/retrait est conçue pour une validation serveur. Pour faire circuler de vrais FCFA, il faut encore connecter une API/opérateur de paiement officiel et utiliser ses identifiants côté serveur.
