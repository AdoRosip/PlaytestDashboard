# Portal API integration: review and implementation plan

Reviewed 2026-09-10. This is a repository review and proposed implementation plan, not a deployed integration.

Preserved on `planning/playlytix-api-integration` on 2026-09-11. Start with [the handoff checklist](portal-api-integration-handoff.md) when resuming; it includes the local testing strategy and the minimum request to Viktor. The checkout/branch descriptions below describe the original review, before creating this planning branch.

## Recommendation

Proceed with Viktor's proposed architecture: a short-lived signed Portal launch link creates a dashboard session; the Next.js server uses a client-specific API key to fetch that client's data. This is a viable first release without another login system or a new database.

The existing integration branch contains useful prototype code, but it is not ready for client access. Reuse its API adapter on a branch based on the current dashboard, then implement authorization, safe data handling, and test-scoped navigation before connecting real clients.

The larger work is making the current single-dataset dashboard safe and accurate for multiple clients. The HMAC verification function is only a small part of that.

## What was reviewed

| Source | What it establishes |
| --- | --- |
| [API reference](../../api-reference.html) | Saved contract dated July 8: QA URL, `x-api-key`, three GET endpoints, question types and example response. |
| [Actual integration brief](../../Portal%20%E2%86%94%20Dashboard%20%E2%80%94%20Integration%20Brief_files/saved_resource.html) | The content inside the saved HTML wrapper: July 28 proposal, HMAC launch, local session, per-client keys, proposed ISR. |
| [Earlier architecture review](../../PORTAL_DASHBOARD_INTEGRATION_README.md) | An alternative proposal using Portal-issued Bearer sessions; useful data/privacy discussion, but not evidence that Viktor implemented those endpoints. |
| [Earlier feature review](../../DREADME.md), [data architecture](data-architecture.md), current source | Historical context; some architecture descriptions and test counts are outdated. Current source takes precedence. |
| `feature/playlytix-api-integration`, commit `46e9f98` | One integration commit, dated July 24, eight changed/added files, 750 added lines from its common ancestor. |
| `portal-poc`, tip `7a16425` | A different July prototype: Supabase login, accounts, roles, published reports, and tester profiles. |

Current checkout: `button-removal` at `82b3ec4`; local `master` and cached `origin/master` point to `8218c39`. The integration branch is missing 14 commits present in the current checkout and has one unique commit. Its local and cached remote-tracking tips match. Remote branches were not fetched, so this does not establish their current state on GitHub.

Only this review document was added. No application code, branch checkout, secrets, databases, or deployments were changed. The pre-existing untracked `.claude/` directory was left alone. No authenticated requests were made to the live API. Historical claims in the earlier review about working QA credentials are not fresh verification.

## What already exists on the integration branch

Paths below refer to `feature/playlytix-api-integration`, not files currently present on `button-removal`. Inspect them with `git show feature/playlytix-api-integration:<path>`.

| Branch file | Existing behavior | Assessment |
| --- | --- | --- |
| `lib/playlytix/client.ts` | Server-only API client, one `PLAYLYTIX_API_KEY`, QA fallback URL, `no-store`, basic error handling; helpers for listing tests and fetching responses. | Reusable skeleton. Needs session-derived key selection, explicit production configuration, timeout, runtime decoding, and safe error translation. |
| `lib/playlytix/types.ts` | Types for the saved `{ test, questions, responses, stats }` payload. | Useful starting contract; TypeScript assertions do not validate incoming JSON. |
| `lib/playlytix/mapper.ts` | Maps to the Excel parser's `ParseResult`, classifies questions, skips section headers, computes scores and tester quality. | Reuse selected transformation logic. Fix identity, privacy, game resolution, current quality rules, and unsupported types. |
| `app/api/playlytix/tests/[id]/route.ts` | Validates a numeric ID, fetches upstream, returns the entire payload. | No handler-level visitor/session check, despite its “authenticated proxy” comment. Keeping the key server-side alone does not protect this endpoint. |
| `app/tests/[id]/page.tsx` | Browser fetch, game-name guessing/manual override, registry enrichment, store load, automatic redirect to `/overview`. | Prototype entry flow. Does not verify a launch token or create a session; loses test context in the URL. |
| Mapper/game tests | Seven mapper tests and game-resolution tests. | Useful fixtures, not security or full integration coverage. |

Do not merge `portal-poc` wholesale into this effort. It implements an additional identity/report-publishing product and would duplicate responsibilities Viktor's Portal already owns. Selected navigation/hydration patterns could be inspected later if useful.

## What Viktor's Slovak message means

He distinguishes two separate checks:

1. **Which people may view the dashboard:** the Portal authenticates the person and signs a client identifier and time value into a launch link. Our server verifies it locally and creates its own session lasting two or three hours. The five-minute expiry applies to starting a session, not to the resulting browsing session.
2. **How our server reads data:** the API key stays in server environment variables. The browser never receives it. A `clientId -> API key` configuration map selects the right credential. A compromised key can be replaced for that client.

“You don't need a backend” is accurate only as “you don't need an additional standalone backend.” Secret verification, HttpOnly cookie issuance, and secret-bearing API calls must run on the Next.js server. A static/browser-only implementation cannot keep those secrets.

The older README's Portal Bearer-session approach is also possible, but requires a different backend contract. Per-client keys do not inherently require a database. For a small initial customer set, server configuration is a reasonable operational choice; provisioning and rotation still need a documented process.

## Findings to address before release

### 1. Visitor authentication and client isolation are not implemented

The branch selects one deployment-wide key and exposes a data-fetching route without checking a visitor session. Current [requestAuth.ts](../lib/server/requestAuth.ts) also allows requests unless `DASHBOARD_AUTH_ENABLED` is exactly `true`; when enabled, it is shared Basic authentication, not client authorization.

A visitor might never learn the upstream key yet still use an unprotected dashboard endpoint to make our server fetch data for them. The effective scope would be whatever the configured key can read. A valid client session, protected cookie integrity, and upstream ownership enforcement are all required.

The saved July 8 reference describes “every test” and a server key. The later brief promises per-client keys and cross-client `404`s. Viktor's message supports the later design, but actual isolation must be demonstrated using two QA clients before release.

### 2. Existing registry and AI routes need explicit policy

All four AI routes currently accept browser-provided analysis inputs and use the optional Basic guard. The two registry routes also use that guard. [The registry query](../lib/supabase/testers.ts) selects records by email without a tenant filter, using a service-role key that bypasses RLS.

Portal sessions must not grant access to global registry import or arbitrary email lookup. Disable those routes in the client deployment, or retain them only in a separately authorized internal workflow. Remove the branch's `enrichTestersFromRegistry()` call for Portal datasets.

AI requests should identify the authorized test and selected question/response IDs or filter criteria. The server should retrieve and validate those inputs against the authorized dataset before invoking the model. Add request-size limits and per-client usage limits. Disabling AI in the initial client release is an acceptable alternative if this is not ready.

### 3. The browser can retain the previous client's dataset

[store.ts](../lib/store.ts) persists project, testers, answers, themes, and AI results under one shared `playtest-dashboard-v1` localStorage key. [DashboardShell.tsx](../components/layout/DashboardShell.tsx) loads mock data whenever nothing is loaded.

For Portal mode, hydrate data only after session authorization, use memory-only data storage, and remove the legacy persisted dataset during migration. Reset datasets, overlays, filters, and pending AI work on client/test changes and session expiry. No mock fallback on an API error or empty test.

The current store's generation guard helps with theme requests, but all pending fetches/AI results need a client/test generation check. In a shared browser, opening Client B changes the host cookie for every tab: Client A tabs must clear/revalidate when a session change is detected and on focus restoration or browser Back, before resuming interaction. Coordinate logout across tabs too. A cookie replacement cannot instantly withdraw content already rendered in another tab, and previously viewed/downloaded information cannot be retroactively revoked.

### 4. The data model has material gaps

| Gap | Impact and proposed treatment |
| --- | --- |
| No `gameId` in the documented test payload | The branch guesses from the name and otherwise uses the default game. Incorrect category rules, KPI matches, and score direction can produce misleading analytics. Prefer Portal `gameId`/questionnaire version; a reviewed server-side test-to-config map is an initial fallback. Unknown games need a neutral unsupported/configuration state. |
| Only six documented question types | Current dashboard also supports yes/no, multiple choice, and 1–10 scales. Confirm what the current API sends. Decode unknown types explicitly; do not silently interpret them as free text. Preserve question descriptions and scale metadata. |
| `responseId` identifies a submission, not a person | Branch creates one “tester” per submission. Unique-person counts are unjustified if repeat submissions exist. Obtain a test- or organization-scoped pseudonymous tester ID, or report submissions and document the limitation. |
| File-only submissions have no text answers | Branch retains files only in raw profile data; counts derived from flattened answers omit these submissions. Define participant/submission/answer counts separately and handle empty/file-only cases. |
| Raw profile spreading and full upstream forwarding | Emails, payouts, comments, files, signed URLs, and future additive fields reach browser state. Construct an allowlisted analytics DTO on the server; do not spread raw profiles. |
| Current profile features use `genres` and `playstyles` | Branch maps `gamerType`/`gamingPreferences` to other segment keys. Confirm equivalent meanings and map explicitly; missing fields should appear unavailable, without restoring global email enrichment. Other registry-only demographics may also be absent. |
| Quality calculation changed since the branch | Current store excludes configured background categories for quality calculations; branch mapper does not pass those exclusions. Align initial API loading with current Excel/scoring behavior. |
| IDs and categories are not fully scoped | Namespace project, question, submission, tester and answer IDs by client/test as appropriate; clone categories with the actual project ID rather than reusing `proj_import`. Keep stable IDs across refreshes for evidence links. |

A normalized Portal `testers/submissions/answers` bundle would improve the contract, but is not a prerequisite for the first integration. The existing nested payload can be adapted. Stable identity is a prerequisite specifically for trustworthy unique-tester or cross-playtest metrics, unless the backend guarantees one submission per tester per test.

### 5. The brief's security and caching shorthand needs correction

- The signed launch URL is itself a short-lived bearer credential. It contains no API key, but anyone holding it during its validity window can start a session. Redact query tokens from logs, avoid third-party resources on the launch route, set `Referrer-Policy: no-referrer`, and immediately redirect to a clean URL. Redirecting does not remove credentials from logs that already recorded the initial request.
- “Single-use in spirit” is not single-use enforcement. Stateless HMAC verification permits replay until expiry. True one-time redemption requires shared state or a Portal exchange endpoint.
- A locally issued stateless session cannot instantly track Portal logout, removed memberships, or individual revocation. Propose a fixed two-hour maximum with no automatic sliding extension; agree this limitation. Immediate per-user revocation requires additional Portal/session support.
- A forged client identifier in an unprotected session could select another client's API key. Upstream client-scoped keys do not repair a forgeable dashboard session. Use a signed or authenticated-encrypted cookie, never a plain client ID cookie.
- The sample `timingSafeEqual` call can throw for mismatched lengths. Validate token shape, encodings, lengths, claim types, time bounds, and configured client before accepting it. Agree exact signed bytes and use shared positive/negative test vectors.
- ISR is not “every view reads live data” and can serve stale output. Start with dynamic authorized requests, upstream `cache: 'no-store'`, and `Cache-Control: private, no-store` for data/session responses. Revisit short caching only with explicit client/test keys and authorization before every cache return. Never include temporary file URLs in durable caches.
- CORS is not visitor authentication and does not prevent curl. Protect dashboard routes even when the upstream has no CORS support.

## Proposed end-to-end flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Playlytix Portal
    participant D as Dashboard Next.js server
    participant A as Playlytix API
    B->>P: Log in and open an authorized test
    P-->>B: Launch URL with short-lived signed claims
    B->>D: GET /auth/launch?testId=28&token=...
    D->>D: Verify signature, time, client and scope
    D-->>B: Secure HttpOnly session cookie + clean redirect
    B->>D: GET /tests/28/overview with cookie
    D->>D: Verify session; choose this client's key
    D->>A: GET /tests/28/responses with x-api-key
    A->>A: Enforce key's client owns test 28
    A-->>D: Authorized payload or 404
    D->>D: Validate, allowlist and normalize
    D-->>B: Analytics data and dashboard
```

The exact launch path is negotiable. Prefer a dedicated `/auth/launch` handler so cookies are set in a Route Handler and the `/tests/[id]` page remains a normal page. If Viktor retains `/tests/[id]?token=...`, route that handoff to the launch handler before page rendering. Do not add `route.ts` beside `page.tsx` at the same route; Next.js does not allow that combination.

Baseline access scope: organization-wide, because the current proposed signed payload is `{ d: clientId, e: expiresAt }` and the API key is client-scoped. The path's test ID is not signed. If users may see only selected tests, Viktor must sign that scope (and ideally the target test) and the dashboard must enforce it. This cannot be inferred safely from the current message.

## Implementation sequence and acceptance gates

### Phase 1 — Confirm the contract and prepare fixtures

Owner: dashboard developer + Viktor.

Confirm the questions below, exchange dummy-secret signature test vectors and sanitized payload fixtures, and record the accepted contract. Refresh remote branch refs when implementation starts; create a new integration branch from the then-current approved dashboard base. Bring over selected parts of `46e9f98`, preserving recent UI and analytics fixes.

**Gate:** two distinct QA clients/test IDs and per-client credentials are available through a secure channel; token bytes/claims and scope are unambiguous. Local fixture work can proceed while these are supplied.

### Phase 2 — Implement launch, sessions, and route protection

Suggested files: `lib/server/portalLaunch.ts`, `lib/server/dashboardSession.ts`, `app/auth/launch/route.ts`, session-status/logout handlers, and updates to `lib/server/requestAuth.ts`/`proxy.ts`.

Keep launch HMAC verification and local session signing on the server. Use a maintained session/token library for the local cookie, with a separate dashboard-only session secret. Store only verified client/scope, issuance and expiry metadata, and an optional non-secret session identifier. No API key or dataset in the cookie.

Cookie target: `__Host-playlytix-session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no Domain, and a two-hour lifetime enforced server-side as well as by cookie expiry. Use environment-separated secrets. Missing configuration must fail closed in Portal mode. Unknown clients must not fall back to a shared QA key.

Protect data access and each sensitive handler directly; Proxy is useful for early redirects, not the sole authorization layer. Session expiry should produce a clear return-to-Portal state. Logout clears cookies and in-memory data; state-changing and paid AI requests need same-origin/CSRF protection. The external launch route follows its separate signed-handoff policy.

**Gate:** invalid/missing/expired/forged sessions cannot invoke data or paid services; global registry routes are inaccessible to Portal clients.

### Phase 3 — Harden the server API adapter

Suggested files: `lib/playlytix/config.ts`, `client.ts`, `schema.ts`, `mapper.ts`, and a shared authorized test loader such as `lib/server/loadAuthorizedTest.ts`.

Configuration could use `PLAYLYTIX_API_BASE_URL`, `PLAYLYTIX_CLIENT_API_KEYS_JSON`, `DASHBOARD_SSO_SECRET`, and `DASHBOARD_SESSION_SECRET`. These are proposed names, not configured credentials. Validate the fixed HTTPS upstream origin; never take an upstream URL or credential choice from browser input. Avoid forwarding credentials through unreviewed redirects.

Select keys only from the verified session. Add timeouts/abort behavior, bounded payload handling, schema validation tolerant of additive fields, and sanitized errors. Distinguish an expired dashboard session (`401`) from an upstream API-key rejection (operator configuration problem). Handle inaccessible/not-found tests, throttling, and upstream failures with useful client messages and secret-free operator logs.

Use one server loader from pages and any browser refresh endpoint; server-rendered pages need not call our own HTTP endpoint. Return only the normalized, permitted analytics data.

**Gate:** Client A cannot fetch Client B's tests by changing path, body, query, cookie claims, or IDs. No upstream key, raw private profile, or payout data appears in browser responses or bundles.

### Phase 4 — Integrate routing and the existing analytics UI

Add `/tests/[id]/overview`, categories/details, questions/details, testers, responses, and permitted theme/export pages. Extract reusable page contents from the existing dashboard routes as needed. Update every sidebar, evidence, tester, and drill-down link to preserve test context.

Introduce a source-neutral dataset loader instead of depending on the `loadFromExcel` name. Hydrate a store scoped to the authorized client/test; remove Portal data persistence and legacy rehydration. Validate session/scope on refresh and visibility restoration, cancel stale requests, and coordinate session changes across tabs. Support reloads and deep links without first visiting an importer.

Replace the game's name guess/auto-redirect with deterministic configuration. Show missing demographics or unsupported configuration honestly. Do not expose registry/import/builder/admin settings merely because a navigation button was removed. Retain Excel/demo use only behind an explicit separate internal/demo access policy.

Decide where category/scoring edits live: client viewers can use read-only server configurations for the first release. If edits must survive reloads or be shared, they require a scoped persistence feature; removing localStorage otherwise loses those edits.

**Gate:** representative API fixtures render correct scores, counts, filters, question detail, tester labels, and evidence; reload/Back/test switch/client switch never shows the previous dataset or substitutes demo data.

### Phase 5 — Finish allowed AI, exports, and deployment operations

Rework the four AI endpoints to use authorized test data and stable evidence IDs. Keep derived AI data in memory initially; if automatic generation would become expensive on refresh, make generation explicit or add a separately scoped server cache keyed by client, test, dataset revision, analysis inputs and prompt/model version. Do not silently retain the old global browser cache.

Keep the payout/Tremendous endpoint outside analytics scope. Review existing browser-generated exports for identity fields and spreadsheet formula handling. Add attachments/comments only when their display, privacy and link-refresh contract is explicit; they need not block text/rating analytics.

Document client onboarding, per-client key rotation/removal, shared-secret rotation, QA/production separation, logging redaction, session expiry, and rollback. Env maps are acceptable initially; customer onboarding and rotations typically need a deployment/configuration rollout. Rotating a client's upstream key does not inherently revoke that client's existing dashboard sessions if the map is updated; use a client session-version/disable mechanism for emergency client-wide invalidation if required. These operational changes take effect after configuration reaches all instances.

**Gate:** preview deployment passes the matrix below with two QA clients. Production credentials/URL and Portal launch target are confirmed. Release only after those gates, with Portal mode remaining closed if configuration fails. A rollback must not expose the old public data proxy.

## Release verification matrix

| Area | Required checks |
| --- | --- |
| Launch | Valid vector; altered client/time/signature; missing fields; malformed JSON/base64; wrong signature length; unknown client; expired/excessively future timestamp; agreed replay behavior; clean redirect without arbitrary external destination. |
| Session | Tampering rejected; correct cookie flags; server-side expiry; launch expiry independent of session expiry; no anonymous bypass when config is missing; logout/expiry clears UI; cross-origin/CSRF requests rejected for logout and paid AI operations. |
| Isolation | Two clients with overlapping-shaped fixtures; cross-client test/list/AI/export requests denied; warm-cache attempts denied; global registry match/import denied; client switch in another tab handled. |
| Mapping | Empty tests; missing answers; file-only submission; duplicate/unknown IDs; repeated submissions; question order; 1–5/inverse scoring; unsupported types/scales; malformed API body; anonymous tester with unexpected identity fields; unknown game. |
| Analytics | Expected submission/person/answer denominators; current quality exclusions; category/KPI mapping; demographic filters; evidence links; profiles with absent genres/playstyles. |
| Browser data | No secrets/private upstream fields in JSON/HTML/bundles; no Portal datasets/AI results in localStorage; old storage migrated; reload, Back, focus, expiry and client/test switch do not revive stale data. |
| Reliability | API timeout, bad JSON, `401` upstream key rejection, `404`, `429`, `5xx`, incomplete datasets/pagination, and session expiry during load/AI. |
| Deployment | Token query redaction checked in actual hosting logs; no public data caching/ISR; no mock fallback; production fails closed; key rotation/disable and rollback rehearsed. |

Baseline verification during this review: `npm.cmd test` passed **16 test files / 150 tests** on `button-removal`. The historical integration branch was inspected with `git show`; its tests and production build were not run. The current unit suite does not establish live API isolation or browser/session behavior. Implementation should add meaningful auth/adapter tests and browser coverage, then run the full suite, lint, and production build.

## Questions to send Viktor before wiring the live integration

1. Can you send the exact signing/verifying function plus a dummy-secret token test vector? Is the payload still base64url `{d,e}` signed as its encoded string with HMAC-SHA256, or separate `clientId/time/signature` parameters? Seconds or milliseconds, maximum age and allowed clock skew?
2. Does a launch grant every test owned by the client, or only the selected test? Can a user belong to multiple clients, and can different people within one client have different test permissions?
3. Are per-client keys active now on QA for both `/tests` and `/tests/:id/responses`? Can we obtain two isolated QA clients with example tests and prove that A's key gets `404` on B's test? Is the previously supplied QA key global?
4. Is a fixed two-hour dashboard session acceptable, with launch replay possible for five minutes and no immediate per-person Portal logout/revocation? If not, which one-time exchange/session validation capability can the Portal provide?
5. What are the current production and QA base URLs, key-delivery/rotation process, rate limits, pagination/maximum payload expectations, and error contract?
6. Can the payload include stable `gameId`/questionnaire version, complete question type/scale metadata, and a pseudonymous tester reference? Can the same tester submit multiple times, and are edits/deletions reflected in subsequent fetches?
7. Which profile fields are approved for analytics, especially genres/playstyles and any Steam-derived aggregates? Can emails, payment data and unrelated private identities be excluded upstream? Are comments and attachments part of the first release?
8. Can you provide an updated schema and a sanitized fixture covering every supported question type, an anonymous tester, repeat/empty/file-only submissions, and missing optional data?

These questions can be sent together. They are contract dependencies, not reasons to delay local session, adapter, and fixture work. No message has been sent on the user's behalf.

## Technical references

Implementation conventions were checked against the installed Next.js 16.2.6 guides in `node_modules/next/dist/docs/`: Route Handlers, Proxy, authentication, data security, and cookies. These confirm async cookie access, Route Handler cookie issuance, and authorization near data access rather than relying on a layout or Proxy alone. See also the [official Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication).

The cookie flags, server-enforced expiry, and treatment of credentials in URLs are consistent with [OWASP's session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The specific two-hour lifetime and acceptance of five-minute launch replay are proposed product tradeoffs, not mandates from those sources.
