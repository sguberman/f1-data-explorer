# Closed issues (legacy, #1–#55)

Archive of the issues tracked here before the move to [GitHub Issues](https://github.com/sguberman/f1-data-explorer/issues)
(GitHub issue #9). Numbers below are legacy numbers, which overlap GitHub's. New issues are closed on GitHub
when their PR is merged; this file isn't updated any more. Details are condensed from the project's issue log.

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

## #45 — Knockout label clipped on phones (bug)
The drivers chart's knockout-area label was drawn at a hardcoded x (`x.getPixelForValue(18)`) and ran off
the right edge on narrow screens. It's now centered ~78% of the way along the season (round 18 of 23, so
desktop is unchanged) and clamped inside the plot area.

## #46 — Constructors chart matches the drivers chart
Both championship charts now draw the same "Below the knockout line" label (shared
`F1Common.drawKnockoutLabel()`), and both summaries use the constructors wording: "Below the line" /
"Projected to fall below at current form". Owner's choice: "below" describes it more accurately than
"eliminated", since the line is drawn from the highest-ranked *selected* entry. Differences that come from
drivers having teammates (legend grouped by team, dashed second driver) stay.

## #23 — Clear cached data
A **Refresh data** button in the status line (`controls.js`, every data page) clears every cached f1api.dev
response for all seasons (`F1Data.clearCache()`, keys under `f1cache:v1:`) and reloads the selected season.
The theme and selected season are kept.

## #47 — Standings movement indicators
Picker rows on all four pages show a green ▲n / red ▼n for places gained/lost in the standings since the
previous round (`F1Common.standingsMoves()`), using the same points ranking as the pickers. Blank when
unchanged and at round 1; updates live with the round slider, no network requests.

## #48 — Loading and error states
`F1Data.loadSeason()` now resolves to `{rounds, failed, fetchedAt}`. A failed load shows a red message
with **Retry** under the status line (partial: "some results may be missing (showing rounds 1–N)"; total:
"Couldn't load the YEAR season"). While loading, chart and picker slots (`.f1-skel`) show a pulsing
placeholder after 150ms (static under reduced motion) and the drag handle is hidden. A load token keeps a
slower older load from overwriting a newer one.

## #49 — "Data last refreshed" timestamp
Cache entries record their fetch time (`t`). The status line shows "updated 5 min ago" for the newest data
used, with the exact time on hover, refreshed every minute without fetching. Entries cached before this
change have no time until they're refetched.

## #9 — Championship position by round
New card below the picker on drivers.html and constructors.html: every driver/team as a line, P1 at the
top, a flat segment at each round's position joined to the next round by an angled line. Always shows the
whole loaded season (independent of the round slider and picker); ties on points broken by countback of
Grand Prix finishes. Shared renderer in `common.js` (`standingsByRound()`, `renderPositionChart()`).

## #10 — Projected final points / position over time
Drivers and constructors pages now run: points chart → **Projected final points** (picker selection) →
picker → **Championship position by round** (everyone). The projected-points chart shows what the points
chart's projection (points so far + last-5-participated-rounds average × rounds left) said after each
round; its last value equals the end of the points chart's projection line. The position card's **Show**
dropdown switches between actual standings and projected final standings. Both ignore the round slider.
Shared code in `common.js` (`projectionsByRound()`, `renderProjectedPointsChart()`).

## #51 — Deploy only the site
The website moved into `site/`, and the GitHub Pages workflow deploys only that folder, so the project docs
and tests are no longer served. URLs are unchanged. Deploys run only when `site/` or the workflow changes.

## #52 — Preview deploys and review-and-merge workflow
Cloudflare Pages is connected to the repo (output folder `site`): every PR branch gets a preview link,
posted on the PR, using live f1api.dev data. Each issue now gets its own branch and PR that also moves the
issue to `DONE.md`, so merging the PR is the owner's approval and closes the issue. Documented under
"Review and merge" in `PROJECT_CONTEXT.md` and in `CLAUDE.md`.

## #53 — Tests in the repo, run on every PR
Browser tests in `tests/` (headless Chromium, fake f1api.dev data, local Chart.js): a smoke test of every
page plus checks for #9, #10, #23, #44–#49. `.github/workflows/tests.yml` runs them on every pull request
and uploads page screenshots.

## #54 — CLAUDE.md
`CLAUDE.md` is read automatically at the start of each Claude Code session; it points to
`PROJECT_CONTEXT.md` and summarizes the owner's standing rules.

## #55 — README and docs/ folder
Added `README.md` (what the site is, live link, how it works, repo layout, running it locally and the
tests, how changes are made). Moved `PROJECT_CONTEXT.md`, `TODO.md`, `DONE.md` and `BRAINSTORM.md` into
`docs/`; `CLAUDE.md` stays at the repo root, where Claude Code reads it. Updated `CLAUDE.md` and the file
layout in `PROJECT_CONTEXT.md`.
