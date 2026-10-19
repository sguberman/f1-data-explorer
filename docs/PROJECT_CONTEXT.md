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
  index.html          Landing page: the next race (#89; location and title-clinch lines, #85), then a card per page,
                      each with a picture of its main chart.
  drivers.html        Drivers' championship: cumulative points line chart, projections, knockout line, title race (#85).
  constructors.html   Constructors' championship: same chart pattern for teams, plus driver contributions (#84) and title race (#85).
  position.html       Race finishing-position ridgeline chart per driver, with sort/show options, and a
                      results heat strip (#87).
  simulator.html      Monte Carlo rest-of-season title simulator with ridgeline result charts.
  whatif.html         What-if: drag a finishing order for a round, see both championships after it, with the title race (#85).
  common.js           F1Common: helpers shared by the chart pages (issue #44 and later).
  data.js             F1Data: fetch, cache (localStorage), normalize f1api.dev data; SPRINT_OVERRIDES.
  controls.js         F1Controls: shared season dropdown + "as of round" slider; emits events.
  theme.js            Light/dark/system theme (dropdown in .theme-bar) + canvas color palette (F1Theme).
  nav.js              Site navigation (#62): home link + Pages menu at the left of .theme-bar (data pages).
  share.js            F1Share (#31): each page's setup in its URL (read once, kept current), Share button.
  export.js           F1Export (#33): "⤓ PNG · CSV" under each chart (composed PNG, CSV of the chart's data).
  roundresult.js      F1RoundResult (#29): tap a round on a championship points chart (or, #113, the position
                      chart) for its result.
  talkingpoints.js    F1TalkingPoints (#88): the drivers' page "Talking points" facts (leader, wins, streak, movers, NC).
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
  `projectionsByRound()` / `renderProjectedPointsChart()` (projection history, issue #10),
  `maxWeekendPoints()` / `titleRace()` / `titleRaceText()` / `renderTitleRace()` / `titleResultText()` (the title clinch
  calculator, #85).
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
- `F1Data.loadSeason(year, {onProgress, onSnapshot})` walks rounds 1, 2, 3… until the API returns no results, and
  resolves to `{rounds, failed, fetchedAt}` (`onSnapshot(rounds)`, #111: called with the season file's rounds as soon
  as the file is in, before any f1api.dev check). Each round becomes `{round, raceName, raceResults,
  sprintResults, country}` (`country` = the circuit's, #18); result rows carry `driverId, code, name, teamId,
  teamName, number, nationality, teamNationality, position, points, session`. `position` is the classified
  finishing position, or `null` when not classified (f1api.dev sends null, "-" or "NC").
  `failed` is true if any fetch failed (the load stops at the first failed round; a failed sprint reads as
  "no sprint"), issue #48. `fetchedAt` is the newest fetch time of the data used, issue #49.
- **Season files (#13):** `site/data/{year}.json` = `{v:1, year, generatedAt, complete, calendar, rounds}`,
  `rounds` in exactly the shape `loadSeason()` returns. `loadSeason()` fetches the file first: one request
  for the whole season, and `getCalendar()` reuses its calendar. Two callers asking for the file at the same time (the
  homepage's calendar and season, #85) share one request; a later call fetches it again as before. A `complete` season (every calendar round
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
- `F1Data.getCalendar(year, {dates})` gives the full season's calendar: `{totalRounds, sprintRounds, raceNames,
  raceDates, raceTimes, countries, cities}`, each map keyed by round. #85 added `cities`: the circuit's city (f1api.dev's
  `circuit.city`, or `locality` as Ergast names it), only for rounds that have one, for the homepage's location line.
  Calendars without it (season files and cached calendars made before #85) still work: the homepage shows the country
  alone. The cache key stays `calendar3`, and the snapshot workflow rebuilds the current season's file (it runs when
  `data.js` changes). #89 added the last three: the Grand Prix date
  (`'YYYY-MM-DD'`, from f1api.dev's `schedule.race.date`), its start time in UTC (`'HH:MM:SSZ'`, from
  `schedule.race.time`, only when known; a time without a zone is read as UTC) and the circuit country. Season
  files made before #89 lack them (past seasons keep them until rebuilt with `--all`). With `{dates:true}` (the
  homepage) a calendar without `raceDates` is skipped: it fetches the season file if none is loaded, then falls back
  to f1api.dev. Cached for a day under `{year}/calendar3` (bumped from `calendar2`); a failed fetch isn't cached.
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
  - drivers: `d` (ids), `sort`, `pos`, `pts=gap` (#83)
  - constructors: `t`, `pos`, `pts=gap`
  - both championship pages: `result` (the open round, #29) and `session=sprint`
  - position: `d`, `sort`, `chart`, `below10`, `sprint`
  - what-if: `gp` and `sprint` orders (`-` marks the not-classified line), and `start=clinch` (#85: start from the
    "🏆 Title clinch" order; the orders are then left out while they're still that order)
  - simulator: `d`, `sort`, `o` (`id:dnf:win`, `a` = auto), `c` (`a:b:n`), `n` (runs), `w` (#117: Form from, a
    number of races or `all`; left out at the default 8) and `seed`
  
  How it works:
  - `F1Controls` reads the season and round on the first load.
  - Each page reads its keys once in its first `buildFromSelection` (`F1Share.take()`), drops unknown ids, then
    calls `F1Share.sync()`.
  - Each page registers a getter (`F1Share.register`; several can register — the round-result panel does too), and the URL is rewritten in place
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
  - The CSV is the data behind the chart: points and projection per round with the knockout line (in the gap view, #83:
    the gaps, the leader at each round and the points still available; the files are then named `…-gap-…`), projected
    totals, positions per round, driver contributions per team (#84), finishing-position counts, finishes per round
    (#87), simulated shares, when the title is decided per round (#86), and the what-if tables (CSV only).
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

**Slider round kept between pages (#105):** the slider's round is remembered in `f1cache:selectedRound` = `{year, round}` while it isn't on the latest round (nothing is kept on the latest, so it keeps following the season). A page opens on it for the same season if it still exists; a season change, a link with a season but no round (= latest) or a shared link's round overrides it; Refresh data keeps it.

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

**Talking points (#88, `talkingpoints.js`, drivers' page only):** a card right after the points chart with up to six
facts about the **whole field** (not the picked drivers) as of the slider's round, each naming its driver(s) by code
with a flag: the **leader** and the gap to second ("level with …, ahead on countback" when equal on points), **most
wins** (Grands Prix only) with the number of different winners, **most podiums** (#102; top-3 Grand Prix finishes) with the number of different drivers on the podium, the **longest active points streak** (rounds in a row,
back from the slider's round, with points from the Grand Prix or the sprint; a round the driver missed ends it; shown
from 2 rounds), the **biggest climber** and **biggest faller** in the standings over the last 5 rounds (from round 6),
and **most not classified** Grands Prix (shown when anyone has one). Ties list every driver in standings order ("VER
and NOR · 3 wins each"; more than three read "VER, NOR, LEC +2 more", all names on hover). Standings and tie-breaks
come from `standingsOrder()`. Tiles three across on desktop, two on phones; a note under them says what each fact
counts. Rebuilt only when the season or round changes (theme colours are CSS variables); never fetches; no export.

**Title race (#85, both championship pages and What-If; `titleRace()` / `titleRaceText()` / `renderTitleRace()` in `common.js`):** a compact
highlighted box at the top of the points card, above the legend and the chart (its "Title race" label on a line of its
own), saying in plain
sentences what the title needs, for the **whole field** (the real standings via `standingsOrder()`, not the picked entries)
as of the slider's round L, the next race being L+1. Driver codes / short team names in bold with their flags. States:
- **decided**: "🏆 VER is champion: clinched in round 20 (Qatar GP), with 3 rounds to spare." After the last round: "🏆 VER
  is the 2026 champion: clinched in round 20 (Qatar GP)" / "…in the final round (Abu Dhabi GP)", plus ", level on points
  with NOR and ahead on countback" when it ended level.
- **can clinch at the next race**: "VER clinches the title in round 21 (Las Vegas) by outscoring NOR by 12 or more and PIA by
  3 or more." A rival the leader may be outscored by a little reads "…, unless LEC outscores VER by 5 or more"; "scoring at
  least as many points as NOR" for a margin of 0. Drivers add a finishing-position example: "A win would do it, whatever the
  others do." / "For example, a win with NOR P4 or lower." (sprint weekends: "winning both with NOR on 21 points or fewer for
  the weekend"). Constructors are points only. Anyone else who could clinch there gets "NOR can also clinch it there by …"
  (two at most, then "N more…"). The final round reads "…in round 24 (Abu Dhabi GP), the final round, …". (The countback
  note "One point less could…" was removed by the owner, here and on What-If.) Under it, on a line of its own: **"Try it in What-If →"**,
  linking to `whatif.html?season=Y` (plus `&round=L` when the slider isn't on the latest round, as #31's links do) and
  `&start=clinch` (`F1Common.clinchLink()`), which opens What-If on round L+1 starting from its "🏆 Title clinch" order. The
  link is shown in this state only: in the others the next race can't decide the title.
- **can't yet**: "VER leads NOR by 34 points. The title can't be decided before round 19 (Las Vegas) at the earliest." (or
  "…before the final round (round 24, Abu Dhabi)."): the first round where anyone still in it could clinch by scoring the
  most possible from the next race on while everyone else scores nothing.

Race names in this wording are short (`F1Common.shortGP()`): "Singapore GP", "Las Vegas GP", "Sao Paulo GP", "Canada GP",
"México City GP": the series prefix, year and title sponsor dropped, and "X Grand Prix" / "Grand Prix de X" / "Gran(de)
Premio de X" made "X GP". No race name (test data's "Round 12 Grand Prix") shows just the round number.

Rules: the points still available are the real calendar's rounds (sprint weekends add a sprint), at the **season's own
maximum** (`maxWeekendPoints()`): 25 a Grand Prix and 8 a sprint for a driver, 43 and 15 for a team, plus the fastest-lap
point in 2019–2024 and 3-2-1 sprints in 2021. In 2022–2026 that's exactly the knockout line's 25/8 and 43/15; in older seasons
the knockout line still counts no fastest-lap point (deliberately unchanged). Without the calendar, the season's estimated
remaining sprints are put straight after the loaded rounds (the most points still available, so "clinched" stays safe).
Clinched = every rival is more points behind than are left, or exactly that many when countback is already settled even if
the rival wins every Grand Prix left (teams: 1-2) while the leader scores nothing. Next-race margins are strict (one point more
than a tie). The earliest round counts a tie as possible, so it is never later than the real earliest. Rebuilt only when the
season or round changes (colours are CSS variables); never fetches; no export. (An "Every driver/team, after round L." line
under it was removed by the owner.)

**Title race on What-If (#85):** the same calculation and wording (`titleRaceText()`, so the pages can't drift apart):
- A "Title race" box (the same look) above the drag lists, for the round being edited (T = L+1) from the standings after L,
  one line per championship, its label ("Drivers' title" / "Constructors' title") on a line of its own above it
  (constructors in points only), plus the
  nothing else (the countback note was removed by the owner). No What-If link, and no "Every driver" line. On a replayed past round
  it uses only the rounds before it.
- A live line above each result table, from `titleResultText()` = `titleRace()` on the season with your dragged result as
  round T (later rounds left out), rebuilt on every move: "🏆 With this result, VER is champion." / "…, level on points with
  NOR and ahead on countback." (final round tie) / "🏆 VER is already champion." (clinched before T) / "Title still open:
  everyone above the line can still win." While the title is open, **a red dashed line in the table** sits under the last
  driver/team who can still win it, "Can still win the title ↑" just above the dashed line and "Out of contention ↓" just below it: everyone above is in, everyone
  below is out (`titleResultText()`'s `contenders`; this replaced a list of names, at the owner's request). When
  everyone can still win there's no line and it says "Title still open: everyone can still win." Rivals who can only
  draw level are named after it ("NOR only by drawing level on points, which would go to countback"; `titleRace()`'s
  `contenders` with `tieOnly`). Each championship on its own, so the constructors' title can be won while the drivers'
  stays open.
- A **🏆 Champion** tag (just 🏆 on phones) on the champion's row in its table, shaded row.
- A **"🏆 Title clinch"** preset after "Start from … Standings order" (the presets row wraps on phones), shown only when
  someone can win a title at round T (`titleRace()` says 'next' after L). It sets a finishing order that wins it: the
  clinching driver first (for the constructors' title, that team's drivers next), everyone else in the drivers' standings
  order except rivals who must drop, each place going to the first driver in that order whose points for the weekend (and
  their team's) stay within what the clinch allows (from `titleRace()`'s margins). On a sprint weekend the sprint stays in
  standings order unless the Grand Prix alone can't do it; then the sprint is arranged the same way (or, failing that,
  with the rivals out of its points). Each candidate is checked with `titleRace()` on the resulting season (decided at T,
  by the intended champion), so the preset provably clinches. When both titles can be won it prefers one order that wins
  both, then the drivers' title, then the constructors'. Its tooltip says what it does ("A finishing order with which VER
  clinches the drivers' title and Mercedes the constructors'"). Computed once per round (`clinchPreset()`), never while
  dragging; never fetches. Opened with `start=clinch` (every "Try it in What-If →" link) it is the starting order, and the
  note says "Starts from a finishing order with which …"; for the first round built only, so moving the slider or switching
  season goes back to the normal start, and a link where nobody can clinch any more starts normally and drops `start`.
  Opening What-If without it keeps the normal start (actual result, else standings order).

**Gap to leader (#83, both championship pages):** a **Show** dropdown (`#ptsView`, `.ddSelect`, beside the legend; on
phones on its own line above it) switches the points chart between *Points* (default) and *Gap to leader*: each picked
entry's points behind the leader (the highest-ranked picked entry at each round, as for the knockout line), actual and
projected, on a **reversed** y axis ("Points behind the leader", 0 at the top), so the leader runs along the top and
the others drop away below, the same shape as the points view and the position chart. The knockout line becomes
**Points still available** (`room`, the largest gap that can still be closed); a gap bigger than that is exactly
"below the knockout line", so the eliminated markers and the note's lists are the same in both views, and the out zone
is shaded below the line. The axis fits the gaps, so the line comes into view as the season runs out. Tooltips say
"leader" / "N behind", end labels and the phone end legend show "+N" (leader 0). Switching only redraws (no fetch).

**Round results (#29, `roundresult.js`, both championship pages):** clicking or tapping a round on the points
chart (up to the slider's round; projected rounds don't open) opens that round's result in a panel under the
chart, with the round shaded on the chart. Drivers' page: finishing order (pos, team dot, flag, name — code on
phones — team, points), not classified last as NC, top 10 with "Show all N"; picked drivers in bold (on the
constructors' page, the same list with the picked teams' drivers in bold). Sprint weekends get a Sprint / Grand Prix switch (weekend order; the Grand Prix shows first); ‹ › (and ←/→) step through
rounds, × or Escape closes it, and moving the slider before the open round closes it. The tooltip title names
the round with its short name (#106: `F1Common.shortGP`, "Round 5 · Singapore GP"; nothing for a name like "Round 5
Grand Prix"), with "Click for the full result" on actual rounds (not on touch screens). Never fetches.
`F1RoundResult.create({keys})` (#113) makes another independent panel: the **position-by-round chart** has one
(`posResult`, panel `#posResult` under `#posWrap`, URL keys `presult` / `psession`, `xIsRound: true` since that chart's x
values are round numbers). It opens any loaded round, whatever the slider says, since that chart covers the whole
season; Escape outside a panel closes the one opened last.

Both championship pages are laid out (issue #10, "Layout A", picker moved to the top in #124): **picker** (under the
season/round controls) → points chart (with the title race line, #85) → (drivers: **Talking points**, #88) →
**Projected final points** card → **Championship position by round** card. The cards follow the picker selection
(except Talking points and the position card, which cover the whole field).
- **Projected final points** (issue #10): for the picker selection, what the points chart's projection
  (points so far + last-5-participated-rounds average × rounds left) said after each round. Its last value
  equals the end of the points chart's projection line. End labels on wide screens, ranked list (`.endLegend`)
  on narrow ones. Projections are computed once per season (`projData`) and the chart only rebuilds when the
  selection changes. A tooltip per round (#110: hover, or tap on phones) lists each shown entry's projection
  then, highest first, titled "After round 5 · Singapore GP" (`raceName` option, the page's `raceShort()`). No dots at
  rest (only on the hovered round), and a thin vertical line at that round (`F1Common.hoverLine`, a shared plugin; the
  points chart at the top uses it too, solid so it isn't mistaken for the dashed "as of" divider).
- **Championship position by round** (issue #9): every driver/team as a line, P1 at the top, a flat segment
  at each round's position joined to the next round by an angled line; ties broken by countback of Grand
  Prix finishes. A **Show** dropdown switches between *Actual standings* and *Projected final standings*
  (issue #10: ranked by the projection after each round; ties go to the higher-placed entry). Tapping a round opens
  its result under the chart (#113, above).
- Both cards always cover the whole loaded season and ignore the round slider; driver codes / short team
  names as end labels, solid/dashed teammate convention.

**constructors.html** — Same chart pattern for teams (remaining points per weekend 43 GP + 15 sprint).
Knockout line based on the highest-ranked selected team. Presets All/None/Top 2/Top 5, default Top 5.
Between the points chart and Projected final points, a **Driver contributions** card (#84): one horizontal bar
per picked team (standings order), split into a segment per driver with that driver's points for the team as of
the slider's round (Grand Prix + sprints, so each bar is the team's championship total). A driver who scored for
two teams gets a segment in each. HTML/CSS bars on one shared scale; the top scorer is solid team colour, a
teammate a lighter shade (team-colour border), any further driver striped. Segments read "CODE pts", just the
code, or nothing as space allows; the total sits at the bar end. Hover, tap or focus a segment for the driver
(flag, name, team), points and share of the team. Team name above the bar on phones. Follows the slider, picker,
season and theme; never fetches. Its PNG is drawn for the picture (export `draw`); its CSV has a row per driver
per team (`contributions()` in the page is the pure data function).

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

**Results by round (#87, position.html, card between the chart and the picker; #109 added stats tiles under the strip):** a heat strip, a compact
picture rather than a table of numbers (#27). One row per selected driver (flag + code in the team colour), in
the chart's "Sort by" order (`sortedRows()`, shared with the ridgeline), and one square per loaded round (round
numbers on top). Each square is that driver's **Grand Prix** finish, coloured as the owner chose (option C of the
mockups): **gold, silver and bronze** for P1–P3, a **blue ramp** for P4–P10 (stronger = better) and **faint** for
P11 and below (no points), its own colours per theme (`HEAT_RAMP`; ramps mixed in OKLab). Podiums get a small dot; NC is a cross in `--elim`; a round the driver didn't race is
a short dash; rounds after the slider's round are blank with dimmed numbers, so the strip keeps its width while
sliding. Hover (mouse) or tap a square for driver, round, race and finish; with "Sprints" shown, sprint weekends
add the sprint finish. The squares stay Grand Prix finishes whatever "Sprints" says (a sprint is a different
event; owner can revisit). Tap again, tap elsewhere or Escape closes it. Columns are `minmax(0,22px)`: ~20px
squares on desktop, ~11px at 390px with 24 rounds, with no scrolling. Export: the PNG is drawn for the picture
(`drawHeatPicture`, same marks and key); the CSV has a column per round through the slider's round (position,
NC, or blank), plus a sprint column after each sprint round while Sprints is shown. Never fetches; redraws on
picker, sort, slider, Show options, season and theme changes. **Stats (#109, `F1TalkingPoints.stats()`, `#heatStats`)**: the same tiles as the drivers' Talking points, for the drivers shown only, Grand Prix finishes through the slider's round: most wins, most podiums, most not classified, and the longest win, podium and points streaks (a streak of 2+ rounds, ever so far, not just active; points count the sprint too; a missed round ends it). A single holder's streak names its rounds ("rounds 3–6", ", still going" when it runs to the slider's round); ties list everyone. Zero stats are left out; not in the exports.

**simulator.html** — Simulates the rest of the season for **every driver in the latest round** (anyone who didn't
start round L, e.g. a replaced driver, keeps their points but doesn't race; they get no settings and can't be in a
collision). **Race model (#117, replacing #30's exact-place histogram + flat 0.5 bonus, which gave every driver a
share of every place and simulated leaders at ~60% of their real scoring):** each race order is drawn place by place
for **every position** (P1 to last), weighting the drivers not yet placed by `placeWeight`: their finishes at **that
place or better** in the data window, plus a **near bonus** for finishes just behind it (+0.5 one place behind,
halving each place further: `NEAR_BONUS`, `NEAR_DECAY`), plus a 0.01 floor (`WEIGHT_FLOOR`), so a driver usually
finishes near where they have been and anything stays possible (#116). The **data window** is the "Form from"
stepper in the run card: the last N Grand Prix starts of each driver (`WINDOW_MIN` 3, default 8) up to the **whole
season** (`dataWindow = Infinity`; a window as long as the races so far shows as the whole season). GP results only;
sprints use the same weights with sprint points. Retirements are modeled separately (#39): drivers on **auto**
retire in each event with `modelDnfRate`: the window's DNF share (no classified position, the same rule as the
position page's NC, #46) blended with 4 races (`DNF_PRIOR_RACES`) at the grid's DNF rate so far (`gridDnfRate`).
Final standings split **equal points by countback** (most GP wins, then P2s, …: real finishes so far plus the
simulated GP places, `countback()`), then the current standings. A 2021–2025 backtest (average miss on the final
top 10's points at ½ / ⅔ / ⅚ of a season) gave: last-5 average 28 / 29 / 13, old model 41 / 31 / 16, this model
27 / 25 / 12. Everyone is on auto unless set
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

**When the title is decided (#86, simulator):** a card right after the win probability. Each simulated season records
the first round after which its champion's lead over every other driver is **more than** the points still available
(25 per Grand Prix + 8 per sprint left, the knockout line's arithmetic; `decidedContext()` / `titleSettled()`). A lead
exactly equal to them isn't enough (a tie would go to countback), and a season not settled earlier counts as the final
round. It's checked inside `simulateSeason` at the end of each round from the points already drawn, with **no extra
random draws**, so a seeded run gives exactly the same results as before (the test pins a fingerprint taken from
`main`); the run keeps them as `lastRun.decided` (one round per season), and `simulateInto` records each season's
champion (the driver ranked 1st, as for the win probability; no random draws) as `lastRun.champion` (index into
`lastRun.ids`). The chart (Chart.js, `F1Theme` colours) has a column per round from the slider's round (shaded "Run",
already run: above 0 only if the title was already out of reach) to the last: a **stacked bar** = share of seasons
decided at that round, split by who became champion (each segment is that driver's share of *all* seasons, so the
segments add up to the bar and, over all rounds, to the driver's title chance), and a line = decided by it (cumulative,
100% at the final round). Champions are ordered by title chance (bottom up, and in the legend, which shows flag + code,
no team names); drivers with under 1% of titles fold into a grey **Others** segment on top (`DECIDED_MIN_SHARE`).
Colours (`champFill`): the team colour via `F1Theme.team()`; a teammate is a **lighter shade** (the colour mixed with
white, opaque, so it reads lighter on the dark theme too and shows in the PNG legend) with a team-colour edge, following
the constructors' driver contributions (#84) rather than the line charts' dashes, which don't suit bars. The tooltip lists
the round, "Decided at this round", each champion's share there (zero shares left out) and "Decided by this round".
A summary line reads e.g. "Most likely decided: Round 21 (Qatar), 25% · Half of seasons decided by Round 20 (Las Vegas) ·
20% go to the final round · Most often clinched early by VER (18% of seasons)" (short race names: no "Formula 1",
sponsor, year or "Grand Prix"; "early" = before the final round). It covers the whole grid, so it ignores the tracked set;
nothing new goes in the URL. PNG/CSV export (`sim-title-decided`): the PNG has the stacked colours and a legend entry per
champion, Others and the line; the CSV adds a "Decided at this round: CODE champion (% of seasons)" column per champion
shown plus one for the other champions. Measured on 30,000 seasons in headless
Chromium: compute median 657 ms before, 730 ms after (minimum 624 → 639 ms; noisy machine); the run stays sliced (#56).

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
Title race (#85, see "Title race on What-If" above): a box above the lists with what each title needs at this round, a live
line above each table and a 🏆 Champion tag on the champion's row as you drag.

**index.html** — Static landing page (#50): five cards, one per row, in the order Drivers' Championship,
Constructors' Championship, What-If Results (#107: right after the championships), Race Finishing Positions, Title
Simulator; the Pages menu on the other pages (`nav.js`) lists them in the same order. Each card has a
picture of that page's main chart on the left (on top on phones): an inline SVG with illustrative shapes, not
real data (the drivers' picture ends each line with a driver number and code, the constructors' with a
team-coloured name badge; no team logos, which are trademarks), coloured through CSS variables so it follows the theme (team colours as on the charts, Red Bull's
navy lightened in dark). The title and intro sit on a soft checkered-flag banner
(`.hero`, #78): a CSS conic-gradient in the theme's own `--inset`/`--panel` tones, with a faint text halo for legibility.
**Next race (#89):** a strip between the banner and the cards: "Next race · Round 18" (or "This weekend" from two
days before the race), the short race name (no "Formula 1", title sponsor or year) with the circuit's flag, a
"Sprint weekend" tag, the date and start time in the visitor's time zone (date only when the time isn't known), and a
countdown by local calendar day: "in 4 days", "Tomorrow", "Today", "Under way" for 4 hours from the start, then the
next round. Under the name, the **location** (#85): "Marina Bay, Singapore" from the calendar's `cities` and `countries`
(the country alone when there's no city, or when the city is the country's name, e.g. Monaco).
**Title clinch (#85):** when someone can win a title at that race, a line per championship under a thin rule:
"🏆 [flag] Max Verstappen can clinch the drivers’ title" and "🏆 [flag] McLaren can clinch the constructors’ title"
(full driver names, also on phones, where the line wraps; short team names; "or" between two who both could; always
"drivers’ title" / "constructors’ title", so the two lines read alike). Under them, on a line of its own, the championship
pages' "Try it in What-If →" link (`F1Common.clinchLink()`: `whatif.html?season=Y&start=clinch`, opening that race from the
clinch order). It needs the standings: the page also loads the season with `F1Data.loadSeason(year)` (the same season
file, shared with the calendar's request, plus the site's once-a-day check for newer rounds, #60), started together with
the calendar. The strip doesn't wait for it. **#111:** the lines are drawn first from the season file alone, as soon as
it's in (`loadSeason`'s `onSnapshot(rounds)` callback, before f1api.dev is asked about newer rounds, which can take
seconds on the first visit of the day), and drawn again (replaced) from the checked season when that arrives, so the
cards below don't jump when the check is slow. Either way they come from `titleRace()` on the latest loaded round L,
only when the race shown is round L+1 (results for the last race not in yet: no line) and only when the load didn't
fail (missing results could make it wrong): if the check fails, the lines drawn from the file are taken away and the
strip shows without them. After the last race it reads "2026 season · Season complete" with a "Final standings →" link (no
champion: that would need the full results, which may lag the race). It comes from the newest season's calendar
(`F1Data.getCalendar(year, {dates:true})`): the season file, or f1api.dev without one, cached for a day. That and the
season (for the clinch line) are the only data the homepage loads, both on page load; nothing on it fetches on
interaction. If the calendar fails or has no dates, the strip stays hidden.

## Design requirements (owner-approved — keep these)

- Site name: **F1 Data Explorer**. Page headings: Drivers' Championship, Constructors' Championship, Race
  Finishing Positions, Title Simulator (the landing-page cards use the same names). Each page's `<title>` is
  "Name · F1 Data Explorer" without a year; `controls.js` prefixes the selected season (#16).
- Page introductions say what the page shows, then how to use it, in plain sentences (#15/#16).
- Team colors via `F1Common.TEAM_COLORS` (Mercedes teal, McLaren papaya, Ferrari red, Red Bull navy, Alpine pink,
  Audi salmon/red, Haas black, …). Unknown team ids get a stable hashed `hsl()` color; use `F1Common.withAlpha()`
  for transparency, since a hex alpha suffix breaks on `hsl()`. It takes `#abc`, `#aabbcc` and `hsl()` (#100).
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
- **Picker presets and default (#104):** All / None / Top N plus **Top 4 teams** (the drivers of the top 4 constructors; the 4 teams on the constructors page), **Best of the rest** (everyone else) and **Title contention** (the leader and everyone who can still win, from `titleRace()`'s contenders, so it matches the Title race box; just the champion once decided). Sets come from `F1Common.presetSets()` as of the slider's round. The **default selection** on all four picker pages is the title contenders (`defaultSelection()`), falling back to the top 5 when fewer than 2 or more than 10 (teams: 5) are in it, e.g. early in a season. Picks are **remembered between pages** (`f1cache:pickerSelection` = `{year, drivers, teams}`; drivers, position and simulator share the drivers' list; `null` = still the default; a link's `d`/`t` and a season change override it).
- **Folding the picker (#124):** the "Drivers shown / tracked / Teams shown" label is a toggle (`#pickerToggle`) that hides the list and the sort dropdown and shows "N of M drivers"; the presets stay. Shared between pages (`f1cache:pickerCollapsed`).
- Pickers sit at the **top** of the page, in a card right under the season/round controls (#124; moved up from below the chart). Folded away, the sort dropdown is hidden too. Rows: checkbox, (rank), team-color dot, flag, number, name, movement, points.
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

- The simulator's race model uses **GP results only** (#117: its last N starts by default), while position.html
  includes sprints and the whole season by default, so the two pages' "form" can differ.
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
  2026 season: 22 drivers, 12 of 23 rounds, sprints, unclassified results, one unknown team id; calendar circuits have a
  `city`, except round 22, and round 8's is its country's name, #85), serves Chart.js from
  `node_modules`, and can simulate f1api.dev failures (`fail`) or slow responses (`delay`), and can fix the clock, time zone and locale (`now`, `timezone`, `locale`, #89). The fixture's calendar has race dates and times (round 22 date only).
- Test files (`NN-name.test.js`) export `async (t, h) => { t.check(name, ok, detail) ... }`. Current files:
  smoke (every page, both themes, desktop + phone, no errors), common (#44), knockout (#45/#46),
  status (#23/#48/#49), movement (#47), position (#9), projection (#10),
  simulator (#39 DNF modeling, #42 auto DNFs, #14 wins, #11 collisions, #17 results kept), the race model (#117: weights
  for every place and the DNF blend against an independent calculation at windows 8, 4 and the whole season; every running
  driver placed in every event; countback on equal points; drivers not in the latest round never race; the top 3 score
  within 20% of their recent points per GP; Form from stepper limits, URL, link, early rounds, never fetches), when the title is decided
  (#86: the decided round on constructed seasons against an independent calculation — early, final round, countback tie,
  sprints; the engine against an independent replay of simulated seasons; cumulative chart matching `lastRun.decided`;
  stacked per-champion segments against an independent count from `lastRun.decided` + `lastRun.champion`, segments adding up
  to each bar, Others folding and teammate shades on constructed results, legend, tooltip;
  same-seed results unchanged from `main`; seeded link; CSV/PNG; never fetches; both themes and phone fit), NC/finish rule shared by the position page and simulator (#46), flags and markers
  (#18/#30; movement also covers #20's tie-breaks), simulator runs (#56: responsive 30,000 run, progress, Cancel), what-if (#48: drag, keys, NC line, sprint weekends,
  points and countback), homepage (#50/#107: card order, pictures, vertical layout, theme colours; #78: checkered banner), next race (#89, #111: a slow check shows the clinch lines from the season file at once and the cards don't move; fixed clock — next round, countdown wording, local time zone, sprint tag, short names, season complete, season file vs f1api.dev, old files without dates, failure hidden, both themes, phone fit; #85: the location with and without a city, and the clinch lines on constructed seasons — drivers' only, constructors' only, both, none — against an independent calculation, the link and following it into What-If, one season-file request and only the daily check from f1api.dev, nothing fetched on interaction, no line when the race shown isn't the round after the latest result, a failed or slow season load leaving the strip in place, both themes and phone fit), season files (#13: one-file
  loads, live check only after the file, complete seasons with no API calls, fallback, Refresh), daily check (#60: one check reused across pages and
  season switches, rechecked after a day or on Refresh, failed checks not kept), navigation (#62: home link and Pages menu on every
  data page, in the homepage cards' order (#107), keyboard, season kept between pages, phone layout), layout (#64: every data page has the same page frame —
  margins, width, title, intro text, card style), favicon (#68: every page links it; the files are valid), team seasons (#72: Sauber/Alfa Romeo/AlphaTauri names and season colours),
  pickers and slider (#104/#105/#124: presets, contenders as the default, picks and the slider's round kept between pages, folding the picker, against `lib/clinch.js`'s title calculation on a constructed season),
  links (#31: every page's setup round-trips through the URL, defaults left out, bad values ignored, Share copies it, a
  simulator link reproduces the same results) and exports (#33: PNG and CSV contents per chart, never fetches; #75/#76: share sheet on phones with download fallbacks,
  icon in the picture's corner), Jolpica patch (#59: a stripped season patched from a fake Jolpica comes back exactly; mismatches
  stop the patch), round results (#29: tap a round for its result; #113: the same on the position chart, own panel and URL keys, any loaded round; #106/#110: short race names in tooltips and the projected-points tooltip; sprint switch, arrows, close, NC last, projected
  rounds closed, never fetches, URL round-trip, phone fit), driver contributions (#84: per-driver and per-team points
  checked against an independent sum and the picker, picker/slider/theme/season, a driver with two teams on constructed
  data, labels never cut off, tooltip, PNG/CSV, never fetches, phone fit), talking points (#88/#102: each fact against an
  independent calculation at several rounds, ties, early rounds, follows the slider and season, whole field, never
  fetches, theme switch, both themes and phone fit), gap to leader (#83: gaps and points still available checked
  against an independent calculation, same eliminated entries in both views, slider, tooltip, end labels, round
  result, CSV/PNG of the gap view, URL round-trip, never fetches, phone layout, both pages), results heat strip stats (#109: `34-heat-stats`, every stat and streak against an independent calculation at several slider rounds and picker selections, never fetches, phone fit), results heat strip (#87:
  squares against an independent calculation incl. NC, picker, sort order, slider, hover/tap details with sprints,
  PNG/CSV, both themes' colours and a live theme switch, a 24-round season fitting 390px, never fetches;
  `HEAT_SHOTS=<folder>` saves card screenshots), title race (#85, both championship pages: the calculation on
  constructed seasons — decided, next-race clinch against one and two rivals, a sprint weekend, can't yet, final round,
  countback ties, fastest-lap seasons — against an independent calculation for drivers and teams at every round; each
  state's wording, the fake season's earliest round, slider, whole field, theme, season switch, never fetches, both
  themes and the phone fit, the What-If link only on a next-race clinch with the round when the slider is back, the line
  at the top of the points card, short race names (`shortGP()`), the 🏆 when decided, and no "Every driver" line or
  countback note; `CLINCH_SHOTS=<folder>` saves card and state screenshots), title race on What-If (#85, `30-clinch-whatif`: the labels on their own lines, the table's line under who can still win (and none when everyone can),
  the box's wording against an independent calculation and the championship pages' line, the live line and champion tag
  appearing and disappearing with keyboard drags on constructed near-decided seasons, the constructors' title won with the
  drivers' open, a level-at-best lead with countback open or settled, a final-round countback tie, a decided season, a
  replayed sprint round, never fetching, both themes and the phone fit; the "🏆 Title clinch" preset shown only when a
  title can be won, its order clinching per standings computed in the test (drivers' only, constructors' only, both, a
  sprint weekend that needs the sprint too), everyone else keeping the standings order, the link opening What-If from that
  order with `start=clinch` round-tripping through the URL and Share, the slider and stale links going back to the normal
  start; every potential winner listed on the fake season, 22 names wrapping at 390px). `lib/clinch.js` holds the
  constructed seasons and the independent title calculation shared by the homepage and What-If checks. The harness
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
