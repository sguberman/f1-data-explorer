# Closed issues

Issues the owner has explicitly confirmed closed. Details are condensed from the project's issue log.

## #1–#6 — Pre-tracking foundation
Done before numbered tracking began, so individual details weren't recorded. Together they produced:
cumulative drivers' points line chart with team colors (lead driver solid, teammate dashed), three-letter
driver codes, projections to season end from each driver's last 5 rounds, the drivers' "knockout line",
the constructors' chart, the multi-page static site with shared light/dark theme, GitHub Pages deployment,
live client-side fetching/caching from f1api.dev with a season picker, and a selectable driver list.

## #7 — Driver-picker layout
Reviewed 3 mockups; picked compact ranked rows (checkbox, rank, team-color dot, name, points).

## #12 — Simulator weighting options
Closed as satisfied by #30 (weights now come from each driver's finishing-position distribution).

## #13 — Mobile-friendly layout
- drivers.html / constructors.html: on screens ≤600px the canvas end-of-line labels are dropped and a
  ranked legend list (`#endLegend`) is shown below the chart, so the plot gets full width.
- position.html: ridgeline x-axis labels rotate on narrow screens (they collided at P10 / 11+/DNF).
- Every sort control is a plain `<select>` at all screen sizes, labeled "Sort by".
- position.html's Below P10 / Mechanical DNFs / Sprints toggles are checkboxes under a "Show" label on its
  own line; "Show" and "Sort by" share the same text style.
- Presets trimmed to All / None / Top 5 / Top 10 on drivers, position and simulator pages
  (constructors keeps All / None / Top 2 / Top 5, since there are only ~11 teams).
- A preset button is highlighted only when the current selection exactly matches it (all 4 pages).
- Added `-webkit-text-size-adjust:100%` site-wide (Mobile Safari was inflating an isolated label).

## #15 / #16 (merged) — Single constructors page
Merged the old top-4 and midfield constructors pages into `constructors.html` with the drivers'-page
pattern and selectable teams.

## #17 — position.html on live data
Moved to F1Data/F1Controls with the ranked driver picker and live per-driver histograms.

## #18 — simulator.html on live data
Simulator is fully live-data driven (F1Data/F1Controls).

## #19 — Pickers below charts
Driver and team pickers moved below the chart on both championship pages.

## #20 — index.html reorganization
Removed the Drivers/Constructors section headers; both championship pages listed first.

## #21 — Short team names on the constructors chart
Short names (e.g. "Red Bull") in the legend and end-of-line labels.

## #22 — Wrong point tallies (bug)
Two fixes in `data.js`: (1) a failed sprint fetch was cached as "no sprint" — failures are never cached now;
(2) root cause: f1api.dev returns sprint results under `sprintRaceResults`, not `results`.

## #24 — Live round slider
The controls slider dispatches a lightweight `f1roundchange` event on every drag step; pages recompute
from loaded data with no network calls and no selection reset.

## #25 — Short team names on the drivers chart legend

## #26 — Drivers' knockout line based on the selected leader
Knockout line uses the highest-ranked *selected* driver, matching constructors.html.

## #27 — Theme setting as a dropdown
Single trigger (icon + "Light/Dark/System Theme" + chevron) opening a menu with icons; closes on
selection, outside click or Escape.

## #28 — Cache misses on reload (bug)
f1api.dev returns HTTP 404 for the sprint endpoint when a round has no sprint. `fetchJSON` treated 404 as a
failure, so "no sprint" was never cached and every load re-fetched. 404 is now a cached, confirmed negative.

## #30 — Simulator uses finishing-position distributions
Each simulated race order is drawn slot by slot (P1, then P2, …) weighted by each driver's own historical
probability of that position (mechanical DNFs excluded), with smoothing (`HIST_SMOOTH = 0.5`).

## #31 — Simulator final-position distribution
Reports each tracked driver's distribution of final championship position, ranked against the full grid.

## #32 — Simulator ridgeline plots
Points distribution and final-position breakdown redrawn as ridgeline (joyplot) charts ordered by median.
Fixed a bug where hashed `hsl()` team colors rendered black with a hex alpha suffix (`withAlpha()` helper).

## #33 — position.html single ridgeline chart
Replaced the per-driver panel grid with one ridgeline chart ordered by median finish.

## #34 — No re-animation on slider drag
`animation:false` on the position.html ridgeline chart.

## #35 — position.html chart options
Sort (median / championship / team), below-P10 expansion, mechanical-DNF inclusion, and sprint inclusion
(on by default, merged into the same histogram). All update live from cached data, no new fetches.

## #36 — Mechanical DNF toggle did nothing (bug)
f1api.dev's `retired` field is always `null`, so the keyword classifier never fired anywhere on the site.
Replaced with hand-researched `MANUAL_OVERRIDES` in `data.js` for every 2026 DNF through round 16
(a few causes still unknown — see `TODO.md`).

## #37 — Full names in pickers
Driver pickers show the full name with a small muted code tag; team labels and the constructors picker show
full official team names. Chart legends still use short names.

## #44 — Shared code moved out of the pages
Code that was copied into every chart page now lives in one place: `common.js` (`F1Common`) holds the
team colors and short names, `SEASON_META` (which also drives the season dropdown in `controls.js`),
`isNarrow()`, one `withAlpha()` (replacing the two different `rgba()` / `withAlpha()` copies),
`rankedDriverIds()`, the driver picker row and the preset highlighting. The picker list CSS moved into
`theme.css`. Page-specific code (charts, picker sorting/grouping, the constructors' team row, each page's
preset lists) stays on its page. Verified pixel-identical before/after on every page.
