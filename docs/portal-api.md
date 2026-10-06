# Playlytix Portal API: QA and production guide

Last consolidated: **2026-09-30**, against the `prod-ready-preparation` working tree, the supplied Portal API v2 reference, and the separately supplied key-generation function. This is the main setup and operations guide for this dashboard. No real secrets belong in this document.

## Contents

- [Status and sources](#status-and-sources)
- [QA versus production](#qa-versus-production)
- [Credentials and client key generation](#credentials-and-client-key-generation)
- [Environment configuration](#environment-configuration)
- [Setup and onboarding](#setup-and-onboarding)
- [Login, launch and session flow](#login-launch-and-session-flow)
- [Actual requests and endpoints](#actual-requests-and-endpoints)
- [API v2 data contract](#api-v2-data-contract)
- [What this dashboard currently supports](#what-this-dashboard-currently-supports)
- [Verification and release](#verification-and-release)
- [Troubleshooting](#troubleshooting)
- [Rotation, removal and rollback](#rotation-removal-and-rollback)
- [Implementation map](#implementation-map)

## Status and sources

The branch implements signed Portal launches, dashboard sessions, server-side client-key selection, test fetching, analytics mapping and production configuration validation. **It does not derive keys at runtime or support the entire API v2 payload yet.** See the compatibility table below before onboarding a questionnaire.

As last reported by the dashboard owner, production SSO and master-key credentials have been supplied, but **production developer/client IDs are still awaited**. Without those IDs, the production client-key map cannot be completed. A production test fixture and synthetic configuration checks are not evidence of live production access. Credential installation and deployment status have not been inspected during this documentation update.

Sources, in order of purpose:

| Source | What it establishes |
| --- | --- |
| [Supplied Portal API reference](<../../Playlytix Portal API_files/saved_resource.html>) | Backend contract v2, dated September 7, with API.md snapshot dated September 10, 2026; endpoint scopes, payloads and SSO signing |
| `clientApiKey(masterKey, clientId)` screenshot supplied September 29 | Exact key-derivation function reproduced below; **not present in the saved API reference** |
| Current [server code](../lib/server/portalApi.ts), [configuration](../lib/server/portalConfig.mjs), [auth](../lib/server/portalAuth.ts), [mapper](../lib/playlytix/mapper.ts) | Actual dashboard behavior and current limitations |
| [QA implementation record](portal-setup.md), [production preparation record](portal-production.md) | Dated validation evidence and historical implementation detail |
| [Earlier integration brief](<../../Portal ↔ Dashboard — Integration Brief_files/saved_resource.html>), [older API reference](../../api-reference.html), [parent architecture proposal](../../PORTAL_DASHBOARD_INTEGRATION_README.md) | Background; older proposals are not the deployed runtime contract |

The parent HTML files are local reference artifacts and may not accompany a standalone dashboard checkout. This guide preserves the operational contract needed here. The upstream `API.md` itself is in the Portal repository, not this dashboard.

The saved reference still labels production “not live yet.” That describes its September 10 snapshot, not a verified statement about current availability. Confirm production availability with the Portal team and a scoped request when credentials are ready.

## QA versus production

| Item | QA | Production |
| --- | --- | --- |
| API base URL | `https://qa.playlytix.gg/api` | `https://app.playlytix.gg/api` |
| Portal origin | `https://qa.playlytix.gg` | `https://app.playlytix.gg` |
| Dashboard deployment | Local development or intended Vercel Preview | Intended Vercel Production deployment |
| API credentials received | Finished client ID/key pairs | Master key plus SSO secret; derive client keys once production IDs arrive |
| Client/test IDs | Historical checks: client `18` owns test `32`; client `2` owns test `28` | Obtain actual production ownership; do not copy QA IDs |
| SSO secret | Matches QA Portal | Matches production Portal |
| Dashboard session secret | Independent QA/local secret | Independent production secret |
| Portal dashboard destination | QA Portal's `DEVELOPER_DASHBOARD_URL` points to the QA dashboard | Production Portal's value points to the production dashboard |
| Verification evidence | Live QA checks recorded September 14 | Synthetic configuration/build and fixture checks recorded September 28; live acceptance remains unverified |

Client IDs are Portal **developer user IDs**, the numeric `d` in the launch token. They are not test IDs, tester IDs, client names or email addresses. `TestID: 18` in the production sample identifies a test, not its owner. The historical QA client ID `18` is a separate fact.

QA browser access may require the Portal's passphrase gate. The reference says `/api/*` is exempt: server-to-server API calls require the API key, not the browser passphrase.

## Credentials and client key generation

### Which credential does what

| Credential | Purpose | Where it belongs |
| --- | --- | --- |
| Master key (`PORTAL_API_KEY` on the backend) | Backend admin credential with access to all tests; input to supplied client-key derivation | Portal backend and authorized local provisioning only; this dashboard does not require it in Vercel |
| Derived per-client API key (sometimes called `clientToken`) | Authorizes backend reads for one developer's tests | Value under that developer ID in dashboard `PLAYLYTIX_CLIENT_KEYS` |
| `DASHBOARD_SSO_SECRET` | Verifies the Portal's short-lived launch token | Matching server-only value on Portal and dashboard, for the same environment |
| `DASHBOARD_SESSION_SECRET` | Signs the dashboard's own two-hour session cookie | Dashboard only; independently generated, separate per environment |
| Launch query `token` | Temporary proof of the client identity and expiry | Created by Portal at click time; consumed by dashboard launch handler |
| Portal account login/password | Signs the person into Portal | Portal login UI; not dashboard environment variables |

Both master and client keys work in the backend's `x-api-key` header, but have different authority. **Never put the master key into `PLAYLYTIX_CLIENT_KEYS`.** Mapping a global key under a client ID does not narrow its backend permissions. This dashboard must use derived client keys.

The phrase `clientToken` here means the derived API key when used for provisioning. It must not be confused with the short-lived SSO query token or the dashboard session cookie.

### Exact supplied derivation

This is the function from the supplied screenshot:

```js
const crypto = require('crypto');

function clientApiKey(masterKey, clientId) {
  return crypto.createHmac('sha256', String(masterKey))
    .update('plx-dev:' + clientId)
    .digest('hex');
}
```

It produces a deterministic 64-character lowercase hexadecimal key:

```text
key = HMAC-SHA256(key = masterKey as text, message = "plx-dev:" + clientId), hex encoded
```

- Keep the literal **`plx-dev:`** in both QA and production. Do not substitute `plx-prod:`; it is part of the supplied algorithm.
- Use the actual environment's master key and the canonical positive numeric developer ID, such as `7` or `"7"`, without padding or whitespace.
- Use the master key as text. Do not hex-decode it because it looks hexadecimal, or add quotes/newlines to its value.
- The same master key and ID always produce the same key. The function does not create a Portal account or assign tests; those must exist upstream.
- Production acceptance of derived keys has not been verified here. The screenshot is the derivation source; the saved reference only says Playlytix supplies derived keys out-of-band.

For a **dummy-only demonstration**, run the function above with:

```js
const masterKey = 'dummy-master-key-for-demonstration-only';
const clientIds = [7, 9]; // Illustrative IDs, not assigned production clients.
const keys = Object.fromEntries(
  clientIds.map(id => [String(id), clientApiKey(masterKey, id)])
);
console.log(JSON.stringify(keys));
```

For actual provisioning, run the function locally with the securely supplied master key and confirmed IDs, then transfer the resulting JSON to Vercel. Keep actual secrets out of committed scripts, shell command history, screenshots and shared logs. There is currently **no key-generation CLI in this repo**; `scripts/portal-launch.mjs` creates SSO launch links and does not create API keys.

Generate a separate dashboard session secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save it as `DASHBOARD_SESSION_SECRET` and retain it across normal deployments. It is not regenerated per client or user login.

## Environment configuration

All variables below are server-only. None uses `NEXT_PUBLIC_`. Local development reads ignored `.env.local` in the dashboard root; Vercel reads the values configured for the deployment environment.

| Dashboard variable | QA value | Production value |
| --- | --- | --- |
| `PORTAL_MODE` | `true` | `true` |
| `PLAYLYTIX_API_BASE_URL` | `https://qa.playlytix.gg/api` | `https://app.playlytix.gg/api` |
| `PLAYLYTIX_CLIENT_KEYS` | JSON map of supplied QA IDs/keys | JSON map of production IDs/derived keys |
| `DASHBOARD_SSO_SECRET` | QA shared signing secret | Production shared signing secret |
| `DASHBOARD_SESSION_SECRET` | Independent QA/local random secret | Independent production random secret |
| `PLAYLYTIX_TEST_GAME_MAP` | `{}` unless a reviewed mapping is required | `{}` unless a reviewed mapping is required |
| `PORTAL_DEBUG` | `false`; temporary `true` for diagnosis | `false`; temporary `true` for diagnosis |

Use the [QA template](portal-qa.env.example) or [production template](portal-production.env.example). Templates contain placeholders, not usable credentials.

`PLAYLYTIX_CLIENT_KEYS` must be one nonempty JSON object. Its property names must be positive safe integer IDs without leading zeros; values must be strings of at least 32 characters with no surrounding whitespace. Example shape:

```json
{"7":"<derived key for production client 7>","9":"<derived key for production client 9>"}
```

In Vercel, paste the JSON object directly without wrapping the entire object in shell-style quotes. Preserve existing entries when adding a client. The current dashboard does not read standalone `PORTAL_API_KEY`, `PORTAL_CLIENT_ID` or `PLAYLYTIX_API_KEY` for this integration.

Both signing secrets must be at least 32 characters with no surrounding whitespace. `DASHBOARD_SESSION_SECRET` must differ from `DASHBOARD_SSO_SECRET`. The short dummy SSO secret in the upstream worked example is a cryptographic test vector, not valid deployment configuration for this dashboard.

`PLAYLYTIX_TEST_GAME_MAP` is optional; missing or `{}` selects neutral `portal-generic` analytics. Reviewed overrides use `"<clientId>:<testId>"` as the key and a registered configuration ID as the value:

```json
{"7:18":"wannabe-trashman","9:21":"exovia"}
```

These are illustrative assignments, not real ownership. Do not infer game configuration from the title. It controls categories, score direction and game KPIs; it does not authorize access. The preflight checks map shape, while report loading checks whether values are registered game configurations.

### Vercel behavior and preflight

Scope QA values to **Preview** (with branch-specific overrides if needed) and production values to **Production**. A Git branch name such as `prod-ready-preparation` does not by itself select Vercel Production. Environment changes apply to new deployments, so redeploy after updates. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Use `npm run build` as the build command. Its `prebuild` runs configuration validation when `VERCEL_ENV=production` or `PORTAL_MODE=true`. Keep Vercel system environment variables exposed so the app sees `VERCEL_ENV`. For production:

- Preflight requires `PORTAL_MODE=true`, valid keys and independent secrets.
- The base URL must be exactly `https://app.playlytix.gg/api` (one trailing slash accepted).
- Runtime always enforces Portal authentication when `VERCEL_ENV=production`, even if `PORTAL_MODE` is missing or false. The build still rejects that misconfiguration.
- Run `npm run check:portal-env` for the same checks explicitly. It loads local environment configuration, makes no API requests and prints no credential values.
- Passing preflight proves shape only: it does not prove API availability, key ownership, Portal secret agreement or full payload compatibility.

Create a fresh production build with production values. Do not treat a QA-configured artifact as a verified production deployment. Outside Vercel Production, disabling Portal mode retains the internal Excel/demo workflow and its optional Basic auth; that is not an authentication recovery method for customers.

## Setup and onboarding

### Information needed from the Portal team

1. Environment and backend availability: QA or production.
2. Exact developer user IDs, plus at least one test ID assigned to each client.
3. Either finished client-scoped keys, or the matching master key plus agreed derivation (the screenshot function above).
4. The environment's `DASHBOARD_SSO_SECRET`.
5. An authorized Portal login and a fresh Open Dashboard launch for acceptance testing.
6. Confirmation that Portal's `DEVELOPER_DASHBOARD_URL` points to the intended dashboard origin.

The dashboard team supplies the stable dashboard origin and configures its environment. The Portal team owns users, test assignment, account suspension, upstream keys and Portal deployment settings. The dashboard-only session secret is not required by Portal.

### QA locally

1. Use Node.js 22+ and install dependencies with `npm ci` if needed.
2. Add the QA template's variables to ignored `.env.local`, preserving unrelated settings. Use supplied QA client keys and the matching QA SSO secret.
3. Generate an independent session secret and run `npm run check:portal-env`.
4. Start `npm run dev`.
5. In another terminal, generate a local launch for a configured client and its test:

```sh
node scripts/portal-launch.mjs 18 32
```

Open the printed link within five minutes. The historical alternative is client `2`, test `28`. These examples depend on those QA assignments still existing. The simulator only permits loopback destinations and refuses Vercel/production execution; it verifies the dashboard flow, not the real Portal button.

### QA on Vercel

1. Configure the Preview environment using QA values and deploy this branch.
2. Give the Portal team the stable Preview dashboard origin. They set QA `DEVELOPER_DASHBOARD_URL` to it, not to the API URL or a particular test path.
3. Sign into QA Portal and use Open Dashboard. Validate the full launch, report and cross-client denial checks below.

### Production and each new client

1. Receive the production developer IDs and assigned test IDs. While waiting, the URL and independent signing/session configuration can be prepared; a usable client map and live verification cannot.
2. Generate each client key locally using the supplied production master key and its developer ID. Do not copy QA keys or put the master key in the map.
3. Set Production variables, including the complete `PLAYLYTIX_CLIENT_KEYS` map. An empty map will fail preflight; do not use fake entries to bypass release requirements.
4. Deploy with production values. Configure production Portal's `DEVELOPER_DASHBOARD_URL` to the production dashboard origin.
5. Verify real Portal launches and backend access for each client. Include a known other client's test to establish scope enforcement.
6. For later onboarding, add the new ID/key without removing existing entries, redeploy, then repeat that client's checks. Adding a test under an already configured client normally needs no new key; only a game-map override may be needed.

## Login, launch and session flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Playlytix Portal
    participant D as Dashboard server
    participant A as Portal API
    B->>P: Log in and click Open Dashboard
    P->>P: Check test ownership; sign client ID and expiry
    P-->>B: 302 to dashboard /tests/18?token=payload.signature
    B->>D: Follow launch link
    D->>D: Verify SSO signature, expiry and configured client
    D-->>B: Set session cookie; 303 to /tests/18/overview
    B->>D: GET /api/portal/session
    D-->>B: Session claims including sid
    B->>D: GET /api/portal/tests/18 with cookie and x-portal-session
    D->>A: GET /api/tests/18/responses with client's x-api-key
    A-->>D: Authorized payload or denial
    D-->>B: Validated, allowlisted analytics data
```

The Portal button targets its own `/developer/tests/<TestID>/dashboard` route. According to the reference, that route checks the logged-in client's ownership, then signs the launch at click time and redirects to:

```text
https://<dashboard-origin>/tests/<TestID>?token=<payload>.<signature>
```

The contract is:

```text
claims = { "d": <numeric developer user ID>, "e": <expiry Unix seconds> }
payload = base64url(UTF-8 JSON of claims)
signature = base64url(HMAC-SHA256(key = DASHBOARD_SSO_SECRET as text, message = payload))
token = payload + "." + signature
```

The HMAC input is the **encoded payload text**, not decoded JSON. Portal TTL is 300 seconds. Dashboard rejects an expired token and an expiry more than 330 seconds ahead; the additional 30 seconds is not grace for an already expired token. Claims must be positive safe integer client IDs and integer expiries. Exactly one `token` query parameter is accepted, and the client must exist in the key map.

The signed claims contain client identity, not the test ID. The upstream API enforces test ownership through the selected client key. Launch verification alone does not establish access to the test.

The dashboard issues its own signed (not encrypted) cookie containing `clientId`, `issuedAt`, `expiresAt` and random `sid`, never an API key. Lifetime is fixed at 7,200 seconds and is not extended by browsing. With `NODE_ENV=production`, including a built Vercel Preview deployment, the cookie is `__Host-playlytix-session`, Secure, HttpOnly, SameSite=Lax, Path=/, with no Domain. Local `next dev` uses `playlytix-session` without Secure for HTTP.

The `x-portal-session` header must equal `sid` from `/api/portal/session`; it detects a stale tab after another login replaces the shared cookie. It does not replace the cookie credential. Sign-out uses same-origin `DELETE /api/portal/session` and clears the cookie. Hidden tabs clear their dataset and reload/revalidate on return.

Launch tokens are replayable until expiry; there is no one-time-code store. Portal logout does not immediately revoke dashboard cookies. Existing sessions authorize client-wide access through that client's key; this integration does not implement additional per-user roles or per-test session scope. Query tokens are removed by the redirect and application responses use `Referrer-Policy: no-referrer`; hosting access-log query handling is separate.

The older parent proposal for Portal-issued bearer sessions is not implemented. Likewise, the reference's ISR suggestion is not current behavior: authenticated fetches and report responses use `no-store`.

## Actual requests and endpoints

### Dashboard server to backend

For production test `18`:

```http
GET https://app.playlytix.gg/api/tests/18/responses
x-api-key: <derived API key for the client who owns test 18>
Accept: application/json
```

Equivalent illustrative command (substitute credentials locally, not in shared command transcripts):

```sh
curl "https://app.playlytix.gg/api/tests/18/responses" -H "x-api-key: <client API key>" -H "Accept: application/json"
```

On Windows PowerShell, use `curl.exe` if `curl` resolves to a PowerShell alias. For QA use `https://qa.playlytix.gg/api` and a QA test/key. There is no request body and no separate client ID query parameter. The master key, SSO secret, dashboard cookie and launch token are not forwarded to the backend.

| Backend endpoint | Contract and scope | Dashboard use |
| --- | --- | --- |
| `GET /api/tests` | `{ "tests": [...] }`, newest first, scoped to the client's tests; master sees all served tests | All playtests |
| `GET /api/tests/:id/responses` | `{ test, questions, responses, stats }`; own tests only for client keys | Report data |
| `GET /api/tests/:id/responses/:responseId/steam` | Per-response Steam detail; response must belong to the authorized test | Not implemented |
| `GET /api/tests/:id/export/tremendous` | Master-only payout CSV; client keys always get 404 | Not used; must not be called by dashboard clients |

The training-mission test is excluded by the API. The payout endpoint is a **business action despite using GET**: its first payable download creates an open payout batch and locks the amounts; subsequent downloads reuse that snapshot until settlement/voiding. Do not use it for connectivity checks or polling. No payout request is needed for dashboard setup.

### Browser to dashboard

| Dashboard endpoint | Purpose |
| --- | --- |
| `GET /tests/:id?token=...` | Portal entry; rewritten to launch handler |
| `GET /auth/launch?testId=:id&token=...` | Explicit launch; omit `testId` to redirect to `/tests` |
| `GET /api/portal/session` | Validated non-secret session claims, or 401 |
| `DELETE /api/portal/session` | Same-origin sign-out |
| `GET /api/portal/tests` | Authorized list; requires session cookie and matching `x-portal-session` |
| `GET /api/portal/tests/:id` | Authorized analytics DTO; requires the same cookie/header |

The browser never needs a backend `x-api-key`. The report request returns transformed analytics, not the backend's raw response.

### Backend errors and dashboard translation

| Backend condition | Backend status | Dashboard data-route status |
| --- | --- | --- |
| Valid authorized request | 200 | 200 if payload/configuration validation also succeeds |
| Missing/wrong key or suspended client | 401 | 502 |
| Upstream forbidden | 403 | 502 |
| Unknown, unowned or excluded test | 404 | 404 |
| Failed-key rate limit reached | 429 | 429 |
| Backend key not configured | 503 | 502 |
| Other upstream errors, invalid payload, timeout or redirect | Varies | 502 |

The saved contract limits failed-key attempts to **30 responses with status 401 per 15 minutes per IP**, then returns 429 for the remainder of that window. Valid-key calls, including 404 results, do not count; the reference describes successful polling as unlimited. These are snapshot contract rules, not a current availability/SLA guarantee.

Dashboard fetches reject redirects, time out after 20 seconds and reject bodies above 20 MiB. Responses use `Cache-Control: private, no-store`. Raw upstream errors are not exposed to the browser.

## API v2 data contract

This section describes **what the backend documents**, including fields this dashboard currently omits. JSON is UTF-8; timestamps are ISO 8601 UTC. Additive fields should not be treated as an automatic permission to forward them to the browser.

### Lists, tests and questions

`GET /tests` is wrapped in `{ "tests": [...] }`. List items use PascalCase: `TestID`, `TestName`, `IsActive`, `CreatedAt`, nullable `StartDate`, nullable `DueDate`, nullable `DeveloperEmail`, and `ResponseCount`. Dashboard list mapping keeps only ID/name.

The responses endpoint's `test` includes `TestID`, `TestName`, nullable `DueDate`, and Steam matching context where provided (`SteamAppID`, `steamMatchGenres`). Questions use PascalCase; submissions and nested fields use camelCase.

Each question has `QuestionID`, `QuestionText`, nullable `QuestionDescription`, `DisplayOrder`, `TypeName`, and documented additive fields `IsRequired`, nullable `LibraryKey`, and nullable `Options`. Order questions by `DisplayOrder`; associate answers/files through question ID, not array position. `LibraryKey` is the canonical cross-test identity; do not infer equivalence from matching text. `Options` contains authored SingleChoice/MultiChoice labels in order.

| `TypeName` | Backend answer contract |
| --- | --- |
| `Rating1_5` | String `"1"` through `"5"` |
| `ShortText`, `LongText`, `URL` | String |
| `SingleChoice` | One exact `Options` string |
| `MultiChoice` | Real string array, deduplicated and in `Options` order |
| `File` | Uploads in `files[]`; no answer entry |
| `SectionHeader`, `InfoBlock` | Layout/context rows; no answers/files; skip as answerable questions |

Every answerable question has an `answers[]` entry. An unanswered string question has `value: ""`; an unanswered MultiChoice has `value: []`. The v2 contract removed the old separate `values` field. Profile multi-selects differ: unanswered profile selections are `null`, not `[]`.

### Submissions, profiles, files and statistics

Each `responses[]` item represents a **submission**, identified by `responseId`, with `submittedAt`, nullable admin `evaluationScore` (1–10), `payoutStatus`, `tester`, `answers`, `files` and `comments`. Responses are newest first. There is no stable tester ID for deduplicating people or joining anonymous testers across tests.

`tester.anonymous` governs upstream identity sharing; `email` is null when anonymous. This dashboard drops identity fields regardless of that flag and labels records by submission ID.

Profile fields documented upstream:

| Shape | Fields |
| --- | --- |
| Nullable scalar text | `country`, `gender`, `ageRange`, `gpu`, `cpu`, `ram` |
| Nullable multi-select string arrays | `platforms`, `gamerType`, `gamingPreferences`, `motivations`, `avoidedGenres`, `playTimes`, `subscriptions`, `gameStores`, `discoveryChannels`, `trustedVoices`, `languages` |
| Nullable labels for bands/scales/habits | `gamingHoursPerWeek`, `sessionLength`, `monthlySpend`, `typicalGamePrice`, `buyTiming`, `mtxSpending`, `wishlistHabit`, `internetQuality` |
| Nullable yes/no-style strings | `hasController`, `hasMicrophone`, `playsEarlyAccess`, `backsCrowdfunding`, `watchesReviews`, `steamReviews`, `hasScreenRecorder`, `hasVR`, `usesVoiceChat`, `testedBefore` |

Yes/no values use `"Yes"`, `"No"`, and where applicable `"Prefer not to say"`, not booleans; `null` means unanswered. Controller/microphone use Yes/No checkbox semantics. Preserve labels and distinguish unanswered from a negative answer. `hasCamera` is retired. Direct gaming IDs, consents and raw Steam identity are not part of the documented analytics contract.

`files[]` has `questionId`, `fileName`, `contentType`, numeric `sizeBytes`, and nullable `url`. Anonymous filenames are generic `attachment-N.ext`. URLs are private signed links lasting approximately one hour; fetch fresh rather than persist them. Images render inline; other types download as attachments, with extension based on sniffed content type. This dashboard forwards neither filenames nor URLs.

`comments[]` contains `{ text, createdAt }`, oldest first. The dashboard currently omits comments. `evaluationScore` is an admin quality assessment, not an answer score. `payoutStatus` can include Pending/Paid/Forfeited; payout amounts are absent from the responses contract and dashboard analytics.

`stats.totalResponses` counts submissions. `stats.ratingAverages` maps question-ID strings to rounded Rating1_5 averages or null. The dashboard checks submission-count agreement and calculates its own answer-based scores; it does not substitute the API's averages.

### Steam contract (not currently used by dashboard)

`tester.steam` is null when not connected; otherwise it includes `connected`, `visibility`, `gameCount`, `totalHours`, `syncedAt` and nullable `match`. Match has `ownsGame`, `ownsGameHours`, `genreHours`, `genreDataPartial`, using the test's declared app/genres. With genres but no app ID, match can still exist; ownsGame is false and genre metrics are meaningful.

`visibility` is public/private/playtime-private/null. Private profiles can retain the last public read; playtime-private exposes game counts/ownership but hours are null. Treat unknown hours as missing, not zero. `syncedAt` is the last attempt, not proof of a fresh successful public read. Partial genre data is a lower bound.

The separate Steam endpoint returns `{ "connected": false }` if disconnected, otherwise aggregate genre data, `pendingBackfill`, totals and up to 50 most-played games. `games` is null when withheld for anonymity; playtime-private can yield `[]`. Game names may be null during backfill; each game's `genres` is a comma-separated string in this endpoint. Lazy-load this endpoint if it is implemented later; it is not required for basic report access.

### Consistent minimal example

This is a synthetic contract example, not live production data:

```json
{
  "test": { "TestID": 18, "TestName": "Example playtest", "DueDate": null },
  "questions": [
    { "QuestionID": 37, "QuestionText": "How fun was the tutorial?", "QuestionDescription": null, "DisplayOrder": 1, "TypeName": "Rating1_5", "IsRequired": true, "LibraryKey": null, "Options": null }
  ],
  "responses": [
    {
      "responseId": 22,
      "submittedAt": "2026-09-28T12:00:00Z",
      "evaluationScore": null,
      "payoutStatus": "Pending",
      "tester": { "anonymous": true, "email": null, "country": "Slovakia", "platforms": ["PC / Mac"] },
      "answers": [{ "questionId": 37, "value": "3" }],
      "files": [],
      "comments": []
    }
  ],
  "stats": { "totalResponses": 1, "ratingAverages": { "37": 3 } }
}
```

The saved reference's larger illustrative example shows two response objects but `totalResponses: 3`. Do not use it unchanged as a complete mapper fixture: this dashboard rejects that count mismatch. The checked-in [production sample fixture](../tests/fixtures/portal-production-response.json) is separate and internally consistent.

## What this dashboard currently supports

The following was checked against [mapper.ts](../lib/playlytix/mapper.ts) on September 30. API documentation alone is not proof that a field or question type is supported in the UI.

| API content | Current dashboard behavior |
| --- | --- |
| Rating1_5 | Mapped/scored; 1→0, 3→50, 5→100 for normal direction; reviewed game rules can invert it; conflicting supplied scale bounds are rejected |
| ShortText, LongText, URL | Retained as text answers |
| SectionHeader | Skipped |
| File | Question retained, attachments counted for omission notice; no file download URLs forwarded |
| SingleChoice | Treated as unknown type with warning; string answer retained unscored; options metadata not mapped |
| **MultiChoice** | **Unsupported: `value` arrays, including `[]`, fail the mapper's string check and produce a 502 for the report** |
| **InfoBlock** | **Not yet skipped: treated as an unknown question with warning**, though v2 defines it as layout content |
| Other unknown question types | String values retained unscored; non-string values can fail mapping |
| LibraryKey, IsRequired, Options | Not mapped into the dashboard question model |
| Country, gender, age range, platforms, playstyles, genres, weekly hours, controller, microphone | Allowlisted segments; selected profile arrays joined for the existing model |
| GPU/CPU/RAM and additional profile fields | Omitted; hardware shows unavailable |
| Identity, raw Steam data, evaluation/payment fields, comments, attachment names/URLs | Omitted from browser DTO |
| Repeated submissions | Counted separately; cannot deduplicate people |
| No explicit game mapping | Neutral analytics, no invented categories/game KPIs/inverse scoring |

Before claiming full v2 support, implement and verify MultiChoice mapping, InfoBlock skipping, and any required SingleChoice/metadata behavior. This documentation update does not change the mapper. A successful rating-only fixture does not cover these gaps.

Portal mode keeps datasets in memory, removes legacy `playtest-dashboard-v1` localStorage data and has no demo fallback. Counts represent submissions; answer-based charts can have fewer participants than the total submission count. Answer text itself may contain user-entered personal information even though structured identity fields are removed.

Authenticated Portal clients can use AI analysis through `/api/themes`, `/api/question-analysis`, `/api/overview-insights`, and `/api/flaw-recommendations`, and can open the themes page for the current report. These AI endpoints accept analysis inputs from the browser; they do not independently fetch and verify a test ID. Registry APIs remain blocked. Upload, registry, settings, and builder pages are unavailable. Overview, categories, questions, testers, responses, and dashboard report export remain test-scoped. The report export is distinct from the backend payout CSV endpoint.

## Verification and release

### Recorded evidence (not rerun by this documentation update)

| Date | Recorded checks | Limits |
| --- | --- | --- |
| September 14 | 182 unit/route tests, 4 live QA/browser checks, lint/build; both QA clients read own tests and received 404 on the other's test | Locally generated launch links; not a real Portal-button acceptance test |
| September 28 | 210 tests in 20 files, lint, 2 fixture browser tests, production-configured build | Synthetic credentials and supplied fixture; no live production API/Portal/Vercel verification |

The production sample is test 18 / Maradona, question 37, submission 22, rating 3/5 → 50/100. This does not identify the production client or establish that current upstream data still matches it.

### Local checks

Run sequentially from the dashboard root:

```sh
npm run check:portal-env
npm test
npm run lint
npm run test:portal:fixture
npm run build
```

The fixture suite starts an isolated server on port 3101 with fake credentials and mocked report data. It uses Edge locally and Playwright Chromium in CI. Browser installation may be required in a new environment. Builds may need network access for existing Google Fonts. Do not run browser checks and builds concurrently because they generate shared Next.js type files.

For the opt-in **live QA** suite, configure QA `.env.local`, start `npm run dev -- --port 3100`, then run `npm run test:portal` in a second terminal. It uses Edge and the historical QA clients/tests `18/32` and `2/28`; some assertions depend on the original sample contents. Do not point this suite at production or interpret changed QA sample counts as authentication failures. Traces/screenshots/video are disabled in both browser configurations.

### Live acceptance after deployment

1. Record environment, deployment, date, client/test IDs and results without secrets or raw tester data.
2. Without a session, verify Portal entry and 401 from `/api/portal/tests`.
3. Use the actual environment's Portal Open Dashboard button. Confirm redirect to a clean `/tests/<id>/overview`, secure cookie on HTTPS, and the expected report.
4. Verify All playtests, question/detail navigation and reload. No demo data should appear.
5. Verify a known other client's test returns 404 with the current client's key/session. Do not substitute the master key to make a failure pass.
6. Exercise the real questionnaire types, especially the v2 compatibility gaps above. Confirm unsupported types are resolved before releasing affected tests.
7. Verify browser storage has no persisted dataset and browser API requests expose no backend or signing keys.
8. Sign out and verify session/data routes return 401. Check expired/tampered launches and stale-tab rejection after a client switch.
9. Disable temporary diagnostics, redeploy and retain the result record. A successful build alone is not acceptance.

## Troubleshooting

First locate the failing stage: launch, session, test list or report data. Temporarily enable server-only `PORTAL_DEBUG=true` in the relevant deployment and redeploy. Inspect `[portal]` runtime log entries and correlate the `x-portal-debug-id` response header with `requestId`. Each handler has its own ID. The application logger avoids token/key/cookie/raw-body values; platform access logs are separate.

| Symptom/code | Meaning and action |
| --- | --- |
| `PORTAL_MODE_MUST_BE_TRUE` | Set exact `true`; verify the deployment environment |
| `API_BASE_URL_INVALID`, `PRODUCTION_API_BASE_URL_REQUIRED` | Use the correct HTTPS base including `/api`; production requires the exact production URL |
| `CLIENT_KEYS_INVALID_JSON`, `CLIENT_KEYS_INVALID_CONFIGURATION` | Valid nonempty JSON map, positive numeric IDs, keys ≥32 characters, no outer quotes or surrounding value whitespace |
| `CLIENT_NOT_CONFIGURED` | The signed developer ID is absent from the map; do not confuse it with TestID |
| `TOKEN_SIGNATURE_MISMATCH` | Check environment, exact SSO secret, encoded-payload signing and base64url encoding |
| `TOKEN_MALFORMED`, `TOKEN_PAYLOAD_INVALID_JSON`, `TOKEN_CLAIMS_INVALID`, `LAUNCH_CLAIMS_INVALID` | Check token shape and numeric claims; expiry uses seconds |
| `LAUNCH_EXPIRED`, `LAUNCH_EXPIRY_TOO_FAR` | Fresh Portal click; check clocks and 300-second TTL, not milliseconds |
| Signing secret missing/invalid or `SESSION_SECRET_MUST_BE_SEPARATE` | Set both secrets ≥32 characters, with separate values; a session-secret failure can also surface as generic launch 401 |
| Launch 400 | Invalid test ID |
| Session 401 / `/portal-entry` redirect | Cookie absent/expired, changed session secret or removed client; relaunch on the correct HTTPS hostname |
| Data 409 / `SESSION_HEADER_MISMATCH` | Old tab/session ID; relaunch or reload current session metadata |
| Data 404 | Test absent, excluded or not owned by this key; confirm assignment upstream |
| Data 429 | Stop repeated wrong-key attempts; correct configuration and allow the failed-attempt window to expire |
| Data 502, upstream 401 | Launch can succeed while API key fails; check derived key, actual developer ID, environment/master-key pairing, unchanged `plx-dev:` prefix, text encoding and account suspension |
| Data 502, `map_test_responses` | Check MultiChoice arrays, mismatched test/counts, duplicate IDs, malformed payload or invalid rating-scale metadata |
| Data 502, `game_configuration` | Game map invalid or references an unregistered game configuration |
| Other data 502 | Check timeout, 20 MiB bound, network, upstream status/redirect and JSON validity |
| Missing categories/KPIs | Neutral game configuration selected; add only a reviewed client/test override |
| Demo/Basic auth appears | Wrong deployment or nonproduction Portal mode disabled; Vercel Production in this branch cannot intentionally use demo mode |

Successful launch stages are `received`, `launch_verified`, `session_issued`, `redirect_ready`. API stages include `session_verified`, `upstream_fetch`, `upstream_response`, `read_upstream_body`, `parse_upstream_json`, `game_configuration`, `map_test_responses` and `completed`. Exception details are deliberately restricted; stage plus status identifies where to investigate.

## Rotation, removal and rollback

| Action | Effect and coordination |
| --- | --- |
| Add client | Add derived key under confirmed developer ID, preserve other entries, redeploy and verify |
| Remove client from map | On the updated deployment, that client's launch/session checks fail; it does not delete the Portal account |
| Rotate master key upstream | Under the supplied derivation, all derived keys change; coordinate regeneration and deployment of the complete affected map with Portal |
| Replace client API key | Coordinate accepted upstream value and dashboard map; does not itself invalidate the dashboard cookie |
| Rotate SSO secret | Update Portal and dashboard together; old launches fail, existing dashboard cookies remain valid |
| Rotate session secret | Invalidates all dashboard sessions in that environment; users must relaunch |
| Suspend Portal client | Backend contract says its derived key returns 401; dashboard data route maps that to 502; this is not automatic dashboard-cookie revocation |
| Portal logout | Does not directly end dashboard session |
| Dashboard sign-out | Clears this browser's cookie and active report state |

There is no old/new secret overlap mechanism or immediate central dashboard session revocation service. Data already downloaded cannot be withdrawn. Revalidate the intended hostname/deployment after configuration changes.

If release fails, retain Portal authentication and correct configuration or roll back to a known Portal-enabled revision. A pre-integration/demo revision is not a safe customer-facing fallback. The dashboard does not need the master key installed to recover ordinary client requests.

## Implementation map

| Area | Source |
| --- | --- |
| Shared environment validation | [portalConfig.mjs](../lib/server/portalConfig.mjs), [check-portal-env.mjs](../scripts/check-portal-env.mjs) |
| SSO/session primitives | [portalAuth.ts](../lib/server/portalAuth.ts) |
| Launch route | [app/auth/launch/route.ts](../app/auth/launch/route.ts) |
| Proxy/routing and API protection | [proxy.ts](../proxy.ts), [requestAuth.ts](../lib/server/requestAuth.ts) |
| Session endpoint | [app/api/portal/session/route.ts](../app/api/portal/session/route.ts) |
| Backend client | [portalApi.ts](../lib/server/portalApi.ts) |
| Payload adapter | [mapper.ts](../lib/playlytix/mapper.ts) |
| Game rules | [lib/games/index.ts](../lib/games/index.ts) |
| Browser lifecycle/navigation | [PortalBoundary.tsx](../components/layout/PortalBoundary.tsx), [ReportLink.tsx](../components/layout/ReportLink.tsx), [portalBrowser.ts](../lib/portalBrowser.ts) |
| Dataset state | [store.ts](../lib/store.ts) |
| Diagnostics | [portalDiagnostics.ts](../lib/server/portalDiagnostics.ts) |
| Local launch simulator | [portal-launch.mjs](../scripts/portal-launch.mjs) |
| Live QA tests | [integration.spec.ts](../tests/portal/integration.spec.ts) |
| Isolated fixture browser tests | [production.spec.ts](../tests/portal-fixture/production.spec.ts) |

Maintain this guide when the backend contract or dashboard implementation changes. Keep historical test results dated, and add live production evidence only after the corresponding checks have actually run.
