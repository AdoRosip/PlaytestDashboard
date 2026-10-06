# Production Portal → dashboard

> **Current setup:** use the [consolidated Portal API guide](portal-api.md). It includes QA versus production, the separately supplied `clientApiKey` function, master-key provisioning and API v2 compatibility gaps. This document preserves the September 28 production preparation and verification record; credential/deployment statements below describe that run, not a fresh inspection.

## Plan and implementation status

1. **Completed:** reviewed `planning/playlytix-api-integration` at `d373a7c`, its QA setup and historical proposals in this and the parent repository. Brought its integration into `prod-ready-preparation`, preserving the dashboard UI.
2. **Completed:** added production URL validation, the multi-client `PLAYLYTIX_CLIENT_KEYS` map, and a build preflight. Vercel Production cannot fall back to the demo workflow.
3. **Completed:** saved the supplied response as a contract fixture and added payload, configuration, route and isolated browser tests.
4. **Deployment remaining:** configure Production variables, deploy this code, set the Portal's dashboard destination, and perform the live checks below. Production credentials have not been installed and no production deployment has been performed.

## Vercel environment variables

Set these for **Production** on the dashboard project. Keep existing **Preview** QA credentials separate. Changes take effect on a new deployment; see [Vercel environment variables](https://vercel.com/docs/environment-variables) and [updating variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

| Variable | Production value |
| --- | --- |
| `PORTAL_MODE` | `true` |
| `PLAYLYTIX_API_BASE_URL` | `https://app.playlytix.gg/api` |
| `DASHBOARD_SSO_SECRET` | Your production shared signing secret; identical to the production Portal's value, at least 32 characters |
| `DASHBOARD_SESSION_SECRET` | A separate random secret of at least 32 characters, stored only by the dashboard |
| `PLAYLYTIX_CLIENT_KEYS` | JSON object mapping positive numeric **client/developer IDs** to their production **client-scoped** API keys (at least 32 characters each) |
| `PLAYLYTIX_TEST_GAME_MAP` | Optional; `{}` uses neutral analytics. Reviewed overrides: `{"<clientId>:<testId>":"wannabe-trashman"}` or `exovia` |
| `PORTAL_DEBUG` | `false` normally; temporary `true` enables credential-free diagnostic codes |

Use the [placeholder template](portal-production.env.example). No credentials belong in `NEXT_PUBLIC_*`, committed files, or browser storage. Existing `.env.local` is unchanged.

Generate `DASHBOARD_SESSION_SECRET` locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save it in Vercel and retain it across deployments. Rotating it invalidates existing dashboard sessions. Do not reuse the Portal shared secret.

### Multi-client key map

`PLAYLYTIX_CLIENT_KEYS` is the sole supported API-key configuration, matching QA. Each property is the client/developer ID signed as `d` by the Portal; its value is that client's production API key. The sample's `TestID: 18` does **not** identify the client. Replace these illustrative IDs and keys with the actual Portal client IDs and corresponding keys:

```json
{"7":"<key scoped to client 7>","9":"<key scoped to client 9>"}
```

Paste JSON without shell-style outer quotes into Vercel. To onboard another client, add its ID/key entry while preserving existing entries, then redeploy and verify that client's access. Keep QA and production maps separate. A missing client never falls back to another client's key. Standalone `PORTAL_API_KEY`, `PORTAL_CLIENT_ID`, and `PLAYLYTIX_API_KEY` variables are unused; put each supplied API key in the map instead.

**Each key must be client-scoped upstream.** The QA contract sends `x-api-key`, with no client claim forwarded to the API. A global/admin key would allow access to other clients' tests. If a supplied key is global, obtain client-scoped keys before release or first agree and implement an API contract that validates signed client context. Assigning a key to a client in the map does not narrow its backend permissions.

### Build behavior

`npm run build` runs a shared configuration preflight when `VERCEL_ENV=production` or `PORTAL_MODE=true`. It checks key configuration, independent secrets, URL, and game-map shape. Production must use `https://app.playlytix.gg/api` (trailing slash accepted). It makes no network requests and prints no secrets. It cannot verify key ownership, agreement with the Portal's secret, or whether game-map values name registered games; report loading checks that last condition.

`npm run check:portal-env` runs the same validation explicitly. Set Vercel's build command to `npm run build`; keep its system environment variables exposed so `VERCEL_ENV` is available. A nonproduction branch deployment uses Preview variables. Create a Production deployment from the intended code with Production values; rebuild rather than promoting a QA-configured artifact unchanged.

## Portal settings and launch contract

Set the production Portal's dashboard destination to the actual deployed **dashboard origin**, not the API URL. Open Dashboard generates:

```text
https://<production-dashboard-host>/tests/<testId>?token=<payload>.<signature>
```

- Payload: base64url of JSON `{ "d": <numeric client ID>, "e": <expiry Unix seconds> }`.
- Signature: base64url HMAC-SHA256 of the **encoded payload**, with `DASHBOARD_SSO_SECRET` used as UTF-8 text.
- Expiry: normally now + 300 seconds; expired tokens and expiry more than 330 seconds ahead are rejected.
- Dashboard verifies the configured client, issues a two-hour signed session, and redirects to `/tests/<testId>/overview` without the token.
- Production cookie: `__Host-playlytix-session`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain.
- Server fetch: `GET https://app.playlytix.gg/api/tests/<testId>/responses` with the client's `x-api-key`.
- All playtests fetch: `GET /api/tests`, expecting `{ "tests": [{ "TestID": 18, "TestName": "Maradona" }] }`.
- API calls and report responses are uncached; client/test IDs scope in-memory analytics records.

This preserves the QA-tested contract. The bearer-session architecture proposed in the parent docs is not implemented. Launch links are replayable until expiry and authorize client-wide access. Portal logout does not immediately revoke dashboard sessions. Dashboard sign-out clears the cookie; expiry ends it after two hours; session-secret rotation invalidates all sessions. Removing a configured client invalidates its sessions. Do not save real launch URLs in logs, screenshots or tickets; platform access logs need their own query-string handling.

## Supplied response contract

[portal-production-response.json](../tests/fixtures/portal-production-response.json) preserves the user-supplied sample, including its profile and comments, as a test-only fixture. Runtime code does not import it and it is not a public asset.

Expected result: test **18 / Maradona**, question **37**, submission **22**, rating **3/5 → 50/100**, one submission. Client identity is separate. Null category/library/Steam fields and additive profile properties are accepted. Rating scale bounds must agree with `Rating1_5`; inconsistent bounds are rejected.

| Payload content | Handling |
| --- | --- |
| Test name, question text/description, answers, submitted time | Mapped to analytics |
| Country, gender, age range, platforms, playstyles, genres | Allowlisted segments; string arrays accepted |
| Weekly gaming hours, controller, microphone | Allowlisted profile segments |
| Username, raw Steam profile, payout/evaluation details, comments, spending and unused profile fields | Omitted from browser data |
| GPU/CPU/RAM | Not mapped; hardware remains unavailable |
| Files | Counted for an omission notice; private URLs not forwarded |
| Unknown question types | String answers retained unscored with a warning; v2 MultiChoice arrays currently fail mapping, and InfoBlock is not yet skipped. See the consolidated guide's compatibility table. |
| No category/game map | Neutral report without invented categories, game KPIs or inverse scoring |
| Repeat submissions | Counted separately; the contract has no stable tester ID |

Scores derive from answers; `stats.totalResponses` must equal the submission count. `ratingAverages` does not override scores. Registry enrichment, uploads, and builder remain unavailable in Portal mode. Authenticated Portal clients can now use AI analysis and the themes page; this differs from the QA policy at the time of the September 28 validation below.

## Verification and release

Validated on September 28, 2026: 20 unit/route test files, **210 tests passed**; lint passed; **2 fixture browser tests passed**; production-configured build passed, including TypeScript and page generation. The build used `VERCEL_ENV=production`, the production API URL, and synthetic credentials. No live production API call, actual Portal launch or Vercel deployment was verified. The build needed network access for the existing Google Fonts downloads.

Run sequentially:

```sh
npm test
npm run lint
npm run test:portal:fixture
npm run build
```

Unit/route coverage includes supplied-payload mapping, production endpoint/key selection, secure cookies, signature/expiry rejection, unknown clients, stale-tab sessions, safe upstream errors, and configuration failures. Browser tests use real Next routing, launch/session handlers and report components, with report data mocked from the sample. They check scoped navigation, stale localStorage removal, sign-out and anonymous/unknown-client denial. They do not prove production API access or the Portal signing function works. Browser tests use Edge locally, Playwright Chromium in CI; install that browser before running in CI. Run browser tests and builds sequentially because they generate shared Next type files.

After configuring and deploying Production:

1. Without a session, confirm Portal entry and 401 from `/api/portal/tests`.
2. Sign into the **production Portal** as an authorized client and open its test. Confirm the clean scoped URL, secure cookie and actual report. Test 18 matches the sample only if upstream data is unchanged.
3. Verify All playtests, question/detail navigation, and reload; no demo data should appear.
4. Request a known different client's test: expect upstream denial and no data. This is essential evidence that the key is client-scoped.
5. Confirm browser storage contains no `playtest-dashboard-v1` data and browser requests contain no API/signing keys.
6. Sign out and verify 401 from session/data endpoints. Reject expired/tampered launches; verify a fresh Portal launch works.
7. Disable debug logging after verification and record deployment/outcomes without credentials or raw tester data.

If release fails, keep Portal authentication enabled. Correct the variables or roll back to a known Portal-enabled production deployment. The pre-integration branch base restores demo behavior and is not a safe authenticated-production fallback.
