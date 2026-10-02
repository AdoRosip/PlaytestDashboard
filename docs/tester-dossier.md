# Tester dossier

The Testers table opens `/testers/[testerId]` (or `/tests/[testId]/testers/[testerId]` through the existing Portal rewrite). Quick view and the existing Questions, Responses, and evidence actions still open the store-controlled dialog. Both wrappers render `TesterProfile`.

List search and quality/genre filters travel in the URL, so back navigation and Prev/Next use the same ordered list. Global segment and cross-filters remain in the dashboard store. Group means use the currently filtered responses; an individual dossier always contains that tester's submitted answers. Mixed rating scales are normalized onto 1–5 for the summary; individual meters and their group means retain the original scale.

## Verified Portal mapping

- `anonymous` and `username` feed the shared display-name helper. Only explicitly non-anonymous usernames are included in the server DTO. Labels use the submission ID, since the API does not provide a stable tester ID.
- `ageRange`, `gamingHoursPerWeek`, `gamingPreferences`, `gamerType`, and `steam.gameCount` are the actual profile keys. Registry groups use an explicit allowlist, never raw object iteration.
- `ScaleAgree`, `ScaleQuality`, `ScaleIntent`, `Rating1_5`, and `Rating1_10` are scored ratings. `SingleChoice` remains an unscored answer. `Category` and `DisplayOrder` retain API metadata; section headers are excluded from answers.
- `steamMatchGenres` is authoritative when supplied, including an empty array.
- `files[].fileName`, `contentType`, `url`, and `questionId` map recordings. Images are excluded from Videos. Signed media URLs stay in memory in Portal mode; they are not persisted or passed through an image optimizer.
- `comments[].createdAt` supplies the session-comment timestamp.
- Emails, evaluation scores, payout fields, Steam account identifiers, and raw registry objects are excluded from the new profile mapping. Rendered profile text also redacts email-shaped strings.

## Missing API fields

The supplied contract has no file title, upload timestamp, duration, resolution, thumbnail, or individual answer link. Optional media metadata is supported when supplied; duration and resolution are otherwise read from the video. Upload order falls back to API order. Missing upload timestamps are omitted rather than replaced with submission time. Thumbnails use a CORS-enabled frame capture and fall back to stripes. Playback errors offer the signed download link when available.

Uploads currently point to File questions, which have no `answers[]` entry. A Linked answer action appears only if the referenced question/response actually has an answer. `subscriptions` has no field in the spec and remains omitted. An inline Portal profile counts as registry data; explicit false and unavailable profiles retain the required tri-state behavior.

The referenced `Tester Profile.dc.html` was absent from the supplied directory. Styling follows the implementation spec's dossier tokens and layout, scoped to the dossier so the existing dashboard theme stays intact.

The stacked layout also activates when the dossier container is narrow, since the dashboard's navigation and filter rails consume up to 480px on desktop. Browser fixtures have their own `.next-fixture` output directory so checks can run alongside an existing development server.
