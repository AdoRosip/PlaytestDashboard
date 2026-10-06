# Portal API integration: setup, flow and troubleshooting

> **Superseded operational guide:** start with the [consolidated Portal API guide](portal-api.md) for current QA/production setup, key derivation, contract v2 limitations and troubleshooting. This document preserves the September 14 QA implementation and validation record. Statements below about configuration and deployment describe that historical run.

Implemented on `planning/playlytix-api-integration`, September 14, 2026. This supersedes the planning-only status in the previous handoff. No Vercel deployment or Portal configuration has been changed.

The [consolidated guide](portal-api.md) is the main operational document. The [original review](portal-api-integration-review.md) and [planning handoff](portal-api-integration-handoff.md) preserve historical findings and proposed work; they are not descriptions of the current runtime. Implementation details below were checked against the source on September 14. Validation results later in this document record the implementation run, not a fresh deployment verification each time this document is edited.

## What Portal mode means

Portal mode is a dashboard configuration switch, not a separate application, backend or login provider. `PORTAL_MODE=true` makes the existing Next.js server authenticate Portal launch links and use Viktor's API as the report source. The Portal still owns user accounts and passwords. No additional session database is used.

Only the exact string `true` enables this mode. When it is enabled, the Portal session rules take precedence over the old optional Basic authentication. Missing or invalid credentials do not fall back to a shared API key or demo dataset. When it is absent or false, the internal Excel/demo workflow remains available with its existing optional Basic authentication. Do not disable Portal mode to work around a client-facing authentication problem.

## End-to-end flow

1. The person signs into Playlytix Portal. The Portal determines the client account and offers Open Dashboard on a test.
2. The Portal creates a signed launch link containing the client ID and an expiry about five minutes away. The test ID is in the path; it is not part of the signed claims in this contract.
3. Our Next.js server verifies the signature locally using `DASHBOARD_SSO_SECRET`, checks expiry and verifies the client exists in our configured key map. No upstream authentication call is needed at this stage.
4. Our server signs a new two-hour session cookie using `DASHBOARD_SESSION_SECRET` and redirects to `/tests/<id>/overview`, removing the launch token from the visible URL. Session creation itself does not verify test ownership; the subsequent API request does.
5. The browser requests `/api/portal/session`, then `/api/portal/tests/<id>`, sending its session cookie and the returned session ID as `x-portal-session`.
6. Our server verifies the cookie again, rejects a mismatched session ID, selects the client's API key from `PLAYLYTIX_CLIENT_KEYS`, and requests `/tests/<id>/responses` from Viktor's API using `x-api-key`. The upstream API enforces test ownership.
7. Our server validates and transforms the response into permitted analytics fields. The browser receives the report dataset, never the API key or signing secrets. Report navigation retains the test ID in the URL. The All playtests view uses the same authorization to list that client's tests.
8. After session expiry, the person opens a new link from the Portal. Dashboard Sign out clears the cookie and report state. Returning to a hidden tab reloads and revalidates the report.

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Playlytix Portal
    participant D as Dashboard Next.js server
    participant A as Playlytix API
    B->>P: Sign in and click Open Dashboard
    P-->>B: Short-lived signed launch URL
    B->>D: /tests/32?token=...
    D->>D: Verify launch; sign two-hour session
    D-->>B: HttpOnly cookie + redirect to /tests/32/overview
    B->>D: Get session metadata, then authorized report
    D->>A: GET /tests/32/responses with client's x-api-key
    A-->>D: Owned test data, or 404
    D-->>B: Validated analytics data, or safe error
```

## Which secret does what

| Credential | Stored by | Purpose | Effect of changing it |
| --- | --- | --- | --- |
| `DASHBOARD_SSO_SECRET` | Portal backend and dashboard server | Verify that a launch link was signed by the Portal | Links signed with the old value stop working; already-issued dashboard sessions remain valid |
| `DASHBOARD_SESSION_SECRET` | Dashboard server only | Sign and verify the two-hour dashboard session cookie | Existing dashboard sessions become invalid and users must relaunch |
| Each value in `PLAYLYTIX_CLIENT_KEYS` | Dashboard server, with corresponding key managed upstream | Fetch data for that client | Requests must use the replacement key accepted by the upstream API; changing an API key does not itself invalidate the dashboard cookie |

The dashboard session secret is a stable random deployment credential, not a token generated for each user. Generate a separate value for each environment; keep it unchanged across normal deployments. It must contain at least 32 characters and must differ from the shared launch secret. The implementation uses HMAC-SHA256 to sign the cookie. The cookie is signed, not encrypted: it contains only `clientId`, `issuedAt`, `expiresAt` and a random `sid`, with no API keys or dataset. Browser JavaScript cannot read the HttpOnly cookie, although the session endpoint intentionally returns those non-secret claims.

Viktor does not need the dashboard session secret. We need to agree only the shared launch secret and launch contract with him. Never place real credentials, passwords or live launch URLs in these docs, issue reports or committed files.

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

Client keys authorize client-wide access, consistent with the signed client-only payload. They do not implement per-user or per-test membership restrictions. The token is replayable until expiry. Portal logout does not revoke an existing dashboard session immediately. Session expiry, rotating `DASHBOARD_SESSION_SECRET`, or removing the client from our key map prevents further authenticated requests. Rotating the launch secret or a client API key does not itself invalidate an existing dashboard cookie. Agree these semantics before production.

Production cookie: `__Host-playlytix-session`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain. Development cookie: `playlytix-session`, with the same options except Secure=false for local HTTP. The browser Max-Age and server-enforced lifetime are both 7,200 seconds. The lifetime is fixed, not extended by browsing. An already-expired launch is rejected even within the 30-second allowance; that allowance only applies to how far ahead its expiry can be.

## Routes and source files

| Area | Source | Responsibility |
| --- | --- | --- |
| Launch verification, session signatures and env validation | [portalAuth.ts](../lib/server/portalAuth.ts) | Shared auth primitives and cookie options |
| Launch endpoint | [launch route](../app/auth/launch/route.ts) | Verify launch, issue cookie, return clean 303 redirect |
| Request routing | [proxy.ts](../proxy.ts) | Forward legacy launch URLs, redirect unauthenticated pages, rewrite scoped report URLs and block unavailable pages |
| Sensitive-handler guard | [requestAuth.ts](../lib/server/requestAuth.ts) | Reject unauthorized requests and disable legacy API handlers in Portal mode |
| Session API | [session route](../app/api/portal/session/route.ts) | GET session claims; DELETE cookie with same-origin check |
| Test list and report APIs | [list route](../app/api/portal/tests/route.ts), [test route](../app/api/portal/tests/[id]/route.ts), [portalApi.ts](../lib/server/portalApi.ts) | Authorize requests, select key, fetch upstream and translate errors |
| Analytics adapter | [mapper.ts](../lib/playlytix/mapper.ts) | Validate payload, allowlist fields, normalize demographics and scores |
| Browser session lifecycle | [PortalBoundary.tsx](../components/layout/PortalBoundary.tsx) | Load data, clear expired/replaced sessions and coordinate tabs |
| Memory-only Portal storage | [store.ts](../lib/store.ts), [portalBrowser.ts](../lib/portalBrowser.ts) | Skip Portal persistence and remove the legacy localStorage dataset |
| Report navigation | [ReportLink.tsx](../components/layout/ReportLink.tsx) | Preserve `/tests/<id>` on report links |
| Local launch simulator | [portal-launch.mjs](../scripts/portal-launch.mjs) | Generate short-lived localhost links without a public token-generation endpoint |

Next.js rewrite detail: the launch handler also extracts the test ID from the original `/tests/<id>` path because the incoming Request URL may remain unchanged after a Proxy rewrite. Keep that fallback if routing is refactored. Authorize data in the handlers, not solely in Proxy or layouts.

## Troubleshooting

### Temporary preview diagnostics

Set the server-only variable `PORTAL_DEBUG=true` in the intended Vercel Preview environment and deploy the diagnostic code. Environment changes require a new deployment; check any branch-specific overrides. Ask Viktor to click Open Dashboard again to generate a fresh link.

Look in Vercel runtime logs for `[portal]` entries (include Info-level logs). These are server console logs, not browser console logs. In browser Network, inspect the launch request's `x-portal-debug-id` response header and search for that `requestId` in the logs. Each handler invocation has its own ID; Proxy and session-validation entries have separate IDs. No token, cookie, session ID, API key, full URL, upstream body, or arbitrary error message is logged. Authentication rules and public errors are unchanged.

The successful launch stages are `received`, `launch_verified`, `session_issued`, and `redirect_ready`. Failures name the stage and a reason:

| Reason | Check |
| --- | --- |
| `DASHBOARD_SSO_SECRET_MISSING_OR_TOO_SHORT` | Shared secret must be present and at least 32 characters. |
| `TOKEN_SIGNATURE_MISMATCH` | Portal and dashboard must use exactly the same secret and HMAC-SHA256 over the base64url payload. Check accidental whitespace/quotes and whether either side decodes the secret differently. |
| `TOKEN_MALFORMED`, `TOKEN_PAYLOAD_INVALID_JSON`, `TOKEN_CLAIMS_INVALID`, `LAUNCH_CLAIMS_INVALID` | Check the documented token format and numeric client ID/Unix-seconds expiry. |
| `LAUNCH_EXPIRED` | Generate a fresh link; compare logged `serverTime`, `expiresAt`, and `remainingSeconds`. |
| `LAUNCH_EXPIRY_TOO_FAR` | Expiry must be no more than 330 seconds ahead of the dashboard clock. Check milliseconds, Portal TTL and clock drift. |
| `CLIENT_KEYS_INVALID_JSON`, `CLIENT_KEYS_INVALID_CONFIGURATION` | `PLAYLYTIX_CLIENT_KEYS` must be a nonempty JSON object with positive integer keys and values at least 32 characters long. Paste the JSON object directly into Vercel without shell-style outer quotes. |
| `CLIENT_NOT_CONFIGURED` | Add the signed client ID to the key map. The client ID is distinct from the test ID in the path. |
| `DASHBOARD_SESSION_SECRET_MISSING_OR_TOO_SHORT`, `SESSION_SECRET_MUST_BE_SEPARATE` | Set a dashboard-only secret at least 32 characters long, different from the shared launch secret. |
| `SESSION_COOKIE_MISSING`, `SESSION_INVALID_OR_EXPIRED` | Inspect cookie presence after redirect and relaunch if needed. |
| `SESSION_HEADER_MISMATCH` | The tab's session header does not match its cookie; reopen the test. |

API logs show `session_verified`, `upstream_fetch`, `upstream_response` with the upstream HTTP status, and `completed` with the dashboard status. Exceptions identify `api_configuration`, `upstream_fetch`, `read_upstream_body`, `parse_upstream_json`, `game_configuration`, or the data mapping stage. `UNEXPECTED_ERROR` intentionally suppresses arbitrary exception text; the stage identifies which configuration or payload to investigate. An upstream 401/403 points to API-key/access configuration after launch authentication has already succeeded.

Disable `PORTAL_DEBUG` and redeploy when testing is finished. Hosting access logs may separately record incoming query strings; this application logger does not control their redaction.

Start by identifying the failing stage in the browser Network panel: launch, session, test list, or test data. Record the deployment/environment, time, route without its token query, HTTP status, and client/test IDs. Do not share Cookie headers, live launch links, API keys or raw profile payloads. Public error messages intentionally do not reveal upstream bodies or detailed configuration errors.

| Symptom | Meaning and checks |
| --- | --- |
| Demo data, Excel upload, or a Basic-auth prompt appears | Verify `PORTAL_MODE` is exactly `true` on the deployment being visited. Restart the local server after env changes, or redeploy with the intended Vercel environment. |
| Launch returns 401 / invalid or expired link | Click Open Dashboard again. Verify matching shared secrets, numeric `{d,e}` claims, Unix seconds rather than milliseconds, encoded-payload signing, clocks, and a configured client. Also verify the separate session secret is present, at least 32 characters and not equal to the shared secret: session issuance failures currently use the same generic launch error. |
| Launch returns 400 | The test ID must be a positive integer written as digits. |
| Redirect to `/portal-entry` or session endpoint returns 401 | Cookie is missing, invalid, expired, signed with an old session secret, or its client is no longer configured. Inspect the launch Set-Cookie header and subsequent request's cookie presence without copying values. Use HTTPS in production and a consistent hostname. |
| Session works but a manual test API call returns 409 | Send `x-portal-session` equal to `sid` from the current session endpoint. This is a session-consistency check, not an alternative credential. A replaced cookie with an old tab's sid must be rejected. |
| A report returns 404 | Upstream test is absent or not owned by the selected client. Confirm test assignment with Viktor. Do not try a different client's key as a fallback. |
| API returns 429 | Upstream rate limiting. Wait and retry rather than repeatedly reloading. |
| API returns 502 | Check the configured HTTPS base URL (including `/api`), key validity, reachability, upstream redirects/errors, timeout and response size. Upstream 401/403/5xx errors are deliberately translated to 502. A malformed payload or invalid game-map configuration also produces 502. |
| API returns 200 upstream but dashboard returns 502 | Inspect a sanitized fixture against the mapper: `{tests: [...]}` for the list; matching `test.TestID`, arrays of questions/responses/answers/files, unique IDs, valid answer references and dates, and `stats.totalResponses` matching the number of submissions. Demographics may be strings or arrays of strings. |
| Report has no game-specific categories/KPIs | This is the neutral fallback. Add a reviewed `clientId:testId` entry to `PLAYLYTIX_TEST_GAME_MAP` using an existing game config ID; do not guess from test names. A nonexistent config ID causes 502 rather than fallback. |
| Registry, upload or builder is unavailable / returns 403 | Expected Portal policy, not a bad API key. Authenticated Portal sessions can use AI analysis and themes. Basic credentials do not override Portal policy. |
| Sign out returns 403 | DELETE `/api/portal/session` requires Origin to match the request origin. Use the same-origin UI and check custom proxy/hostname configuration. Expired sessions can return 401 from Proxy before the logout handler. |
| Report clears when changing tabs, or reports session change | Hidden tabs intentionally clear their dataset and reload on return. Session checks also run on focus and every 15 seconds; BroadcastChannel announces replacements and logout. A failed session check, including a network error, clears the report. |
| Upstream edits are not visible yet | Report data is fetched on load/test change, not streamed continuously. Reload to fetch fresh data. The 15-second polling checks session validity, not report updates. |

## Adding clients, rotating secrets and recovery

To add a client, obtain its client-scoped key from Viktor and add it to the existing JSON map while preserving other clients. The map must be a nonempty JSON object with positive-integer string keys and API-key strings at least 32 characters long. Configure a game mapping only if needed, apply the environment change, then test a fresh launch, own-test access and cross-client denial. No Portal password is stored by the dashboard.

For routine deployments, retain the session secret so active sessions keep working. To invalidate all sessions, generate a new session secret and deploy it consistently to every serving instance. Users must then launch again. To disable one client, remove its map entry; subsequent requests fail session validation once the updated configuration is serving. Previously rendered or exported data cannot be withdrawn.

Coordinate API-key rotation with Viktor so our configured value matches the upstream value. Coordinate launch-secret rotation on both systems; there is no old/new secret overlap mechanism. Changing only one side breaks new launches. For Vercel, configuration changes require a new deployment; ensure the hostname points at the intended deployment when validating recovery.

If rolling back application code, use a revision that retains Portal authorization and keep `PORTAL_MODE=true`. An older pre-integration revision does not understand this setting and may restore public demo/internal routes. Do not treat reverting to that revision as a safe client-facing rollback.

## Implemented behavior

- Protected launch/session/list/test routes; authorization repeated at each data handler. A session ID request header prevents an old tab from fetching through a replaced cookie.
- Server-side per-client keys, no-store requests/responses, redirect rejection, 20-second timeout and 20 MiB response limit. Malformed/incomplete payloads fail safely.
- Browser receives an allowlisted analytics DTO. Raw identities, Steam profiles, payment fields, comments, attachment names and signed attachment URLs are omitted. Answer text can itself contain information entered by testers.
- Portal datasets live in memory; legacy localStorage dataset is cleared. Hidden tabs clear their dataset and reload on return. BroadcastChannel, polling, focus checks and expiry timers invalidate changed/expired sessions. Previously downloaded data cannot be withdrawn.
- Report URLs retain test context. Known game rules require an explicit client/test configuration map; unknown tests use neutral analytics with a visible explanation. No mock fallback.
- Counts represent submissions, not deduplicated people. Total submissions include empty/file-only rows; answer-based charts count submissions with answers. Files are viewed in the Portal.
- Global tester registry APIs remain disabled for Portal clients, including direct calls. Authenticated Portal sessions can use AI analysis and the themes page. Upload, settings, and builder pages remain unavailable. Report changes are not persisted. This reflects the current policy; the September 14 validation below predates Portal AI support.

## Verified QA facts and remaining release checks

September 14 validation: 182 unit/route tests passed, all four live QA/browser checks passed, lint passed, and the production build passed. Browser checks cover report loading, scoped navigation, reload, logout, cross-client API denial and stale-tab invalidation. A scan of 516 generated development/production browser assets found none of the configured client keys or signing secrets. These checks used locally generated launch tokens, not the real Portal button.

Both supplied client keys successfully listed tests. Client 18's test 32 and client 2's test 28 returned 200 with their own keys; both cross-client requests returned 404. The live test list is wrapped in `{tests: [...]}`. Live profiles include more fields than the saved reference; additional fields are deliberately ignored.

Before production, obtain:

1. The stable dashboard Vercel hostname and the intended deployment environment; Viktor must point Open Dashboard to that hostname.
2. One actual Portal-generated launch and confirmation of the signature contract/client-wide scope above. Supplied account credentials can be used for this once the Portal button targets the dashboard.
3. Production API base URL and production credentials if this is to go live beyond QA.
4. The correct game/questionnaire mapping for real playtests if game-specific categories, score direction and KPIs are required. QA demo tests currently use neutral analytics.

Verify hosting logs redact token query strings, real Portal → dashboard navigation works, and production HTTPS cookies are set before release. Do not log tokens or put secrets in committed configuration. Deployments without `PORTAL_MODE=true` retain the existing internal/demo workflow; configure this variable explicitly on every client-facing deployment.
