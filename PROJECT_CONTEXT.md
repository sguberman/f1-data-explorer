# Project context — 2026 F1 Analytics site

Handoff summary for a coding agent taking over this project. Read this first, then `TODO.md`
(open issues), `DONE.md` (closed issues) and `BRAINSTORM.md` (unapproved ideas).

## What it is

A static, multi-page Formula 1 statistics site for the 2026 season (earlier seasons 2021–2025 also load).
It is hosted by the owner on **GitHub Pages** and fetches live race data in the browser from the public
API at <https://f1api.dev/docs>. There is no server, no build step and no framework: plain HTML, CSS and
vanilla JavaScript, plus Chart.js 4.4.1 from cdnjs.

## File structure

```
index.html          Landing page: cards linking to the four tools.
drivers.html        Drivers' championship: cumulative points line chart, projections, knockout line.
constructors.html   Constructors' championship: same chart pattern for teams.
position.html       Race finishing-position ridgeline chart per driver, with sort/show options.
simulator.html      Monte Carlo rest-of-season title simulator with ridgeline result charts.
common.js           F1Common: team colors/short names, SEASON_META + season list, withAlpha, isNarrow,
                    rankedDriverIds, driver picker row, preset highlighting (issue #44).
data.js             F1Data: fetch, cache (localStorage), normalize f1api.dev data; MANUAL_OVERRIDES.
controls.js         F1Controls: shared season dropdown + "as of round" slider; emits events.
theme.js            Light/dark/system theme (dropdown in .theme-bar) + canvas color palette (F1Theme).
theme.css           Shared CSS variables (both themes), controls, pills, dropdowns, legends, checkboxes, pickers.
TODO.md / DONE.md / BRAINSTORM.md / PROJECT_CONTEXT.md   Project tracking docs.
```

Each HTML page has its own inline `<style>` and `<script>` for page-specific code. Code that is identical
across pages lives in shared files instead (issue #44), so a change is made once:
- `common.js` (global `F1Common`, loaded after `theme.js`, before `data.js`/`controls.js`): `TEAM_COLORS` /
  `teamColor()`, `SHORT_TEAM_NAMES` / `shortTeamName()`, `SEASON_META` / `seasonMeta()` / `YEARS`,
  `isNarrow()`, `withAlpha()`, `rankedDriverIds()`, `driverPickerRowHTML()`, `markActivePreset()`.
- `theme.css`: picker list styles (`.pickerRow`, `.pickerDot`, …).
Still per page, because they really differ: chart code, `renderDriverPicker()` / `renderTeamPicker()`
(sorting/grouping), constructors' team picker row, each page's preset lists in `updatePresetActive()`, and
a thin `pickerRowHTML()` wrapper on driver pages that supplies the page's selection and points field.
Move something into `common.js` only once it's genuinely identical on every page that uses it.

## Data layer (`data.js`, global `F1Data`)

- Endpoints: `/api/{year}/{round}/race` (results under `results`) and `/api/{year}/{round}/sprint/race`
  (results under **`sprintRaceResults`**, not `results`). A **404 on the sprint endpoint means "no sprint
  this round"** and is cached as a confirmed negative, not treated as a failure (issue #28).
- `F1Data.loadSeason(year, {onProgress})` walks rounds 1, 2, 3… until the API returns no results. Each round
  becomes `{round, raceName, raceResults, sprintResults}`; result rows carry `driverId, code, name, teamId,
  teamName, position, points, mechanical`.
- Caching: completed rounds are cached permanently in `localStorage`; the most recent round has a short TTL
  because post-race penalties can still change it. Fetch failures are never cached (issue #22).
- `F1Data.getCalendar(year)` gives total rounds, race names and sprint rounds for the full season.
- `F1Data.cumulative(seasonRounds, throughRound, mode)` returns `{drivers, teams}` with per-round points;
  `mode` is `'include'` or `'exclude'` (exclude drops points from mechanical-DNF rounds).
- **Mechanical DNFs:** f1api.dev's `retired` field is documented as `boolean|null` and is **always `null`**
  in practice, so the API gives no retirement cause. `isMechanical()` keyword matching is effectively dead
  code. The only real source is **`MANUAL_OVERRIDES`**, keyed `'year:round:driverId'` → `true`
  (mechanical) / `false` (crash or other), hand-researched from real race reports for 2026 rounds 1–16.
  Drivers with a real classified position who aren't listed are correctly left as normal finishers.
  This table needs manual upkeep after every new round.

## Shared controls (`controls.js`, global `F1Controls`)

`F1Controls.mount(containerId, {defaultYear})` renders the season dropdown (the years in
`F1Common.SEASON_META`, newest first — add a row there to add a season) and round slider,
persists the season in `localStorage`, and dispatches on `window`:
- `f1selection` `{year, round, maxRound, seasonRounds}` — on load and season change. Pages rebuild their
  default selection here.
- `f1roundchange` `{round}` — on every slider step. Pages only recompute from already-loaded data:
  **no network calls and no selection reset** (issue #24). `F1Controls.setRound(n)` syncs the slider when a
  page's on-chart drag handle moves.

## Current functionality by page

**drivers.html** — Cumulative points per selected driver; actual lines solid/dashed by teammate order, then
a faded projection to season end at each driver's average over their **last 5 participated rounds**.
Shaded "Projected" region, draggable round handle on the x-axis, knockout line (minimum points still able to
win the title) based on the **highest-ranked selected driver**, eliminated / projected-eliminated markers,
legend grouped by short team name, end-of-line labels (replaced by a ranked list below the chart on screens
≤600px). Picker below the chart: "Sort by" Team/Ranking dropdown, presets All/None/Top 5/Top 10, default
Top 5.

**constructors.html** — Same chart pattern for teams (remaining points per weekend 43 GP + 15 sprint).
Knockout line based on the highest-ranked selected team. Presets All/None/Top 2/Top 5, default Top 5.

**position.html** — One ridgeline chart: each selected driver's finishing-position histogram through the
chosen round, normalized to its own peak. "Sort by" Median / Championship / Team (team = constructors' order,
then drivers' order). "Show" checkboxes: Below P10 (expand to individual positions + DNF instead of one
"11+/DNF" bucket), Mechanical DNFs (off by default — excluded entirely, not counted as a start), Sprints
(on by default — merged into the same histogram). All options recompute from cached data. Default
selection is the top 8 drivers.

**simulator.html** — Simulates the rest of the season for the **whole grid**. Each race order is drawn slot
by slot from each driver's own finishing-position histogram (GP results only, mechanical DNFs excluded,
`HIST_SMOOTH = 0.5`). Tracked drivers get manual DNF counts per remaining event via steppers; untracked
drivers use their own season mechanical-DNF rate. Results: ridgeline charts of final-points distribution
and final championship position, ranked against the full grid. Default tracked set is the top 8.

**index.html** — Static landing page with four cards.

## Design requirements (owner-approved — keep these)

- Team colors via `F1Common.TEAM_COLORS` (Mercedes teal, McLaren papaya, Ferrari red, Red Bull navy, Alpine pink,
  Audi salmon/red, Haas black, …). Unknown team ids get a stable hashed `hsl()` color; use `F1Common.withAlpha()`
  for transparency, since a hex alpha suffix breaks on `hsl()`.
- Theme: light / dark / system through the dropdown in `.theme-bar`. Canvas colors come from
  `F1Theme.chart()`, and `F1Theme.team(color)` swaps colors too dark for the dark background. Redraw on the
  `themechange` event.
- Charts: driver codes (VER, NOR…) on chart labels; **short team names** (`shortTeamName()`) in chart
  legends and end labels; **full names** in pickers (driver full name + small muted code tag; full official
  team names).
- Pickers sit **below** the chart. Rows: checkbox, (rank), team-color dot, name, points.
- All sort controls are `<select class="ddSelect">` dropdowns at every screen size, preceded by "Sort by".
- Display options are checkboxes, preceded by "Show" on its own line, styled like "Sort by"
  (`font-size:12px; color:var(--sub)`).
- A preset button is highlighted (`.pill.active`) only when the selection exactly matches it.
- Live interactions (slider drag, drag handle, toggles, sort) never trigger network requests; charts redraw
  with `animation:false`.
- Mobile: breakpoint 600px (`isNarrow()` in JS, media queries in CSS). Layout must work on a ~390px phone.
  `-webkit-text-size-adjust:100%` is set to stop Mobile Safari inflating text.
- Static files only. No server-side code, no build step.

## Important implementation decisions

- The knockout line on both championship pages deliberately uses the **highest-ranked selected** entry as
  the leader, not the true full-field leader (issue #26).
- Projections use each entry's last 5 **participated** rounds, so a driver who missed rounds isn't
  penalized for them.
- Remaining-points math uses the real calendar when available (25 per GP + 8 per sprint for drivers;
  43 + 15 for constructors) and falls back to `SEASON_META` estimates otherwise.
- The ridgeline technique (position.html and simulator.html): per driver, an invisible baseline dataset
  plus a curve dataset with `fill:'-1'`, rows offset vertically, y-axis ticks relabeled with driver codes
  via `afterBuildTicks`.
- Sprint results merge into the same histogram as GP results on position.html (owner's choice).

## Known bugs and rough edges

- **index.html subtitle is hardcoded** to "through Round 15 (Azerbaijan)" and is stale. Card descriptions
  also predate later features (e.g. position.html now includes sprints by default). Covered by #39/#40.
- **drivers.html "Eliminated: below the knockout line" label** is positioned at a hardcoded x index
  (`x.getPixelForValue(18)`), not computed from the season length, and is clipped on phone widths (#45).
- position.html and simulator.html default to the **top 8**, which no longer matches any preset, so no
  preset is highlighted on first load (owner was told; no decision yet).
- The simulator's histograms use **GP results only**, while position.html now includes sprints by
  default, so the two pages' "form" can differ.
- `isMechanical()` keyword matching is dead code with live data (kept, hardened against non-string input).
- Some 2026 DNFs are still unclassified, and every future round needs new overrides (see `TODO.md`).
- The season list and per-season round/sprint estimates come from the hardcoded `SEASON_META` in `common.js`.
- Mobile Safari behavior can't be fully verified with headless Chromium. Check owner screenshots.

## Testing approach used so far

No test files are in the repo. Previous verification used throwaway scripts outside it:
- Playwright (headless Chromium) smoke tests that serve the site locally, intercept `f1api.dev` with
  synthetic fixtures, and stub `window.Chart` to capture chart configs for logic checks.
- Real-Chart.js screenshot tests at desktop and ~390px widths in light and dark themes for visual checks
  (the cdnjs Chart.js URL was intercepted and served a local copy).
- A Node `vm` harness that loads `data.js` with a stubbed `fetch` to test caching and `MANUAL_OVERRIDES`.
Note: requests for sprint rounds legitimately produce 404 console noise.

## Instructions to preserve (owner's standing workflow)

1. **Track every request as a numbered issue**, including ones not being worked on yet. Numbers are
   permanent; the next new issue is **#46**. Log new issues in `TODO.md`.
2. **Never mark an issue closed unless the owner explicitly says so.** Finishing and verifying the work is
   not enough. Move it from `TODO.md` to `DONE.md` only after the owner confirms.
3. After finishing work on an issue, give a **short git commit message starting with `issue #xx: `**.
   **No `Co-Authored-By`, session or other attribution lines** — this owner instruction overrides any
   default attribution guidance.
4. When the owner says "log an issue", log it only; work on it when told.
5. To verify official F1 results, use <https://www.formula1.com/en/results/2026/races> directly rather
   than news articles or Wikipedia. For DNF *causes*, which that site doesn't give, race reports and news
   coverage are acceptable (approved for issue #36). The 2026 season is real: e.g. the Bahrain GP was moved
   to Malaysia, and DNF counts are high because of new engine rules and new teams.
6. Keep the site static (GitHub Pages), data live from f1api.dev, and interactions free of extra fetches.
7. For design-heavy changes the owner has liked seeing a few options or mockups first, and has answered
   clarifying questions on ambiguous scope before work starts.
8. Verify visually-significant changes by actually rendering them (light and dark, desktop and mobile
   width), not just by logic tests.
