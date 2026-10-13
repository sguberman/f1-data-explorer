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
  index.html          Landing page: cards linking to the four tools.
  drivers.html        Drivers' championship: cumulative points line chart, projections, knockout line.
  constructors.html   Constructors' championship: same chart pattern for teams.
  position.html       Race finishing-position ridgeline chart per driver, with sort/show options.
  simulator.html      Monte Carlo rest-of-season title simulator with ridgeline result charts.
  common.js           F1Common: helpers shared by the chart pages (issue #44 and later).
  data.js             F1Data: fetch, cache (localStorage), normalize f1api.dev data; MANUAL_OVERRIDES.
  controls.js         F1Controls: shared season dropdown + "as of round" slider; emits events.
  theme.js            Light/dark/system theme (dropdown in .theme-bar) + canvas color palette (F1Theme).
  theme.css           Shared CSS variables (both themes), controls, pills, dropdowns, legends, pickers.
.github/workflows/    static.yml deploys site/ on pushes to main that touch site/ (or the workflow).
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
  `isNarrow()`, `withAlpha()`, `rankedDriverIds()`, `driverPickerRowHTML()`, `markActivePreset()`,
  `standingsByRound()` / `renderPositionChart()` (the championship-position chart, issue #9),
  `projectionsByRound()` / `renderProjectedPointsChart()` (projection history, issue #10).
- `theme.css`: picker list styles (`.pickerRow`, `.pickerDot`, …).
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
  sprintResults}`; result rows carry `driverId, code, name, teamId, teamName, position, points, mechanical`.
  `failed` is true if any fetch failed (the load stops at the first failed round; a failed sprint reads as
  "no sprint"), issue #48. `fetchedAt` is the newest fetch time of the data used, issue #49.
- Caching: completed rounds are cached permanently in `localStorage` under `f1cache:v1:`; the most recent
  round has a short TTL because post-race penalties can still change it. Each entry is `{v, exp, t}`, where
  `t` is when it was fetched (kept when re-stamping the TTL). Fetch failures are never cached (issue #22).
  `F1Data.clearCache()` removes every `f1cache:v1:` entry (issue #23); the theme and the
  `f1cache:selectedSeason` key are kept.
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
chosen round, normalized to its own peak. "Sort by" Median / Championship / Team (team = constructors' order,
then drivers' order). "Show" checkboxes: Below P10 (expand to individual positions + DNF instead of one
"11+/DNF" bucket), Mechanical DNFs (off by default — excluded entirely, not counted as a start), Sprints
(on by default — merged into the same histogram). All options recompute from cached data. Default
selection is the top 8 drivers.

**simulator.html** — Simulates the rest of the season for the **whole grid**. Each race order is drawn slot
by slot from each driver's own finishing-position histogram (GP results only, finished races only —
DNFs of any cause are left out; `HIST_SMOOTH = 0.5`). Retirements are modeled separately (#39): drivers
on **auto** retire in each event at their own DNF rate this season (DNFs of any cause ÷ GP starts; a result
counts as a finish only with a classified position and no mechanical flag). So the simulator doesn't
depend on the mechanical/non-mechanical split in `MANUAL_OVERRIDES`. Everyone is on auto unless set
otherwise in the "Tracked drivers in the remaining races" card: each tracked driver has a **DNFs** and a
**Wins** stepper, both showing grey "auto" by default (#42, #14); − from auto sets 0, + sets 1, − at 0 goes
back to auto. "Reset all to auto" clears both; "Reset to 0" sets every DNF to 0. A set DNF count = retire
in exactly that many random remaining events; a set win count = win exactly that many random GPs (and
never P1 in other GPs; sprints aren't affected). **Collisions** (#11) pair any two drivers for n GPs where
both retire, on top of their DNFs. Per simulated season (`planSeason`): forced wins, then collisions, then
exact DNFs, then auto retirements in the events still open. Steppers stop at what's possible (one winner per
GP; wins + collisions ≤ GPs left; DNFs + wins + collisions ≤ events left). Settings only exist for tracked
drivers and are dropped when a driver is untracked. Results (#17): a run stores every driver's final points
and rank for each simulated season (`lastRun`), so changing the tracked set redraws the same run without
re-running; changing a setting or the round keeps the results with a "Settings changed since this run" note
and a Run again button; loading another season clears them. Results: win probability plus ridgeline charts
of final-points distribution and final championship position, ranked against the full grid. Default
tracked set is the top 8.

**index.html** — Static landing page with four cards.

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
- Charts: driver codes (VER, NOR…) on chart labels; **short team names** (`shortTeamName()`) in chart
  legends and end labels; **full names** in pickers (driver full name + small muted code tag; full official
  team names).
- Pickers sit **below** the chart. Rows: checkbox, (rank), team-color dot, name, movement, points. Movement
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
- `isMechanical()` keyword matching is dead code with live data (kept, hardened against non-string input).
- Some 2026 DNFs are still unclassified, and every future round needs new overrides (see #21).
- The season list and per-season round/sprint estimates come from the hardcoded `SEASON_META` in `common.js`.
- Mobile Safari behavior can't be fully verified with headless Chromium. Check owner screenshots.

## Tests (`tests/`, issue #53)

Browser tests live in `tests/` (not deployed) and run on every pull request via
`.github/workflows/tests.yml`. To run them locally: `cd tests && npm ci && npm test` (or `node run.js
position projection` to run only matching files). Screenshots of every page go to `tests/artifacts/`
(git-ignored; uploaded as a CI artifact) for a person to look at — they're not compared automatically,
since fonts render differently on different machines.

- `lib/harness.js` serves `site/` at `http://site.test/`, answers f1api.dev from `lib/fixture.js` (a fake
  2026 season: 22 drivers, 12 of 23 rounds, sprints, DNFs, one unknown team id), serves Chart.js from
  `node_modules`, and can simulate f1api.dev failures (`fail`) or slow responses (`delay`).
- Test files (`NN-name.test.js`) export `async (t, h) => { t.check(name, ok, detail) ... }`. Current files:
  smoke (every page, both themes, desktop + phone, no errors), common (#44), knockout (#45/#46),
  status (#23/#48/#49), movement (#47), position (#9), projection (#10),
  simulator (#39 DNF modeling, #42 auto DNFs, #14 wins, #11 collisions, #17 results kept). Logic is checked against
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
   Cloudflare also hosts a copy of `main` on `pages.dev`; the real site is still GitHub Pages.
4. The owner tries the preview (phone included). Requested changes are pushed to the same PR, and the
   preview updates.
5. When the owner merges (or says to merge), the change goes live on GitHub Pages and GitHub closes the
   issue in the same step. If a PR is closed without merging, its issue stays open.

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
   than news articles or Wikipedia. For DNF *causes*, which that site doesn't give, race reports and news
   coverage are acceptable (approved for issue #36). The 2026 season is real: e.g. the Bahrain GP was moved
   to Malaysia, and DNF counts are high because of new engine rules and new teams.
6. Keep the site static (GitHub Pages), data live from f1api.dev, and interactions free of extra fetches.
7. For design-heavy changes the owner has liked seeing a few options or mockups first, and has answered
   clarifying questions on ambiguous scope before work starts.
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
12. Add or update tests in `tests/` with every feature or fix (issue #53), and run them before pushing.
