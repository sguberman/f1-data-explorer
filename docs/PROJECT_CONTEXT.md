# Project context — F1 Data Explorer

Handoff summary for a coding agent taking over this project. Read this first, then the open
[GitHub issues](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+-label%3Aidea) (open work, excluding ideas), the [ideas](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+label%3Aidea) (issues
labelled `idea`), and `DONE.md` (archive of legacy issues #1–#55).

**Issue numbers.** Issues are tracked in GitHub Issues since GitHub issue #9. Before that they lived in
`docs/TODO.md` with their own numbering (legacy #1–#55), which overlaps GitHub's. References in `DONE.md`,
in code comments and in commits made before the migration are legacy numbers; `TODO.md` maps the legacy
issues that were still open to their GitHub numbers. When citing a legacy issue in new text, write
"legacy #44"; a bare "#N" means the GitHub issue or PR.

## What it is

A static, multi-page Formula 1 statistics site for the 2026 season (earlier seasons 2021–2025 also load).
It is hosted by the owner on **GitHub Pages** and fetches live race data in the browser from the public
API at <https://f1api.dev/docs>. There is no server, no build step and no framework: plain HTML, CSS and
vanilla JavaScript, plus Chart.js 4.4.1 from cdnjs.

**Hosting (#37).** The live site is <https://f1.gubes.net/>. The custom domain is set in this repo's
Settings → Pages; since `site/` is deployed by a GitHub Actions workflow, no `CNAME` file is needed in the
repo. DNS is at Hover: a CNAME `f1` → `sguberman.github.io`, plus the `_github-pages-challenge` TXT record
that verifies the domain with GitHub. `gubes.net` and `www.gubes.net` forward to the site using Hover's
Forwards. `sguberman.github.io/f1-data-explorer/` redirects to the custom domain automatically. PR
previews are on Cloudflare Pages (`*.f1-data-explorer.pages.dev`; see "Review and merge").

## File structure

Only `site/` is deployed to GitHub Pages (issue #51); everything else in the repo is never served.

```
site/                 The website (deployed as the site root, so URLs are unchanged)
  index.html          Landing page: a card per page, each with a picture of its main chart.
  drivers.html        Drivers' championship: cumulative points line chart, projections, knockout line.
  constructors.html   Constructors' championship: same chart pattern for teams.
  position.html       Race finishing-position ridgeline chart per driver, with sort/show options.
  simulator.html      Monte Carlo rest-of-season title simulator with ridgeline result charts.
  whatif.html         What-if: drag a finishing order for a round, see both championships after it.
  common.js           F1Common: helpers shared by the chart pages (issue #44 and later).
  data.js             F1Data: fetch, cache (localStorage), normalize f1api.dev data; SPRINT_OVERRIDES.
  controls.js         F1Controls: shared season dropdown + "as of round" slider; emits events.
  theme.js            Light/dark/system theme (dropdown in .theme-bar) + canvas color palette (F1Theme).
  nav.js              Site navigation (#62): home link + Pages menu at the left of .theme-bar (data pages).
  share.js            F1Share (#31): each page's setup in its URL (read once, kept current), Share button.
  export.js           F1Export (#33): "⤓ PNG · CSV" under each chart (composed PNG, CSV of the chart's data).
  theme.css           Shared CSS variables (both themes), controls, pills, dropdowns, legends, pickers.
  flags/              Flag SVGs (#18).
  favicon.svg         Favicon (#68): red rising line on a checkered flag. favicon.ico (16/32/48px) and
                      apple-touch-icon.png (180px, square; iOS rounds it) are rendered from it.
  data/               {year}.json: one file per season, written by the snapshot workflow (#13). Don't edit by hand.
.github/workflows/    static.yml deploys site/ on pushes to main that touch site/ (or the workflow).
                      tests.yml runs tests/ on PRs. snapshot.yml refreshes site/data/ (#13).
tools/                snapshot.mjs: builds site/data/{year}.json from f1api.dev (run by snapshot.yml).
tests/                Browser tests, run on every PR (see "Tests" below). Not deployed.
docs/                 Project docs (not deployed): PROJECT_CONTEXT.md (this file), DONE.md (archive of
                      legacy issues #1–#55), TODO.md (legacy → GitHub issue numbers).
README.md             What the project is, links, how to run the tests. CLAUDE.md: Claude Code session notes
                      (stays at the repo root, where Claude Code looks for it).
```

Each HTML page has its own inline `<style>` and `<script>` for page-specific code. Code that is identical
across pages lives in shared files instead (issue #44), so a change is made once:
- `common.js` (global `F1Common`, loaded after `theme.js`, before `data.js`/`controls.js`): `TEAM_COLORS` /
  `teamColor()`, `SHORT_TEAM_NAMES` / `shortTeamName()`, `SEASON_META` / `seasonMeta()` / `YEARS`,
  `isNarrow()`, `withAlpha()`, `driverPickerRowHTML()`, `pickerTeamLabelHTML()`, `markActivePreset()`,
  `standingsOrder()` / `standingsRank()` (standings order with countback, for pickers, ▲/▼ and presets, #20),
  flags and numbers (#18: `flagCode()`, `flagHTML()`, `drawFlag()`, `flagSpace()`, `ridgeFlags()`,
  `indexPeople()` / `nationalityOf()` / `numberOf()`), `ridgeMarkers()` / `ridgeKeyHTML()` (#30),
  `standingsByRound()` / `renderPositionChart()` (the championship-position chart, issue #9),
  `projectionsByRound()` / `renderProjectedPointsChart()` (projection history, issue #10).
- `theme.css`: picker list styles (`.pickerRow`, `.pickerDot`, …), `.flag`, `.pickerNum`, `.ridgeKey`.
- `flags/`: small SVG flags (from flag-icons, MIT, see `flags/LICENSE.txt`) for the countries the site maps.
  Spain and Mexico are simplified to keep them small. Add a file (and a name in `FLAG_CODES`) for a new country.
Still per page, because they really differ: chart code, `renderDriverPicker()` / `renderTeamPicker()`
(sorting/grouping), constructors' team picker row, each page's preset lists in `updatePresetActive()`, and
a thin `pickerRowHTML()` wrapper on driver pages that supplies the page's selection and points field.
Move something into `common.js` only once it's genuinely identical on every page that uses it.

## Data layer (`data.js`, global `F1Data`)

- Endpoints: `/api/{year}/{round}/race` (results under `results`) and `/api/{year}/{round}/sprint/race`
  (results under **`sprintRaceResults`**, not `results`). A **404 on the sprint endpoint means "no sprint
  this round"** and is cached as a confirmed negative, not treated as a failure (issue #28).
- `F1Data.loadSeason(year, {onProgress})` walks rounds 1, 2, 3… until the API returns no results, and
  resolves to `{rounds, failed, fetchedAt}`. Each round becomes `{round, raceName, raceResults,
  sprintResults, country}` (`country` = the circuit's, #18); result rows carry `driverId, code, name, teamId,
  teamName, number, nationality, teamNationality, position, points, session`. `position` is the classified
  finishing position, or `null` when not classified (f1api.dev sends null, "-" or "NC").
  `failed` is true if any fetch failed (the load stops at the first failed round; a failed sprint reads as
  "no sprint"), issue #48. `fetchedAt` is the newest fetch time of the data used, issue #49.
- **Season files (#13):** `site/data/{year}.json` = `{v:1, year, generatedAt, complete, calendar, rounds}`,
  `rounds` in exactly the shape `loadSeason()` returns. `loadSeason()` fetches the file first: one request
  for the whole season, and `getCalendar()` reuses its calendar. A `complete` season (every calendar round
  present) makes no f1api.dev requests at all; an in-progress one then checks f1api.dev one round at a time
  from the round after the file's last, so new results still appear straight after a race. A missing or
  broken file falls back to the old live walk. Refresh data re-downloads the file (`fresh`). "updated … ago"
  is the newer of the file's `generatedAt` and any live check.
  **Generator:** `tools/snapshot.mjs` runs `site/data.js` itself in Node (`loadSeason(year, {live:true})`),
  so the files match what pages build from the live API. It skips complete past seasons (`--all` rebuilds
  everything), never overwrites a file after a failed fetch, and only rewrites a file whose data changed.
  **Jolpica patch (#59):** f1api.dev's 2021–2023 data has no sprint results and numbers every driver (no
  "not classified"). For those years the generator patches the file from Jolpica (`api.jolpi.ca/ergast/f1`,
  Ergast's successor): race positions from `positionText` (a number = classified, R/D/W/N… = `null`), Jolpica's
  points, and sprint results (`session:'sprint'`). It only patches when both sources agree on the rounds and
  drivers and the sprint rounds match the calendar; otherwise it warns and keeps the file as it was. A patched
  file carries `patched:{source:'jolpica', version}`; bumping `PATCH_VERSION` re-patches those seasons once.
  **Workflow:** `snapshot.yml` runs daily, hourly on Sundays and Mondays (UTC), by hand (Actions → Update
  season data, optionally "all"), and on pushes that change the generator or `data.js`. It commits
  `issue #13: update season data (automated)` and, on `main`, starts the Pages deploy itself (commits made
  by a workflow don't trigger other workflows).
- **Daily check (#60):** the check of f1api.dev for rounds newer than the season file runs at most once a
  day per season, across the whole site. A clean check is kept as `f1cache:v2:{year}/checked` =
  `{firstLive, rounds}` (the rounds it found from `firstLive` on; with no season file, the whole season) for
  24 hours, with `t` = the newest data time for "updated … ago". Until it expires, every page load and season
  switch reuses it and makes no f1api.dev requests; rounds a newer season file covers are dropped from it.
  A failed check isn't kept. Refresh data clears it (`clearCache()`), so it checks right away. New results
  still arrive during the day through the season file, which the scheduled job updates.
- Caching: completed rounds are cached permanently in `localStorage` under `f1cache:v2:` (bumped from
  `v1:` for #18's new fields; old `v1:` entries are deleted on load); the most recent
  round has a short TTL because post-race penalties can still change it. Each entry is `{v, exp, t}`, where
  `t` is when it was fetched (kept when re-stamping the TTL). Fetch failures are never cached (issue #22).
  `F1Data.clearCache()` removes every `f1cache:v2:` entry (issue #23); the theme and the
  `f1cache:selectedSeason` key are kept.
- `F1Data.getCalendar(year)` gives total rounds, race names and sprint rounds for the full season.
- `F1Data.cumulative(seasonRounds, throughRound)` returns `{drivers, teams}` with per-round points.
- **Finishes and NC (#46):** retirement causes aren't tracked (f1api.dev gives none; the old hand-researched
  mechanical/non-mechanical table was removed). A result with a classified position counts as that finish,
  even if the driver retired; a result with no classified position is **NC** ("not classified") on the
  position page and a **DNF** in the simulator — the same rule on both.
  Drivers with a real classified position who aren't listed are correctly left as normal finishers.
  This table needs manual upkeep after every new round.

## Links and exports (#31, #33)

- **Links (`share.js`, `F1Share`).** The URL always carries `season`. It carries `round` only when the slider
  isn't on the latest round, plus each page's own keys, leaving out anything at its default:
  - drivers: `d` (ids), `sort`, `pos`
  - constructors: `t`, `pos`
  - position: `d`, `sort`, `chart`, `below10`, `sprint`
  - what-if: `gp` and `sprint` orders (`-` marks the not-classified line)
  - simulator: `d`, `sort`, `o` (`id:dnf:win`, `a` = auto), `c` (`a:b:n`), `n` (runs) and `seed`
  
  How it works:
  - `F1Controls` reads the season and round on the first load.
  - Each page reads its keys once in its first `buildFromSelection` (`F1Share.take()`), drops unknown ids, then
    calls `F1Share.sync()`.
  - Each page registers a getter (`F1Share.register`), and the URL is rewritten in place
    (`history.replaceState`) after every click, change or key press. No reload, no fetch.
  - Opening a link loads the season as usual.
  - The **Share** button (in the season row) copies the link, or opens the share sheet on touch devices.
  - **Simulator:** every random draw comes from a generator seeded per run (`seededRandom`, mulberry32). The URL
    has the run's `seed`, `n` and round while the results shown still match the settings. Opening such a link
    re-runs automatically to exactly the same results.
- **Exports (`export.js`, `F1Export.attach`).** Each chart card ends with "⤓ PNG · CSV".
  - The PNG has the title, season and round, the legend, the chart (copied from its canvas) and
    "f1.gubes.net", on the current theme's panel colour, at the screen's pixel density. The simulator's win
    probability (HTML bars) is drawn for the picture. The site icon (`favicon.svg`) sits beside the address in the
    bottom-right corner (#76).
  - On a touch device that can share files (`navigator.canShare`), PNG and CSV open the share sheet (#75); anywhere
    else, or if sharing is refused, they download.
  - The CSV is the data behind the chart: points and projection per round with the knockout line, projected
    totals, positions per round, finishing-position counts, simulated shares, and the what-if tables (CSV only).
  - Files are named `f1-{season}-{chart}-r{round}`.
  - `F1Export.championshipPage()` wires the three charts shared by the drivers and constructors pages.

## Shared controls (`controls.js`, global `F1Controls`)

`F1Controls.mount(containerId, {defaultYear})` renders the season dropdown (the years in
`F1Common.SEASON_META`, newest first — add a row there to add a season) and round slider,
persists the season in `localStorage` (`f1cache:selectedSeason`), and dispatches on `window`. The saved
season wins over `defaultYear`, so moving between pages keeps it (#62; pages pass no `defaultYear`, which
falls back to the newest season):
- `f1selection` `{year, round, maxRound, seasonRounds}` — on load and season change. Pages rebuild their
  default selection here.
- `f1roundchange` `{round}` — on every slider step. Pages only recompute from already-loaded data:
  **no network calls and no selection reset** (issue #24). `F1Controls.setRound(n)` syncs the slider when a
  page's on-chart drag handle moves.

The status line reads "12 rounds loaded · updated 5 min ago · Refresh data" (issue #49: relative age of the
newest data, exact time on hover, ticks every minute without fetching). **Refresh data** clears the whole
cache and reloads the season (issue #23). If a load fails, an error message with **Retry** appears under
the status line (issue #48). While a season loads, `<html>` has the class `f1-loading`; elements marked
`.f1-skel` (each page's chart and picker slots) show a pulsing placeholder after 150ms, and the drag handle
is hidden. A load token makes a newer load win over a slower older one.

## Current functionality by page

**drivers.html** — Cumulative points per selected driver; actual lines solid/dashed by teammate order, then
a faded projection to season end at each driver's average over their **last 5 participated rounds**.
Shaded "Projected" region, draggable round handle on the x-axis, knockout line (minimum points still able to
win the title) based on the **highest-ranked selected driver**, eliminated / projected-eliminated markers,
legend grouped by short team name, end-of-line labels (replaced by a ranked list below the chart on screens
≤600px). Picker below the chart: "Sort by" Team/Ranking dropdown, presets All/None/Top 5/Top 10, default
Top 5.

Both championship pages are laid out (issue #10, "Layout A"): points chart → **Projected final points**
card → picker → **Championship position by round** card. Cards above the picker follow the picker
selection; the card below it shows every driver/team.
- **Projected final points** (issue #10): for the picker selection, what the points chart's projection
  (points so far + last-5-participated-rounds average × rounds left) said after each round. Its last value
  equals the end of the points chart's projection line. End labels on wide screens, ranked list (`.endLegend`)
  on narrow ones. Projections are computed once per season (`projData`) and the chart only rebuilds when the
  selection changes.
- **Championship position by round** (issue #9): every driver/team as a line, P1 at the top, a flat segment
  at each round's position joined to the next round by an angled line; ties broken by countback of Grand
  Prix finishes. A **Show** dropdown switches between *Actual standings* and *Projected final standings*
  (issue #10: ranked by the projection after each round; ties go to the higher-placed entry).
- Both cards always cover the whole loaded season and ignore the round slider; driver codes / short team
  names as end labels, solid/dashed teammate convention.

**constructors.html** — Same chart pattern for teams (remaining points per weekend 43 GP + 15 sprint).
Knockout line based on the highest-ranked selected team. Presets All/None/Top 2/Top 5, default Top 5.

**position.html** — One ridgeline chart: each selected driver's finishing-position histogram through the
chosen round, normalized to its own peak. "Sort by" Most common / Championship / Team (team = constructors' order,
then drivers' order). "Show" checkboxes: Below P10 (expand to individual positions + NC instead of one
"11+/NC" bucket; NC = not classified, explained under the chart), Sprints
(on by default — merged into the same histogram). All options recompute from cached data. Default
selection is the top 8 drivers. Each ridge marks its **most common** finish(es) with a small triangle above
the curve, every one when tied (#30). The mode is always taken over individual positions plus NC, so the
grouped "11+/NC" bucket never wins just for being a group; when the most common finish is below P10 and
those positions are grouped, the triangle sits on that bucket labelled with the real position(s) ("P13",
"NC", "P12/P14"). "Most common" sorting (the default) uses the best most-common finish, ties by standings.

**simulator.html** — Simulates the rest of the season for the **whole grid**. Each race order is drawn slot
by slot from each driver's own finishing-position histogram (GP results only, every classified result —
DNFs, i.e. no classified position, are left out; `HIST_SMOOTH = 0.5`). Retirements are modeled separately
(#39): drivers on **auto** retire in each event at their own DNF rate this season (results with no classified
position ÷ GP starts — the same rule as the position page's NC, #46). Everyone is on auto unless set
otherwise in the "Tracked drivers in the remaining races" card: each tracked driver has a **DNFs** and a
**Wins** stepper, both showing grey "auto" by default (#42, #14); − from auto sets 0, + sets 1, − at 0 goes
back to auto. "Reset all to auto" clears both; "Reset all to 0" sets both to 0. A set DNF count = retire
in exactly that many random remaining events; a set win count = win exactly that many random GPs (and
never P1 in other GPs; sprints aren't affected). **Collisions** (#11) pair any two drivers for n GPs where
both retire, on top of their DNFs. Per simulated season (`planSeason`): forced wins, then collisions, then
exact DNFs, then auto retirements in the events still open. Steppers stop at what's possible (one winner per
GP; wins + collisions ≤ GPs left; DNFs + wins + collisions ≤ events left). Settings only exist for tracked
drivers and are dropped when a driver is untracked. Results (#17): a run stores every driver's final points
and rank for each simulated season (`lastRun`), so changing the tracked set redraws the same run without
re-running; changing a setting or the round keeps the results with a "Settings changed since this run" note
and a Run again button; loading another season clears them. A run (#56) is computed in ~40 ms slices with
"Simulating… X of N seasons" progress, the Run button becomes Cancel (cancelling keeps the previous
results), and the settings key is taken when the run starts. The engine works on typed arrays
(`planSeason` returns `winnerOf[e]` = index or -1 and `out[i][e]` = 1 for a DNF) with precomputed
finish weights, about 4× faster than before. Never spread a whole run's results into one call
(`Math.min(...all)`): 30,000 seasons overflowed the browser's argument limit and crashed the run, which
was the reported "hang". Results: win probability plus ridgeline charts
of final-points distribution and final championship position, ranked against the full grid, each ridge
marking its most common value (#30): the position chart uses exact ranks (one outside the top k is marked on
the last column, labelled "P14"); the points chart marks the most common 10-point range, labelled with the
most common exact total in it. Both are ordered by that most common value. Default
tracked set is the top 8.

**whatif.html** — What-if results (#48). The round after the slider's round gets a draggable finishing
order: a Grand Prix list, plus a sprint list on a sprint weekend (from the actual round, or the calendar's
sprint rounds). It starts from the actual result when that round has happened, else from the drivers'
standings after the slider's round ("Actual result" / "Standings order" buttons reset). Drag by the handle
(pointer events, so mouse and touch; auto-scrolls near the screen edge) or focus the handle and use ↑/↓.
A "Not classified below" line is dragged too: everyone below it gets no position and no points. Points
25-18-15-12-10-8-6-4-2-1, sprints 8-…-1 (3-2-1 in 2021); no fastest-lap point (noted for ≤2024). Below, the
drivers' and constructors' tables after that round: position, ▲/▼ vs the standings before it, points
before, gained and after, ranked with countback (`F1Common.standingsOrder` on the season with that round
replaced by your result; later rounds left out). Full names on desktop, codes / short team names on phones.
Live and lap-by-lap running orders were considered and left out (see #48 for the API research).

**index.html** — Static landing page (#50): five cards, one per row, in the order Drivers' Championship,
Constructors' Championship, Race Finishing Positions, Title Simulator, What-If Results. Each card has a
picture of that page's main chart on the left (on top on phones): an inline SVG with illustrative shapes, not
real data (the drivers' picture ends each line with a driver number and code, the constructors' with a
team-coloured name badge; no team logos, which are trademarks), coloured through CSS variables so it follows the theme (team colours as on the charts, Red Bull's
navy lightened in dark). The page loads no data. The title and intro sit on a soft checkered-flag banner
(`.hero`, #78): a CSS conic-gradient in the theme's own `--inset`/`--panel` tones, with a faint text halo for legibility.

## Design requirements (owner-approved — keep these)

- Site name: **F1 Data Explorer**. Page headings: Drivers' Championship, Constructors' Championship, Race
  Finishing Positions, Title Simulator (the landing-page cards use the same names). Each page's `<title>` is
  "Name · F1 Data Explorer" without a year; `controls.js` prefixes the selected season (#16).
- Page introductions say what the page shows, then how to use it, in plain sentences (#15/#16).
- Team colors via `F1Common.TEAM_COLORS` (Mercedes teal, McLaren papaya, Ferrari red, Red Bull navy, Alpine pink,
  Audi salmon/red, Haas black, …). Unknown team ids get a stable hashed `hsl()` color; use `F1Common.withAlpha()`
  for transparency, since a hex alpha suffix breaks on `hsl()`.
- Theme: light / dark / system through the dropdown in `.theme-bar`. Canvas colors come from
  `F1Theme.chart()`, and `F1Theme.team(color)` swaps colors too dark for the dark background. Redraw on the
  `themechange` event.
- Flags and numbers (#18): flags before driver names/codes (pickers, legends, end labels, ridge labels,
  simulator rows), team names on **constructor views only** (constructors picker, legend and labels; the
  what-if constructors table) and the race name in the round label (circuit country). Driver views show no
  team flags, and the drivers chart legend has no team names (#70): driver-picker team headings are the name only. Driver numbers only in driver pickers, muted, before the name. Not in tooltips or
  under x-axis rounds. Nationalities come from f1api.dev as names or demonyms; unknown ones get no flag,
  and canvas labels keep the flag's space so they still line up.
- Team colours: one colour per team (`TEAM_COLORS`) for every season, except teams that only raced in earlier
  seasons, which get that season's colour (`SEASON_TEAM_COLORS`, #72): Alfa Romeo and AlphaTauri (2021–23) and
  Sauber (2024–25, Kick green; its short name is "Sauber", not "Audi"). Values are F1's official team colours
  from FastF1's per-season table, darkened where needed to read on white; `theme.js` (`DARK_SWAP`) lightens the
  dark ones for dark mode. `F1Controls` calls `F1Common.setSeason(year)` when a season loads.
- Charts: driver codes (VER, NOR…) on chart labels; **short team names** (`shortTeamName()`) in chart
  legends and end labels; **full names** in pickers (driver full name + small muted code tag; full official
  team names).
- Pickers sit **below** the chart. Rows: checkbox, (rank), team-color dot, flag, number, name, movement, points.
  Order, ranks, ▲/▼ and presets follow the standings with ties broken by countback (`standingsOrder()`, #20). Movement
  (issue #47) is a green ▲n / red ▼n for places gained/lost in the standings since the previous round
  (`F1Common.standingsMoves()`), blank when unchanged and at round 1.
- All sort controls are `<select class="ddSelect">` dropdowns at every screen size, preceded by "Sort by".
- Display options are checkboxes, preceded by "Show" on its own line, styled like "Sort by"
  (`font-size:12px; color:var(--sub)`).
- A preset button is highlighted (`.pill.active`) only when the selection exactly matches it.
- Live interactions (slider drag, drag handle, toggles, sort) never trigger network requests; charts redraw
  with `animation:false`. The only fetches are loading a season, and the explicit Refresh data / Retry clicks.
- Mobile: breakpoint 600px (`isNarrow()` in JS, media queries in CSS). Layout must work on a ~390px phone.
  `-webkit-text-size-adjust:100%` is set to stop Mobile Safari inflating text.
- Static files only, all under `site/`. No server-side code, no build step.

## Important implementation decisions

- The knockout line on both championship pages deliberately uses the **highest-ranked selected** entry as
  the leader, not the true full-field leader (issue #26).
  For that reason both charts say "below the line" rather than "eliminated" (legacy #46). Since #16 there's no
  label on the chart; the text under it explains the line and names the selected entry it's based on.
- Projections use each entry's last 5 **participated** rounds, so a driver who missed rounds isn't
  penalized for them.
- Remaining-points math uses the real calendar when available (25 per GP + 8 per sprint for drivers;
  43 + 15 for constructors) and falls back to `SEASON_META` estimates otherwise.
- The ridgeline technique (position.html and simulator.html): per driver, an invisible baseline dataset
  plus a curve dataset with `fill:'-1'`, rows offset vertically, y-axis ticks relabeled with driver codes
  via `afterBuildTicks`.
- Sprint results merge into the same histogram as GP results on position.html (owner's choice).

## Known bugs and rough edges

- position.html and simulator.html default to the **top 8**, which no longer matches any preset, so no
  preset is highlighted on first load (owner was told; no decision yet).
- The simulator's histograms use **GP results only**, while position.html now includes sprints by
  default, so the two pages' "form" can differ.
- The season list and per-season round/sprint estimates come from the hardcoded `SEASON_META` in `common.js`.
- Mobile Safari behavior can't be fully verified with headless Chromium. Check owner screenshots.

## Tests (`tests/`, issue #53)

**Who runs what (#54):** GitHub runs the **full suite** on every push to a PR (and to `main`); that's the
"test" check on each PR, and it's the gate. Locally, before pushing, run only the test files for what
changed (`node run.js <name>`, e.g. `node run.js whatif home`), not the whole suite. If GitHub's run goes
red, fix it and push again. Two checks stay manual because they need judgement: render visual changes
(light/dark, desktop/~390px) and look at them, and break the code once to see each new test fail.
GitHub keeps every run's screenshots as the run's "screenshots" artifact on the Actions page.

Browser tests live in `tests/` (not deployed) and run on every pull request via
`.github/workflows/tests.yml`. To run them locally: `cd tests && npm ci && npm test` (or `node run.js
position projection` to run only matching files). Screenshots of every page go to `tests/artifacts/`
(git-ignored; uploaded as a CI artifact) for a person to look at — they're not compared automatically,
since fonts render differently on different machines.

- `lib/harness.js` serves `site/` at `http://site.test/`, answers f1api.dev from `lib/fixture.js` (a fake
  2026 season: 22 drivers, 12 of 23 rounds, sprints, unclassified results, one unknown team id), serves Chart.js from
  `node_modules`, and can simulate f1api.dev failures (`fail`) or slow responses (`delay`).
- Test files (`NN-name.test.js`) export `async (t, h) => { t.check(name, ok, detail) ... }`. Current files:
  smoke (every page, both themes, desktop + phone, no errors), common (#44), knockout (#45/#46),
  status (#23/#48/#49), movement (#47), position (#9), projection (#10),
  simulator (#39 DNF modeling, #42 auto DNFs, #14 wins, #11 collisions, #17 results kept), NC/finish rule shared by the position page and simulator (#46), flags and markers
  (#18/#30; movement also covers #20's tie-breaks), simulator runs (#56: responsive 30,000 run, progress, Cancel), what-if (#48: drag, keys, NC line, sprint weekends,
  points and countback), homepage (#50: card order, pictures, vertical layout, theme colours; #78: checkered banner), season files (#13: one-file
  loads, live check only after the file, complete seasons with no API calls, fallback, Refresh), daily check (#60: one check reused across pages and
  season switches, rechecked after a day or on Refresh, failed checks not kept), navigation (#62: home link and Pages menu on every
  data page, keyboard, season kept between pages, phone layout), layout (#64: every data page has the same page frame —
  margins, width, title, intro text, card style), favicon (#68: every page links it; the files are valid), team seasons (#72: Sauber/Alfa Romeo/AlphaTauri names and season colours),
  links (#31: every page's setup round-trips through the URL, defaults left out, bad values ignored, Share copies it, a
  simulator link reproduces the same results) and exports (#33: PNG and CSV contents per chart, never fetches; #75/#76: share sheet on phones with download fallbacks,
  icon in the picture's corner), Jolpica patch (#59: a stripped season patched from a fake Jolpica comes back exactly; mismatches
  stop the patch). The harness
  never serves the real `site/data/*.json`: tests pass `snapshots` built from the fake season. The fixture's names mix country names and demonyms, with
  one unknown. Logic is checked against
  independent calculations written in the tests, not against the site's own helpers.
- Add tests for each new feature in the same PR. Before trusting a new check, make sure it fails when the
  feature is broken.
- `F1Controls` and page globals are top-level `const`/`let`, so they're reachable by name in
  `page.evaluate()` but not as `window.*`. Sprint-round 404s in the console are expected.

## Review and merge (legacy #52; issues on GitHub since #9)

1. Each GitHub issue gets its own branch (`claude/issue-NN`, NN = the issue number) and pull request.
   Closely related issues can share one PR when the owner agrees.
2. The PR carries the code, tests and doc updates, and its description says `Closes #NN` so GitHub closes
   the issue when the PR is merged. No issue-list files are edited.
3. GitHub runs the tests (`tests.yml`). Cloudflare Pages (connected to the repo, output folder `site`)
   builds a preview of the PR's branch and posts its link on the PR. Previews use live f1api.dev data and
   their own web address, so their browser storage (cache, theme) is separate from the live site.
   Previews **require a login** (Cloudflare Access, set by the owner), so only the owner can open them;
   nothing in this environment can reach them anyway. **`main` isn't built on Cloudflare** (production
   builds are off): the real site is GitHub Pages, so only PR branches get previews (#52). Previews stay up
   indefinitely and never need cleaning up; the free plan's limit is 500 builds a month, far above our use.
4. The owner tries the preview (phone included). Requested changes are pushed to the same PR, and the
   preview updates.
5. When the owner merges (or says to merge), the change goes live on GitHub Pages and GitHub closes the
   issue in the same step. If a PR is closed without merging, its issue stays open.
6. **`main` is protected (#66):** force pushes and deletion are blocked (GitHub branch protection, set by
   the owner). Never force-push `main`; rewriting history on a `claude/issue-NN` branch is still allowed.
   Deliberately **not** turned on: *require a pull request* and *require status checks* (both would block
   `snapshot.yml`, which commits season files straight to `main`), and *require approvals* (Claude works
   under the owner's GitHub account, so its PRs count as the owner's, and GitHub doesn't let an author
   approve their own PR).

## Instructions to preserve (owner's standing workflow)

1. **Track every request as a GitHub issue**
   (<https://github.com/sguberman/f1-data-explorer/issues>), including ones not being worked on yet. GitHub
   assigns the number. Use the default labels (`enhancement`, `bug`, `documentation`).
2. **Only the owner closes issues.** Each issue's PR says `Closes #NN`, so the owner merging that PR (or
   telling Claude to merge it) is what closes it; the owner can also close an issue by saying so. Finishing
   and verifying the work is not enough on its own. See "Review and merge" below.
3. After finishing work on an issue, give a **short git commit message starting with `issue #xx: `**.
   **No `Co-Authored-By`, session or other attribution lines** — this owner instruction overrides any
   default attribution guidance.
4. When the owner says "log an issue", log it only; work on it when told.
5. To verify official F1 results, use <https://www.formula1.com/en/results/2026/races> directly rather
   than news articles or Wikipedia. The 2026 season is real: e.g. the Bahrain GP was moved
   to Malaysia, and DNF counts are high because of new engine rules and new teams.
6. Keep the site static (GitHub Pages), data live from f1api.dev, and interactions free of extra fetches.
7. **Mockups only when the owner needs to choose** between options (layouts, styles, behaviours). Otherwise
   build it and show the result. Ask clarifying questions on ambiguous scope before work starts.
8. Verify visually-significant changes by actually rendering them (light and dark, desktop and mobile
   width), not just by logic tests.
9. Explain proposed changes before applying them, and preserve the current design and behavior unless the
   owner asks otherwise. Vanilla HTML, CSS and JavaScript only.
10. Unapproved ideas are GitHub issues labelled `idea` (#23); they aren't work to do. New idea → an
    issue labelled `idea`. When the owner promotes one, swap `idea` for `enhancement` (or `bug`); when they
    reject one, close it as "not planned". Links: [open work, excluding ideas](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+-label%3Aidea),
    [ideas](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+label%3Aidea).
11. Work each issue on its own branch (`claude/issue-NN`) and open a PR when it's ready for review, so it
    gets a preview (legacy #52). Merge only when the owner asks. Rebase-merge, so each `issue #xx:` commit
    lands on `main` as written.
12. Add or update tests in `tests/` with every feature or fix (issue #53). Before pushing, run the tests for what
    changed; GitHub runs the full suite on the PR (#54).
13. **When done with a piece of work, always give the owner a link to the homepage on the dev site**: the
    PR's Cloudflare branch preview, `https://claude-issue-NN.f1-data-explorer.pages.dev/`.
