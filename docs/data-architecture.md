# Data Architecture and Metric Lineage

This document explains where the dashboard data comes from, how it is transformed, and how the visible metrics are calculated. It is written for debugging and product decisions, not as marketing documentation.

## High-Level Shape

The app is a client-heavy Next.js dashboard. There is no database in the current implementation.

Main flow:

1. The user uploads an `.xlsx` or `.xls` file in `app/upload/page.tsx`.
2. `parseExcelFile()` in `lib/parser.ts` reads the workbook with `xlsx`.
3. The parser creates normalized in-memory objects: `Project`, `Tester`, `Category`, `Question`, and `Response`.
4. `loadFromExcel()` in `lib/store.ts` stores those objects in Zustand.
5. Zustand persists only the imported data to `localStorage` under `playtest-dashboard-v1`.
6. Dashboard pages read from the store and recompute page-specific statistics.
7. AI analysis endpoints can send selected response text to OpenAI when the user runs analysis.

The main domain types live in `lib/types.ts`.

## Core Data Models

### Project

Defined in `lib/types.ts`.

Created by `parseExcelFile()` in `lib/parser.ts`.

Fields:

- `id`: hardcoded to `proj_import` for imported files.
- `name`: uploaded filename without `.xlsx` or `.xls`.
- `gameName`: currently hardcoded to `Exovia`.
- `playtestName`: uploaded filename.
- `createdAt`: import time.
- `totalResponses`: count of response-sheet rows with at least one non-empty question answer.
- `matchedTesters`: number of response rows successfully linked to a registration profile (clean `matchedCount`).
- `unmatchedTesters`: number of response rows that could not be linked to registration data.

Note: participation is derived from the response sheet, not the registration sheet — registered testers who never submitted a response are not counted.

### Tester

Defined in `lib/types.ts`.

Created from the registration sheet, if one is detected. Tester rows are keyed by tester ID, email, and Discord so response rows can be matched later.

Important fields:

- `id`: internal app ID, like `tstr_0`.
- `testerId`: original registration ID, or fallback.
- `email`, `discord`: matching keys.
- `segments`: flexible map of demographics and hardware fields.
- `ageGroup`, `country`, `gamingProfile`, `hardware`: convenience fields copied or derived from `segments`.
- `rawProfileJson`: full original registration row.

If a response row cannot be matched to registration data, the parser creates a placeholder tester with ID like `tstr_unmatched_12`.

### Category

Defined in `lib/types.ts`.

The parser always creates the same fixed category list in `lib/parser.ts`. Categories are not read from the Excel file.

Questions are assigned to categories by regex rules in `CATEGORY_RULES` in `lib/parser.ts`. The category builder page can then manually reassign questions in the stored Zustand state.

### Question

Defined in `lib/types.ts`.

Created from every non-meta column in the response sheet.

Important fields:

- `id`: generated from column order, like `q_000`, `q_001`.
- `text`: column header flattened into one line.
- `type`: inferred by `detectQuestionType()`.
- `categoryId`: inferred by `suggestCategory()` or `null`.
- `sourceColumn`: original Excel column header.
- `scaleMin`, `scaleMax`: set only for detected rating questions.

The optional fields `avgScore`, `responseCount`, and `lowScorePct` exist in the type and are populated in mock data, but imported questions generally do not have them. Many real dashboard stats are recomputed from `responses`.

### Response

Defined in `lib/types.ts`.

Created once per non-empty answer cell for every question column in every response row.

Important fields:

- `questionId`: links to the generated question.
- `testerId`: matched or placeholder tester.
- `rawAnswer`: original cell converted to a trimmed string.
- `numericValue`: `Number(rawAnswer)` when possible, regardless of question type.
- `normalizedScore`: 0-100 score only when the question has `scaleMin` and `scaleMax`.
- `submittedAt`: parsed timestamp column, or current import time fallback.
- `matchStatus`: `matched` or `needs_check`.

`normalizedScore` is the main input for most score-based metrics.

## Excel Import Pipeline

### Upload Entry Point

`app/upload/page.tsx`:

- Accepts `.xlsx` and `.xls`.
- Reads the file as an `ArrayBuffer`.
- Calls `parseExcelFile(buffer, file.name)`.
- Passes the parse result to `loadFromExcel()`.
- Redirects to `/overview`.

### Sheet Detection

Owned by `detectSheetRole()` in `lib/parser.ts`.

Rules:

- Sheet names containing `registration`, `synced`, `profile`, or `tester` are treated as registration sheets.
- Sheet names containing `response`, `answer`, or `form` are treated as response sheets.
- Sheet name `sheet2` is ignored.
- Any unknown sheet defaults to `responses`.

Sensitivity:

- This is tailored to the current workbook naming style.
- The first sheet classified as responses wins.
- If an unrelated first sheet has an unknown name, it can be selected as the responses sheet before the actual response sheet is reached.

### Registration Parsing

Owned by the registration section of `parseExcelFile()`.

The parser:

- Converts the registration sheet to JSON rows.
- Finds an ID column by `/\bid\b|tester.?id|user.?id|uid/i`, falling back to the first column.
- Finds optional email and Discord columns.
- Classifies known demographic and hardware columns using `SEGMENT_RULES`.
- Derives `hardware_tier` from GPU and RAM using `deriveHardwareTier()`.
- Stores each tester in a map by ID, lowercased email, and lowercased Discord.

Sensitivity:

- Registration segment detection depends on exact-ish English header wording.
- Hardware tiering is regex based and can misclassify unfamiliar GPUs.
- CPU is read but not used for tiering.

### Response Meta Columns

Owned by the response section of `parseExcelFile()`.

Meta columns are removed from the question list:

- ID column.
- Email column.
- Discord column.
- Timestamp column matching the strict `META_TIMESTAMP_PATTERN`.

Everything else becomes a `Question`.

Sensitivity:

- If a tester identifier column has unusual wording, it may become a question.
- If a timestamp field has unusual wording, it may become a question.
- If a real survey question header matches ID/email/Discord/timestamp patterns, it can be excluded as metadata.

### Question Type Detection

Owned by `detectQuestionType(header, values)` in `lib/parser.ts`.

Current order:

1. If the header contains `timestamp`, `submitted`, `date`, or `time`, classify as `timestamp`.
2. If the header contains admin/internal/payment terms, classify as `internal_admin`.
3. If the header contains upload/file/link/evidence terms, classify as `file_upload`.
4. If all non-empty values are numeric:
   - min >= 1 and max <= 5 -> `rating_1_5`.
   - min >= 1 and max <= 10 -> `rating_1_10`.
5. If all distinct values look yes/no-ish -> `yes_no`.
6. If there are 8 or fewer distinct values and at least 5 answers -> `multiple_choice`.
7. Otherwise -> `free_text`.

Sensitivity:

- Numeric non-rating columns can be classified as rating questions. Example: hours played, counts, age, FPS values, or other numeric facts.
- A free-text question mentioning time/date/timestamp can be classified as `timestamp`.
- The type detection uses observed answer values, not only the question wording.
- Rating direction is assumed positive: higher numeric value always means better. Negative-valence questions like "How often did you feel frustrated?" are therefore risky unless the scale text makes high values explicitly positive.

### Category Assignment

Owned by `suggestCategory()` and `CATEGORY_RULES` in `lib/parser.ts`.

This is intentionally tailored to the current Exovia playtest form. Category assignment uses regexes against question text. First match wins.

Sensitivity:

- New wording can miss categories.
- Similar wording can match the wrong category.
- The order matters because the first matching rule wins.
- Categories themselves are fixed and game-specific.

### Category Structure (current)

The dashboard uses 10 fixed categories. The previous 15-category structure was consolidated in June 2026 to reduce fragmentation and better reflect the distinction between player experience and commercial signal.

| ID | Name | Scored | Purpose |
|----|------|--------|---------|
| cat_01 | Player Background | No | Gaming history and prior experience — segmentation lens only |
| cat_02 | Overall Experience | Yes | Enjoyment, frustration, quit moments, favourite part, session length |
| cat_03 | Retention & Market Fit | Yes | Continue playing, NPS recommendation, stand-out vs. competitors, reasons to return |
| cat_04 | Game Clarity & Onboarding | Yes | Mechanic comprehension, objectives, in-game guidance, feeling stuck, trial-and-error |
| cat_05 | Progression & Engagement | Yes | Progress depth, tech pacing, stopping reasons, factory growth, peak excitement |
| cat_06 | Core Mechanics | Yes | Zero-gravity movement and laser mining — the two hands-on physical loops |
| cat_07 | Automation & Factory Systems | Yes | Logistics, resource transport, automation satisfaction, space accelerators |
| cat_08 | UI & Quality of Life | Yes | Interface clarity, menu navigation, QoL requests |
| cat_09 | Technical & Evidence | No | Performance issues, bugs, gameplay recordings |
| cat_15 | Admin / Internal | No | Internal scoring, payment tracking — never shown in client-facing views |

The overview page gauge row excludes categories whose names contain `admin`, `internal`, `evidence`, `background`, or `recording`. cat_01 and cat_09 are filtered out this way without hardcoding their IDs. cat_15 is also excluded by its name and by an explicit `cat_15` ID check used for question counting.

The split between cat_02 (Overall Experience) and cat_03 (Retention & Market Fit) is intentional. cat_02 captures whether playing the game was enjoyable. cat_03 captures commercial signals: would the tester return and recommend it? These are different questions for different audiences — design team vs. product/business.

### Tester Quality & Outlier Detection

All tester quality logic lives in **`lib/outliers.ts`** (`computeTesterQuality()`), called once from `parseExcelFile()` after responses are built. Results are stored on `tester.quality` (a `TesterQuality` object), with `tester.avgRating` and a legacy `tester.isOutlier` convenience derived from it. Detection is **population-level** — computed over the whole uploaded set, not re-derived per active filter.

Benchmark questions = all `rating_1_5` / `rating_1_10` questions except cat_01 (Player Background), cat_09 (Technical & Evidence), and cat_15 (Admin / Internal). Negative-valence questions marked `isInverseScored` are inverted (`100 − normalizedScore`) before any math.

Two **independent** signals are produced:

#### 1. Sentiment outlier (harsh critic / overly positive)

This measures genuine rater severity, with two deliberate design choices that fix the old `mean − 1.5·SD` method:

1. **Per-question deviation** removes question-mix bias. For each benchmark response, `deviation = effectiveScore − questionMean` (the mean for *that* question across all testers). A tester's `severity` is the mean of their deviations, so answering mostly hard/low-scoring questions no longer makes someone look negative.
2. **Robust standardization** with median + MAD, not mean + SD, so the outliers don't distort their own threshold: `robustZ = (severity − median) / (1.4826 × MAD)`.

A tester is flagged `harsh` when `robustZ < −2.5` and `generous` when `robustZ > +2.5`.

Guards: `severity` is only computed with ≥ 5 benchmark responses (`minForSeverity`), is shrunk toward 0 by `n/(n+5)` so thin samples aren't flagged on noise, and **no sentiment flags are produced unless ≥ 10 testers have a severity score** (`minGroupForFlags`). `avgRating` (0–5, = `avgNorm/20`) still shows with ≥ 3 responses.

#### 2. Quality outlier (straight-lining)

A tester who answered ≥ 8 rating questions and gave the same value to ≥ 95% of them is flagged `straight_liner`. This is the only flag that justifies *excluding* a tester — it's low-information noise rather than a strong opinion.

#### Constants

All thresholds live in `OUTLIER_CONFIG` at the top of `lib/outliers.ts` (no magic numbers in the logic).

#### Where it surfaces

- **Testers page** — filter chips per flag type (with counts), a header breakdown, and a ⚠️ whose tooltip shows the reason (e.g. "Scored 38 vs 67 group · 2.8σ below").
- **Tester panel** — each flag shown with its reason.
- **Export** — `sentiment`, `straight_lining`, `robust_z`, and `flags` columns.
- **Global filters** — see below. By default flags affect nothing; aggregates include everyone.

## State Ownership

The central store is `lib/store.ts`.

Persisted state:

- `project`
- `testers`
- `categories`
- `questions`
- `responses`
- `themes`
- `isLoaded`

Not persisted:

- Filters.
- Open drawers.
- Open tester panel.
- AI panel state on the question detail page.
- Running/error UI state except theme analysis status while in memory.

Important actions:

- `loadMockData()`: replaces store data with `lib/mockData.ts`.
- `loadFromExcel()`: replaces store data with parsed Excel data and clears AI themes.
- `assignQuestionToCategory()`: updates `questions[].categoryId`.
- `runThemeAnalysis()`: sends questions/responses/categories to `/api/themes` and streams themes back into store.

## Filters

Filter UI is in `components/filters/FilterPanel.tsx`.

Filter application is in selectors in `lib/store.ts`:

- `selectFilteredTesterIds()`
- `selectFilteredResponses()`
- `selectFilteredTesters()`
- `selectActiveFilterCount()`

Filter dimensions:

- Age group.
- Gender.
- Country.
- Hardware tier.
- Session playtime.
- Played Factorio.
- Played Satisfactory.
- Exclude straight-liners (data-quality).
- Exclude harsh critics (data-quality).

Demographic filters come from registration data. Session playtime and prior-game filters come from survey questions detected by regex.

The two data-quality exclusions are driven by `tester.quality` (see Tester Quality & Outlier Detection). They default off, only appear in the panel when such testers exist, and — because every page derives its numbers through `selectFilteredTesterIds()` — they propagate to overview, category, and question scores, not just the testers table. "Exclude harsh critics" shows a caveat: removing the most critical testers mechanically raises every score, so it is a robustness check, not data cleaning.

Sensitivity:

- Session playtime filter only appears if a question text matches the playtime regex.
- Factorio and Satisfactory filters only appear if matching questions are assigned to `cat_01`.
- These filters depend on question wording and category assignment.

## Overview Page Metric Lineage

Main file: `app/(dashboard)/overview/page.tsx`.

The overview reads:

- `project` from Zustand.
- `questions` from Zustand.
- `responses` through `selectFilteredResponses()`.
- `categories` from Zustand.
- `testers` through `selectFilteredTesters()`.
- `themes` from Zustand.

This means most overview numbers respect active filters, but AI themes are not filtered by tester filters.

### Participants

Displayed in the Snapshot section.

Source:

- `countRespondents(responses)` from `lib/responseStats.ts`.
- Uses filtered responses.
- Counts unique non-null `testerId` values.

Meaning:

- "How many unique testers have at least one currently visible response."

Not the same as:

- Total registered testers.
- Total Excel rows.
- `project.totalResponses`.

### Avg Playtime

Displayed in the Snapshot section.

Source:

- Finds the first question whose text matches a playtime/session-duration regex.
- Uses numeric answers for that question from filtered responses.
- Averages `numericValue`.

Meaning:

- Average numeric answer to the detected playtime question.

Sensitivity:

- If the playtime question is not detected, shows no data.
- If another numeric time-related question is matched first, this can be wrong.

### Top Age Group

Displayed in the Snapshot section.

Source:

- Filtered testers from `selectFilteredTesters()`.
- Counts `tester.ageGroup`.

Meaning:

- Most frequent age group among currently visible testers.

### Overall Score

Displayed in the Snapshot section.

Source:

- All filtered responses with `normalizedScore !== null`.
- Average of `normalizedScore`, rounded.

Meaning:

- Average normalized rating score across all detected rating questions.

Important caveat:

- Every normalized rating response has equal weight. A question with many responses contributes more than a question with few responses.
- Negative-valence questions are not inverted.
- Any numeric non-rating question misclassified as a rating affects this score.

### Playtest Health KPI Cards

Displayed in the Playtest Health section.

The page looks for specific questions by text regex:

- `Overall Enjoyment`: first question matching `enjoy.*overall|overall.*enjoy`.
- `Gameplay Clarity`: first question matching `game.?mechanic.*overall|how.*intuitive`.
- `Continue Playing Intent`: first question matching `continue.*playing`.
- `Recommendation Score`: first question matching `recommend.*friend`.

The Recommendation Score is from a single detected question, not a collection of questions.

For each found KPI question:

- Uses `responses` filtered to that question.
- Requires `numericValue !== null`.
- Average is raw numeric value, displayed as `/ 5` or `/ 10` depending on the hardcoded KPI definition.
- Positive/neutral/negative percentages are based on `numericValue / max`:
  - positive: `>= 0.6`
  - negative: `< 0.35`
  - neutral: everything else

If none of these KPI questions are found, the page falls back to:

- `Overall Satisfaction`
- Average of all `normalizedScore` values.
- Positive: normalized score `>= 60`.
- Negative: normalized score `< 35`.

Sensitivity:

- KPI question selection is text-regex based.
- The scale is hardcoded in the KPI definition, not taken from `question.scaleMax`.
- Sentiment thresholds here use raw `numericValue / max`, which differs from other pages that use `normalizedScore`.

### Category Scorecard

Displayed in the Category Scorecard section.

Source:

- Categories excluding names containing admin, internal, evidence, background, or recording.
- For each category, collect questions with that `categoryId`.
- Collect filtered responses for those questions with `normalizedScore !== null`.
- Category average is the average normalized score.
- Categories require at least 3 normalized score responses to appear.

Meaning:

- Average rating health per category.

Important caveat:

- This is response-weighted, not question-weighted.
- It depends on question category assignment.

### Top Strengths

Displayed in Core Insights.

Source:

- Top 3 highest category scores from the Category Scorecard calculation.
- Optional quote: first free-text response in that category between 30 and 200 characters.

Meaning:

- Highest-scoring categories by normalized rating average.

### Areas of Concern

Displayed in Core Insights.

Source:

- Bottom 3 category scores from the Category Scorecard calculation.
- `negativePct`: percentage of category rating responses with `normalizedScore < 40`.
- Related themes: AI themes with matching `categoryId`.

Meaning:

- Lowest-scoring categories by normalized rating average.

Important caveat:

- AI themes are global/current store themes. They are not recalculated for active demographic filters.

### Player Segment Insights

Displayed in Player Segment Insights.

Source:

- All filtered normalized score responses.
- Tester segment fields:
  - `gamer_type`
  - `age_group`
  - `hardware_tier`
- Computes the lowest-scoring segment for each field when the segment has at least 3 normalized score responses.
- Shows a card only if the segment average is at least 7 points below the global normalized-score average.

Meaning:

- Simple heuristic: segments whose rating responses are noticeably below the global average.

Important caveat:

- This is response-count based, not tester-count based.
- It is not a statistical test.
- One tester answering many rating questions can have more weight.

### AI Insights Banner

Displayed at the bottom of the overview.

Source:

- `themes` array in Zustand.

Meaning:

- Shows how many AI themes exist and how many distinct non-null `categoryId` values they cover.

## Categories Pages

### Categories List

Main file: `app/(dashboard)/categories/page.tsx`.

For each category:

- Finds questions assigned to the category.
- Finds filtered responses for those questions.
- Uses responses with `normalizedScore !== null` as rating responses.
- `avgScore`: average normalized score.
- `negativePct`: percentage of normalized scores below 40.
- `respondentCount`: unique testers in that category's filtered responses.
- `severity`:
  - `Critical` if score < 40 or negativePct > 50.
  - `High` if score < 55 or negativePct > 35.
  - `Medium` if score < 70 or negativePct > 20.
  - `Low` otherwise.
- `topThemes`: AI theme labels for the category.

Categories are sorted worst first by `avgScore`.

### Category Detail

Main file: `app/(dashboard)/categories/[id]/page.tsx`.

Shows:

- Category header.
- Themes where `theme.categoryId` matches.
- Each question assigned to the category.
- Per-question rating distribution.
- Free-text sample responses.

Important caveat:

- Some score displays in this page still read optional mock-only fields like `q.avgScore` and `q.lowScorePct`. Imported Excel questions usually do not have these fields.
- The mini rating chart currently selects responses with `numericValue !== null`, not strictly `normalizedScore !== null` or rating question type.

## Questions Pages

### Questions List

Main file: `app/(dashboard)/questions/page.tsx`.

For each question:

- Collects filtered responses for that question.
- Collects rating responses where `normalizedScore !== null`.
- Computes `avgNorm` as average normalized score.
- Shows a score bar when `avgNorm` exists.
- Shows category and response count.

Important caveat:

- The text score display still depends on optional `q.avgScore`, which exists in mock data but usually not imported Excel data.

### Question Detail

Main file: `app/(dashboard)/questions/[id]/page.tsx`.

For a rating question:

- `ratingResponses`: responses where `normalizedScore !== null`.
- `avg`: average raw `numericValue`.
- low scores: `normalizedScore < 40`.
- high scores: `normalizedScore >= 65`.
- neutral: everything else.
- rating distribution: `computeRatingDistribution(ratingResponses, scale)`.
- segment breakdown: `components/charts/SegmentBreakdown.tsx`.

For multiple choice or yes/no:

- Counts exact trimmed `rawAnswer` values.
- Calculates percentage of responses for each option.

For free text:

- Displays responses where `numericValue === null && rawAnswer`.

Important caveat:

- Numeric free-text answers are hidden from the free-text list because they have `numericValue !== null`.
- The rating distribution memo depends on `id`, `responses.length`, and `scale`, so it can become stale if response content changes without length changing.

## Evidence Drawer

Main file: `components/ui/EvidenceDrawer.tsx`.

Opened from rating charts and AI theme source buttons.

Source:

- `drawerQuestionId` and optional `drawerRatingValue` in Zustand.
- Looks up the selected question.
- Filters responses by `questionId`.
- If `drawerRatingValue` is set, also filters by rounded `numericValue`.

Meaning:

- Lets the user inspect source responses behind a chart bucket or a theme's primary question.

## Tester Panel

Main file: `components/ui/TesterPanel.tsx`.

Source:

- `activeTesterId` in Zustand.
- Tester profile from `testers`.
- Responses for that tester from `responses`.
- Question text lookup from `questions`.

Meaning:

- Shows one tester's registration profile and response history.

## AI Theme Analysis

### Global Themes Page

Main files:

- Client: `app/(dashboard)/themes/page.tsx`.
- Store action: `runThemeAnalysis()` in `lib/store.ts`.
- API route: `app/api/themes/route.ts`.

Flow:

1. User clicks Run Analysis.
2. `runThemeAnalysis()` POSTs all `questions`, `responses`, and `categories` to `/api/themes`.
3. The API filters to questions where `q.type === 'free_text'`.
4. For each free-text question, it sends response IDs and truncated response text to OpenAI.
5. OpenAI is asked to call a `record_theme` function 5-10 times.
6. The API streams each theme back as Server-Sent Events.
7. The store appends each theme to `themes`.

Stored theme fields:

- `label`
- `summary`
- `severity`
- `confidence`
- `frequency`
- `representativeQuotes`
- `linkedResponseIds`
- `categoryId`
- `questionId`
- `priority`

Important caveats:

- AI themes are generated from all stored responses, not active filtered responses.
- Response text is sent to OpenAI.
- The schema currently does not require `categoryId`, `questionId`, or `priority`, even though the UI benefits from them.
- The upload page says all processing happens locally, but AI analysis sends data to OpenAI when run.

### Per-Question AI Analysis

Main files:

- Client panel: `app/(dashboard)/questions/[id]/page.tsx`.
- API route: `app/api/question-analysis/route.ts`.

Flow:

1. User opens a question detail page.
2. User clicks Analyse Responses.
3. The client sends the selected question, its currently filtered responses, and all testers to `/api/question-analysis`.
4. The API sends up to 80 meaningful responses to OpenAI.
5. OpenAI returns JSON with:
   - summary
   - themes
   - highlights
   - actionable recommendation
   - segmentInsights
6. The result is held in local React state only.

Important caveat:

- Per-question AI results are not persisted. Navigating away clears them.

## Export

Main file: `app/(dashboard)/export/page.tsx`.

Exports:

- Responses CSV:
  - Each response joined with question text, category name, tester ID, raw answer, numeric value, normalized score, match status, and timestamp.
- Themes CSV:
  - Current AI themes in Zustand.

Exports use current store data, not a backend report.

## Mock Data vs Imported Data

Mock data lives in `lib/mockData.ts`.

Mock questions include fields such as:

- `avgScore`
- `responseCount`
- `lowScorePct`

Imported questions generally do not include those fields. For imported Excel data, the safer source of truth is the `responses` array.

This distinction matters because some UI components still reference optional question-level summary fields. If those fields are absent, imported data can display less information than demo data.

## What Is Tailored to the Current Excel/Form?

Strongly tailored:

- Fixed category list.
- Category regexes in `CATEGORY_RULES`.
- KPI question regexes on the overview page.
- Filter question detection for playtime, Factorio, and Satisfactory.
- Registration segment header regexes.
- Sheet name assumptions.
- Hardware tier regexes.
- The hardcoded `gameName: 'Exovia'`.

Moderately generic:

- Reading workbook sheets with `xlsx`.
- Turning non-meta response columns into questions.
- Creating one response object per non-empty answer cell.
- Normalizing 1-5 and 1-10 rating scales to 0-100.
- Counting respondents by unique tester IDs.

Fragile assumptions:

- Higher rating number always means better.
- Numeric answers in 1-5 or 1-10 ranges are ratings.
- First regex match is the correct category/question.
- A single question can represent a high-level KPI such as Recommendation Score.
- AI theme category/question links are correct because the model supplies them.

## Practical Debugging Checklist

When a displayed number looks wrong:

1. Find the page component that renders it.
2. Check whether it uses raw `responses`, `selectFilteredResponses()`, `testers`, or `selectFilteredTesters()`.
3. Check whether it uses `numericValue`, `normalizedScore`, or optional mock fields on `Question`.
4. Find the source question by matching the regex used on that page.
5. Verify the question's `type`, `scaleMin`, `scaleMax`, and `categoryId`.
6. Verify whether active filters are changing the response/tester set.
7. If the metric is AI-backed, check whether it came from `themes` or from temporary per-question AI state.

## Recommendations for Future Hardening

These are architecture improvements, not current behavior:

- Add explicit parser warnings for unknown sheet selection and suspicious question type detection.
- Store parser confidence on each question.
- Add `scoreDirection` or `isInverseScored` for negative-valence rating questions.
- Separate numeric factual answers from rating answers; do not let every numeric answer drive charts.
- Move shared metric calculations into a tested `lib/metrics.ts` module.
- Make KPI definitions configurable instead of regex-only.
- Persist category mapping overrides separately from imported question IDs, because IDs depend on column order.
- Require or validate `categoryId`, `questionId`, and `priority` in AI theme results.
- Update UI copy so local-only processing is distinguished from optional OpenAI analysis.
