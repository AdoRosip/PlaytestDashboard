# Client Feedback Tracker

Delivery tracking for the 31 requests in *Platform Feedback and Feature Requests.pdf*.
Item numbers match the client's document exactly, so anything here stays quotable in reply.

Full difficulty reasoning and code evidence for each item lives in the
[feasibility assessment](https://claude.ai/code/artifact/fac49055-ce1f-4025-bb0b-3e081a01001e).

**Last updated:** 12 Aug 2026

## Status

| | Status | Count |
|---|---|---|
| ✅ | Done | 7 |
| 🔄 | In progress | 1 |
| ⬜ | To do | 20 |
| ⛔ | Blocked — needs a decision outside this repo | 2 |
| ❓ | Needs acceptance criteria before it can be estimated | 1 |
| | **Total** | **31** |

Done so far: **2, 7, 8, 10, 20, 21, 22** — all on branch `responsive-layout`.

Difficulty is 1/5 (under a day) to 5/5 (new infrastructure). It is the cost of
shipping the request *reliably*, not of demoing it.

---

## Group A · Platform-level (client's list 1)

### 🔄 A1 · Mobile/tablet version — `4/5`

Branch `responsive-layout` · commit `87393aa`

Breakpoints follow the Tailwind v4 defaults already compiled by this project:
phone = base, tablet = `md` (768px), monitor = `lg` (1024px).

- [x] Nav rail off-canvas below `lg`, docked from `lg` up
- [x] Filter rail off-canvas below `lg`, docked from `lg` up
- [x] Mobile top bar with nav + filter triggers and active-filter count
- [x] Shared backdrop, Escape to close, auto-close on navigation
- [x] Evidence and tester drawers full-width below `sm`
- [x] Question-detail AI panel stacks above content until `xl`
- [x] Responses and testers tables scroll horizontally instead of clipping
- [x] Page gutters step 16 → 24 → 32px
- [x] Explicit `viewport` export + `theme-color` for mobile browser chrome
- [x] Build, lint, `tsc`, 117 tests pass; breakpoint utilities confirmed in the emitted CSS bundle
- [ ] **Visual QA at 375px** (iPhone SE) — KPI grids are `grid-cols-2` at base and may want single-column
- [ ] **Visual QA at 768px** (iPad portrait) — the `md` boundary: phone shell, tablet content grids
- [ ] **Visual QA at 1024px** — the `lg` boundary, where the docked filter rail returns and content drops to 544px
- [ ] Touch-target audit (many controls are currently 24–28px; 44px is the usual minimum)
- [ ] Decide whether full phone support is in scope, or tablet-landscape only

> **Gamescom scope call.** Tablet-landscape read-only is reachable. Full phone
> support is not, and is best treated as post-Gamescom.

### ⬜ A2 · Overview page builder — `3/5` browser-local · `5/5` per-user

Head start: every Overview block is already wrapped in `ExpandableOverviewSection`
with a stable title, so the widget seams are cut.

- [ ] Decide persistence scope: browser-local, per-user, or per-organisation
- [ ] Widget registry with stable IDs and config schemas
- [ ] Decompose both Overview trees (910 + 488 lines) into widgets
- [ ] Drag-and-drop placement, hide/show controls
- [ ] Per-breakpoint layout rules
- [ ] Layout validation, defaults, reset
- [ ] Schema versioning + migration

> ⚠️ A `localStorage` layout is a 3/5 that gets discarded when browser persistence
> is removed for the Portal integration. See [cross-cutting risks](#cross-cutting-risks).

### ⬜ A2a · Editable AI prompts in the builder — `4/5`

- [ ] Decide scope: editable instruction block (tractable) vs. free-form prompt replacement (not)
- [ ] Stored prompt templates + versioning
- [ ] Defined template variable contract
- [ ] Length and content limits
- [ ] Reset-to-default and preview
- [ ] Edit permissions (needs user identity)
- [ ] Record which prompt + model produced each saved analysis

> The required tool schemas (`tool_choice: 'required'`) are a floor a bad prompt
> cannot break, which is what makes the bounded version feasible.

---

## Group B · AI and evidence (client's list 2)

**Ordering constraint:** B2 comes first. B1, C13 and C16 all depend on payloads
that carry response IDs. Building automatic AI before provenance means paying for
analyses that cannot explain themselves.

### ⬜ B2 · Every AI conclusion links to its source responses — `5/5`

- [ ] Add response IDs to the Key Takeaways payload (currently stripped entirely)
- [ ] Add response IDs to the question-analysis payload
- [ ] Per-claim citations in every AI result schema
- [ ] Server-side validation rejecting invented/unmatched IDs
- [ ] Evidence grouped by question, not a flat response list
- [ ] Filtered-cohort safety (never surface an excluded tester's quote)
- [ ] Persist citations with the result, plus model + prompt version + input signature

### ⬜ B3 · Theme click opens the exact questions and answers — `3/5`

- [ ] Address the evidence view by response IDs, not one `questionId`
- [ ] Group cited answers under their question headings
- [ ] Handle themes spanning multiple questions
- [ ] Show supporting-response and unique-tester counts
- [ ] Surface invalid/missing citation warnings

> Best-founded AI item — themes already carry `linkedResponseIds`. The current
> button ignores them and opens every response for one question.

### ⬜ B1 · Generate Key Takeaways automatically — `3/5`

- [ ] Move the result from component state into the store, keyed by payload signature
- [ ] Persist it (the themes flow already implements this pattern)
- [ ] Loading / stale / retry / failure states
- [ ] Guard against re-firing on remount, filter change, and duplicate tabs
- [ ] **Decide:** does changing a filter automatically buy a new paid analysis?

---

## Group C · Main list, items 1–25

### Quick wins — no backend, no new architecture

| | # | Request | Diff. | Notes |
|---|---|---|---|---|
| ✅ | 2 | Responses use only ~⅓ of screen width | `1/5` | Container `max-w-6xl` → `max-w-[1680px]`; prose cards take `xl:col-span-2`; answers stay stacked one per row, capped at `max-w-[110ch]` for line length; list height `max-h-72` → `30rem`; answer text 12→14px. ~472px → ~1000px of text. **First attempt reverted** — a multi-column answer grid left ragged holes |
| ⬜ | 5 | Quantified Qualitative: unlabelled segments, missing legend entry | `1/5` | "Other" segment is drawn but absent from the legend; values hidden below 12%. **Don't** relabel Other as "no opinion" — unclassified prose ≠ missing response |
| ✅ | 7 | Core Loop Fun / Wishlist need a progress indicator | `1/5` | New `components/ui/ScaleTrack.tsx` on the qualitative KPI cards. Fill is min–max (matching `computeNormalizedScore`, so it can't contradict the 0–100 category scores); ends labelled `1` and `5` with interior ticks, so no percentage is claimed either way. Visually verified |
| ✅ | 8 | Collapse arrow at the top of the filter panel | `1/5` | Fell out of moving positioning out of `FilterPanel` |
| ✅ | 10 | Rename "Questions" → "All Questions" | `1/5` | `Sidebar.tsx:19` + both `questions/page.tsx` headers. `CategoryCard` stat label left alone — that's a count, not the destination |
| ⬜ | 12 | Colour category score by value | `1/5` | Helpers already centralised. **Held for the client's palette** — ship with #4 and #6 so it lands once |
| ✅ | 20 | AI response-count footer far too small | `1/5` | 10→12px in the summary dialog, 11→12px on theme detail, and both `slate-600` → `slate-400`. Size was only half of it; near-invisible grey on the evidence count was the rest |
| ✅ | 21 | Map needs a legend or scale | `1/5` | Gradient strip built from the map's own `fillForCount` so it can't drift from the shading, plus a "No testers" swatch. Labelled "Testers per continent". Visually verified |
| ✅ | 22 | Show "Tester-1234" not "P-1234" | `1/5` | Proven by `lib/testerIdentity.test.ts`. Two extras found: `registryMatch.ts:18` was writing `P-{id}` into stored `testerId`, and `responses/page.tsx:55` rendered `testerId` raw — bypassing the helper's email guard, so an email-shaped id would have been printed on screen |
| ⬜ | 23 | Tester's answer → all answers to that question | `1/5` | Wiring exists both sides. Resolve drawer `z-50` vs. panel `z-[70]` first — the drawer would open *behind* the panel |

### Contained — one to three days each

| | # | Request | Diff. | Notes |
|---|---|---|---|---|
| ⬜ | 1 | Yes/No can't be clicked as a filter | `2/5` | Widen `DrillSelection` to accept strings; match on `rawAnswer`; make the bars buttons. One pure tested module |
| ⬜ | 11 | More player context beside an answer | `2/5` | Data all exists. **Flag:** framing signals as "credibility" is a product decision |
| ⬜ | 13 | Top Themes missing until AI has run | `2/5` | Cheap because themes already persist and a generation guard exists. Auto-run once per dataset |
| ✅ | 18 | Detail view resets the chart filter | `2/5` | Fell out of 19 — the two pages held *separate* `useState` copies of the same shape, so "Detail →" mounted a fresh empty one. Both now read `store.drill`. **Not** URL-encoded, so reload and link-sharing still start clean |

### Moderate — several components or state changes

| | # | Request | Diff. | Notes |
|---|---|---|---|---|
| ⬜ | 4 · 6 · 12 | Semantic, consistent chart colours | `3/5` | **One task.** ~5 independent palettes today; ~460 colour classes in 27 files, no token layer. Must respect `isInverseScored`. Keep the map's ramp single-hue — it encodes quantity, not polarity |
| ⬜ | 9 | Interface should be larger | `3/5` | Global font bump breaks existing truncation. Needs type-scale + density tokens. Sequence with A1 so layout is re-tested once |
| ⬜ | 14 · 15 | Theme polarity + show positive findings | `3/5` | Root cause: prompt defines low severity as "minor *or positive*", collapsing two axes. Needs a distinct sentiment field |
| ⬜ | 16 | Show how many people share each takeaway | `3/5` after B2 | Count in the app, never ask the model. Define the denominator |
| ✅ | 19 | Keep filters across categories; no auto-resets | `3/5` | Cross-filter moved from page `useState` into `store.drill`; cohort is now `segment ∩ drill` in `selectFilteredTesterIds`, so every page that already read `selectFilteredResponses` honours it. Chips render globally in `CrossFilterBar`. **Push-back accepted:** reset-on-new-import stays. Reload still clears (not persisted) — see the localStorage risk below |
| ⬜ | 3 | Design closer to the platform | `4/5` | Subjective + broad. Items 4, 6, 9, 12 are fragments of this; do the token layer first |

### Needs input

| | # | Request | Diff. | Blocker |
|---|---|---|---|---|
| ❓ | 17 | Polish Categories further | `2/5`–`4/5` | No acceptance criteria. Visual polish is 2/5; primary-workspace redesign is 4/5. **Ask for a wireframe.** Much arrives anyway via 1, 2, 4, 9, 13, 14, 15, 18 |

### Blocked on decisions outside this repo

| | # | Request | Diff. | Blocker |
|---|---|---|---|---|
| ⛔ | 24 | Show Steam data from Viktor's platform | `4/5`–`5/5` | **Privacy decision first.** The Portal integration plan §11 lists Steam/Epic/console identifiers among fields the analytics API must *not* return. Derived signals (playtime bands, library genre mix) are the likely path. Then: does Viktor's platform expose a stable authenticated API? |
| ⛔ | 25 | Rate/mark testers, invite cohorts later | `5/5` | Three products, mostly Portal territory |

**Item 25 breakdown:**

- [ ] **25a · shared good/poor flag — `3/5`.** Registry column + authed routes + UI. Cross-game identity already exists. Note `adminNotes` on the tester type has no column or editing route behind it — not a foundation
- [ ] **25b · per-developer ratings and notes — `4/5`.** Needs real user accounts; one shared HTTP Basic credential can't record who rated whom
- [ ] **25c · select a cohort and contact them — `5/5`.** A tester CRM: rounds, saved lists, do-not-invite status, consent, suppression, email/Discord integration, delivery state, audit. **Blocked:** requires organisation-scoped tester IDs, while the Portal plan recommends test-scoped

---

## Cross-cutting risks

- [ ] **Gamescom timing.** A1 is the only hard-dated item. Confirm tablet-landscape-only scope.
- [ ] **The `localStorage` collision.** The Portal integration plan requires removing raw playtest data from browser storage. A2, 13 and 19 all want to persist things. Anything built on `localStorage` now gets rebuilt.
- [ ] **No user identity anywhere.** Auth is one shared HTTP Basic credential. Blocks A2 (per-user layouts), A2a (prompt ownership) and 25b.
- [ ] **Colour: one pass, not four.** 4, 6 and 12 done separately will produce a fifth and sixth inconsistency.
- [ ] **AI: provenance before automation.** B2 → B3 → B1 → 13 → 16 → 14/15.

## Suggested order

| Phase | Items | Why here |
|---|---|---|
| 1 · Now | ~~2~~, 5, ~~7~~, ~~8~~, ~~10~~, 12, ~~20~~, ~~21~~, ~~22~~, 23 | No backend, no dependencies. **7 of 10 done.** Remaining: 5 and 23 (both carry a decision — see their notes), and 12 is held for the palette |
| 2 · Gamescom | A1 (tablet-landscape) | Hard-dated and hard-scoped |
| 3 · Foundations | 4, 6, 9, 3 (tokens) · 1, ~~18~~, ~~19~~ (filter state) | Two token layers. Everything later gets cheaper. **Filter state done**; item 1 still to verify against the category the client named |
| 4 · AI provenance | B2, B3 → B1, 13, 16, 14, 15 | Citations first |
| 5 · Needs Portal | A2, A2a, 25a, 25b | All gated on user identity + server-side storage |
| 6 · External | 24, 25c | Privacy decision and third-party API contract |

> **Waiting on the client:** the colour palette for #4/#6/#12, so the token layer
> is built once against real values.
