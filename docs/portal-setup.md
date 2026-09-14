# Portal integration setup

Implemented on `planning/playlytix-api-integration`, September 14, 2026. This supersedes the planning-only status in the previous handoff. No Vercel deployment or Portal configuration has been changed.

## Environment variables

In Vercel, open the dashboard project → Settings → Environment Variables. Add the following to the intended Preview environment, then redeploy ([Vercel instructions](https://vercel.com/docs/environment-variables/managing-environment-variables)). All variables are server-only; none uses `NEXT_PUBLIC_`. Use separate Production credentials when the backend production environment is confirmed.

| Name | Value |
| --- | --- |
| `PORTAL_MODE` | `true` |
| `PLAYLYTIX_API_BASE_URL` | `https://qa.playlytix.gg/api` for the verified QA environment |
| `PLAYLYTIX_CLIENT_KEYS` | JSON object: `{"18":"<client 18 API key>","2":"<client 2 API key>"}` |
| `DASHBOARD_SSO_SECRET` | The shared token secret supplied by Viktor |
| `DASHBOARD_SESSION_SECRET` | Independent random secret, at least 32 characters; generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `PLAYLYTIX_TEST_GAME_MAP` | `{}` initially; reviewed overrides use `{"18:32":"wannabe-trashman"}` or another ID from `lib/games/index.ts`. Do not infer a configuration from a test title. |

The supplied keys and token secret are already in the ignored `.env.local`, alongside a newly generated independent local session secret and the QA base URL. Existing unrelated env settings were preserved. Portal account emails/passwords are for logging into the Portal; they are not dashboard environment variables. The old single `PLAYLYTIX_API_KEY` is unused by this integration.

## Launch and local testing

Supported Portal link: `https://<dashboard-host>/tests/32?token=<payload>.<signature>`.
Also supported: `/auth/launch?testId=32&token=...`, or omit `testId` to open the client's test list.

The saved brief specifies payload = base64url(JSON `{d: numericClientId, e: expiryUnixSeconds}`), signature = base64url(HMAC-SHA256(encoded payload, shared secret)). The shared secret is used as a UTF-8 string, not hex-decoded. Expiry must be in the future and no more than 330 seconds ahead (five minutes plus 30 seconds for clock skew). Invalid tokens are rejected before session issuance. A valid launch sets a fixed two-hour signed HttpOnly, SameSite=Lax session and redirects to a clean URL. Production uses a Secure `__Host-` cookie.

Run `npm run dev`, then `node scripts/portal-launch.mjs 18 32` or `node scripts/portal-launch.mjs 2 28`. Open the printed localhost URL within five minutes. Treat it as a temporary credential. This simulator checks our flow; it does not prove Viktor's actual signing function matches.

Automated verification: `npm test`, `npm run lint`, and `npm run build`. The opt-in live QA/browser suite is `npm run test:portal`; start `npm run dev -- --port 3100` first. It uses installed Microsoft Edge in headless mode, local env secrets, and read-only requests against QA tests 32 and 28. It never submits Portal responses. Traces/screenshots are disabled to avoid saving credentials or QA data. On a machine without Edge, configure an installed Playwright browser in `playwright.config.ts`.

Client keys authorize client-wide access, consistent with the signed client-only payload. They do not implement per-user or per-test membership restrictions. The token is replayable until expiry. Portal logout does not revoke an existing dashboard session immediately; expiry or removing/rotating dashboard configuration does. Agree these semantics before production.

## Implemented behavior

- Protected launch/session/list/test routes; authorization repeated at each data handler. A session ID request header prevents an old tab from fetching through a replaced cookie.
- Server-side per-client keys, no-store requests/responses, redirect rejection, 20-second timeout and 20 MiB response limit. Malformed/incomplete payloads fail safely.
- Browser receives an allowlisted analytics DTO. Raw identities, Steam profiles, payment fields, comments, attachment names and signed attachment URLs are omitted. Answer text can itself contain information entered by testers.
- Portal datasets live in memory; legacy localStorage dataset is cleared. Hidden tabs clear their dataset and reload on return. BroadcastChannel, polling, focus checks and expiry timers invalidate changed/expired sessions. Previously downloaded data cannot be withdrawn.
- Report URLs retain test context. Known game rules require an explicit client/test configuration map; unknown tests use neutral analytics with a visible explanation. No mock fallback.
- Counts represent submissions, not deduplicated people. Total submissions include empty/file-only rows; answer-based charts count submissions with answers. Files are viewed in the Portal.
- Existing global tester registry and AI APIs are disabled for Portal clients, including direct calls. AI can be added after requests are bound to authorized server-fetched test data with usage limits. Upload, settings, builder and AI pages are unavailable in Portal mode. Report changes are not persisted.

## Verified QA facts and remaining release checks

September 14 validation: 182 unit/route tests passed, all four live QA/browser checks passed, lint passed, and the production build passed. Browser checks cover report loading, scoped navigation, reload, logout, cross-client API denial and stale-tab invalidation. A scan of 516 generated development/production browser assets found none of the configured client keys or signing secrets. These checks used locally generated launch tokens, not the real Portal button.

Both supplied client keys successfully listed tests. Client 18's test 32 and client 2's test 28 returned 200 with their own keys; both cross-client requests returned 404. The live test list is wrapped in `{tests: [...]}`. Live profiles include more fields than the saved reference; additional fields are deliberately ignored.

Before production, obtain:

1. The stable dashboard Vercel hostname and the intended deployment environment; Viktor must point Open Dashboard to that hostname.
2. One actual Portal-generated launch and confirmation of the signature contract/client-wide scope above. Supplied account credentials can be used for this once the Portal button targets the dashboard.
3. Production API base URL and production credentials if this is to go live beyond QA.
4. The correct game/questionnaire mapping for real playtests if game-specific categories, score direction and KPIs are required. QA demo tests currently use neutral analytics.

Verify hosting logs redact token query strings, real Portal → dashboard navigation works, and production HTTPS cookies are set before release. Do not log tokens or put secrets in committed configuration. Deployments without `PORTAL_MODE=true` retain the existing internal/demo workflow; configure this variable explicitly on every client-facing deployment.
