# Open issues

Numbered issues that are logged but not yet done. Numbers are permanent. New issues continue from #55.
An issue moves to `DONE.md` **only when the owner explicitly says it is closed**. Finishing and verifying
the work is not enough on its own.

| # | Area | Issue |
|---|------|-------|
| 8 | New tool | A qualifying-pace comparison tool for any drivers, not limited to teammates. |
| 10 | New chart | A chart showing projected championship finishing position and/or projected final points by round. |
| 11 | simulator.html | Option to simulate two specific drivers taking each other out in the same race. |
| 14 | New tool | A head-to-head tool comparing various stats for two drivers. |
| 29 | Data | For completed seasons, which won't change, store and serve the data statically from the site (for example, a build-time JSON snapshot per season) instead of fetching f1api.dev live every time. Keep live fetching only for the in-progress season. |
| 38 | simulator.html | Add a manual control for the number of **wins** in the remaining races for tracked drivers, using the same stepper UI pattern as the existing DNF controls. |
| 39 | index.html | Improve index.html. (Note: its subtitle is hardcoded to "through Round 15 (Azerbaijan)" and is stale, and the card descriptions predate several features. See Known bugs in `PROJECT_CONTEXT.md`.) |
| 40 | All pages | Improve the lede / subtitle text across the site. |
| 41 | simulator.html | Changing which drivers are tracked should not require re-running the simulation. (Today `onSelectionChanged()` calls `hideResults()`, which discards results.) |
| 42 | All pages | Add national flags to driver names, team names, and rounds (round names/numbers). Add driver numbers to driver names. |
| 43 | data.js | Research mechanical-vs-other DNF causes for prior (pre-2026) seasons and add them to `MANUAL_OVERRIDES`, using the same hand-researched approach as issue #36. |
| 50 | Pickers | Picker order and the ▲/▼ movement arrows sort by points only, while the championship-position chart (#9) breaks ties by countback of Grand Prix finishes. When two entries are level on points the picker order can disagree with the chart. Make them use the same ranking (`F1Common.standingsByRound()`). |
| 51 | Repo | Deploy only the site's files to GitHub Pages, so the project docs (`TODO.md`, `PROJECT_CONTEXT.md`, …) aren't served over HTTP. Move the site into `site/` and deploy just that folder. |
| 52 | Workflow | Preview deploys: every pull request gets its own preview URL to test (with real f1api.dev data) before merging to the live site. Options: Netlify or Cloudflare Pages (per-PR URLs, needs an account), or a GitHub-only `/preview/` folder on the live site. Then issues close inside their PR and merging = approval. |
| 53 | Repo | Keep the automated browser tests (headless Chromium + fake f1api.dev data) in the repo under `tests/`, not deployed, and run them on every pull request with a GitHub Action. |
| 54 | Repo | Add a `CLAUDE.md` (read automatically by Claude Code at the start of every session) pointing to `PROJECT_CONTEXT.md` and summarizing the owner's standing rules. |

## Pending research inside a closed issue (#36)

These 2026 DNFs have no cause found yet and are deliberately left unclassified in `MANUAL_OVERRIDES`
(they count as non-mechanical by default):

- Round 5: Alonso, Lindblad
- Round 6: Sainz
- Round 7: Bearman, Albon, Bottas, Stroll
- Round 14: Sainz

Each new round after round 16 also needs its DNFs researched and added to `MANUAL_OVERRIDES`.
