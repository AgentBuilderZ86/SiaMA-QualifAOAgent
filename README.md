# SiaMA Qualif AO

Application web interne pour suivre la qualification des appels d'offres depuis Google Sheets.

## Stack

- Next.js avec App Router
- TypeScript
- Authentification simple par cookie serveur
- Connecteur Google Sheets via OAuth refresh token

## Lancement local

```bash
npm install
npm run dev
```

Copier `.env.example` vers `.env.local`, puis renseigner les variables.

## Données

Les chiffres affichés dans le dashboard sont calculés uniquement depuis les onglets Google Sheets configurés. Si la configuration Google manque, l'app affiche un état de configuration sans inventer de données.
