# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SiaMA Qualif AO — a single Next.js 16 (App Router) application for tracking and qualifying public tenders (appels d'offres). No database, no Docker, no separate backend. Data comes from Google Sheets via OAuth2 refresh token.

### Running services

| Service | Command | Notes |
|---------|---------|-------|
| Dev server | `npm run dev` | Serves on port 3000. Hot-reloads. |

### Key commands

- **Typecheck:** `npm run typecheck`
- **Unit tests:** `npm run test:unit` (vitest, 22 tests)
- **E2E tests:** `npm run test:e2e` (Playwright, requires prior `npm run build`)
- **Full test:** `npm run test` (typecheck + unit)
- **Build:** `npm run build`
- **Lint:** `next lint` is declared in `package.json` but **does not work** with Next.js 16 (the subcommand was removed). Use `npm run typecheck` for static analysis.

### Auth for local development

The app uses cookie-based session auth. Set credentials in `.env.local`:
```
APP_USER_EMAIL=dev@test.local
APP_USER_PASSWORD=devpassword123
SESSION_SECRET=dev-secret-for-local-testing-only-abc123xyz
```

### Gotchas

- The login form uses React Server Actions; you cannot test login via simple `curl` POST. Use Playwright or a browser.
- Without Google Sheets credentials (`GOOGLE_SHEET_ID`, `GOOGLE_CLIENT_ID`, etc.), the app runs in "config mode" showing zero data but remains fully navigable.
- `npm install` requires `--legacy-peer-deps` due to dependency version conflicts.
- Playwright E2E tests need a production build (`npm run build`) because `playwright.config.ts` uses `npm run start` as `webServer.command`.
- Vitest excludes two test files by default in `vitest.config.ts` (`normalize.test.ts`, `intelligence.test.ts`).
