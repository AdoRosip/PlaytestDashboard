# Playlytix response dashboard

## Getting Started

Start with the [complete Portal API guide: QA and production](docs/portal-api.md). It covers credentials, master-key derivation, environment variables, Portal launches, actual API requests, payloads, current compatibility gaps, deployment and troubleshooting. Use the [QA environment template](docs/portal-qa.env.example) or [production environment template](docs/portal-production.env.example). Vercel Production always enforces Portal authentication; `npm run build` validates its configuration first. Keep QA credentials scoped to Preview. The earlier [QA record](docs/portal-setup.md) and [production preparation record](docs/portal-production.md) preserve dated validation results.

Run `npm test`, `npm run lint`, and `npm run build` to verify changes. `npm run check:portal-env` validates Portal settings without printing secrets or contacting the API. `npm run test:portal:fixture` starts an isolated local server and exercises the browser flow against the supplied response using fake credentials. `npm run test:portal` remains an opt-in live QA suite. Run browser tests and builds sequentially because Next.js generates shared type files.

The instructions below apply to the internal Excel/demo workflow when Portal mode is disabled. In that mode, dashboard authentication is disabled by default. If you want to enable HTTP
Basic authentication later, configure all three variables:

```bash
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_USERNAME=your-user
DASHBOARD_PASSWORD=use-a-long-random-password
```

The browser will request these credentials using HTTP Basic authentication. They
protect the dashboard itself as well as the tester-registry and OpenAI-backed API
routes. When Portal mode is disabled, without `DASHBOARD_AUTH_ENABLED=true`, no login is required in local or
nonproduction environments. The internal/demo mode is unavailable on Vercel Production in this branch.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
