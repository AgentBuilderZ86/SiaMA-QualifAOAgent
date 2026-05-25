# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SiaMA Qualif AO is a Next.js 16 (App Router) monolithic web application for tracking and qualifying public tenders (appels d'offres) sourced from Google Sheets. It runs as a single service on `localhost:3000`.

### Running the dev server

```bash
npm run dev
```

The app gracefully degrades when Google Sheets credentials are absent — it shows a config status page rather than crashing. Auth requires `APP_USER_EMAIL`, `APP_USER_PASSWORD`, and `SESSION_SECRET` in `.env.local`.

### Key commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm run test:unit` |
| Full test (typecheck + unit) | `npm run test` |
| E2E tests | `npm run test:e2e` |
| Build | `npm run build` |

### Caveats

- **Lint is broken**: The `npm run lint` script invokes `next lint`, which was removed in Next.js 16. There is no standalone ESLint config. Do not rely on `npm run lint`.
- **Login uses server actions**: Authentication cannot be tested via simple `curl` POST. Use a browser or Playwright for login flow testing.
- **No database**: All persistent data comes from Google Sheets via OAuth. Without `GOOGLE_SHEET_ID` and associated credentials, the dashboard shows a configuration prompt but the app still runs.
- **Env file**: Copy `.env.example` to `.env.local`. For local dev/testing, set `APP_USER_EMAIL`, `APP_USER_PASSWORD`, and `SESSION_SECRET` to any values.
