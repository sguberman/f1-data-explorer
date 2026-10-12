# Open issues

Numbered issues that are logged but not yet done. Numbers are permanent. New issues continue from #47.
An issue moves to `DONE.md` **only when the owner explicitly says it is closed**. Finishing and verifying
the work is not enough on its own.

| # | Area | Issue |
|---|------|-------|
| 8 | New tool | A qualifying-pace comparison tool for any drivers, not limited to teammates. |
| 9 | New chart | A chart showing championship **position** (not points) by round. |
| 10 | New chart | A chart showing projected championship finishing position and/or projected final points by round. |
| 11 | simulator.html | Option to simulate two specific drivers taking each other out in the same race. |
| 14 | New tool | A head-to-head tool comparing various stats for two drivers. |
| 23 | All pages | Add a "clear cached data" button (data is cached in `localStorage` by `data.js`). |
| 29 | Data | For completed seasons, which won't change, store and serve the data statically from the site (for example, a build-time JSON snapshot per season) instead of fetching f1api.dev live every time. Keep live fetching only for the in-progress season. |
| 38 | simulator.html | Add a manual control for the number of **wins** in the remaining races for tracked drivers, using the same stepper UI pattern as the existing DNF controls. |
| 39 | index.html | Improve index.html. (Note: its subtitle is hardcoded to "through Round 15 (Azerbaijan)" and is stale, and the card descriptions predate several features. See Known bugs in `PROJECT_CONTEXT.md`.) |
| 40 | All pages | Improve the lede / subtitle text across the site. |
| 41 | simulator.html | Changing which drivers are tracked should not require re-running the simulation. (Today `onSelectionChanged()` calls `hideResults()`, which discards results.) |
| 42 | All pages | Add national flags to driver names, team names, and rounds (round names/numbers). Add driver numbers to driver names. |
| 43 | data.js | Research mechanical-vs-other DNF causes for prior (pre-2026) seasons and add them to `MANUAL_OVERRIDES`, using the same hand-researched approach as issue #36. |
| 45 | drivers.html | On narrow screens the "Eliminated: below the knockout line" label is clipped at the chart's right edge. It's drawn at a hardcoded x position (`x.getPixelForValue(18)`) rather than computed from the season length and chart width. |
| 46 | constructors.html | Make the constructors chart work the same way as the drivers chart. (1) Draw the "Eliminated: below the knockout line" label in the shaded area, positioned the same way as the drivers label after #45. (2) The summary below the chart uses different wording: drivers says "Eliminated" / "Projected to be eliminated at current form", constructors says "Below the line" / "Projected to fall below at current form". Pick one wording for both. Differences that come from drivers having teammates (legend grouped by team, dashed second driver) stay. |

## Pending research inside a closed issue (#36)

These 2026 DNFs have no cause found yet and are deliberately left unclassified in `MANUAL_OVERRIDES`
(they count as non-mechanical by default):

- Round 5: Alonso, Lindblad
- Round 6: Sainz
- Round 7: Bearman, Albon, Bottas, Stroll
- Round 14: Sainz

Each new round after round 16 also needs its DNFs researched and added to `MANUAL_OVERRIDES`.
