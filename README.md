# F1 Data Explorer

Interactive charts and a title simulator for the 2026 Formula 1 season (2021–2025 seasons load too).

**Live site: <https://sguberman.github.io/f1-data-explorer/>**

## What's on the site

- **Drivers' and Constructors' championships**: cumulative points with projections to the end of the
  season and a "knockout line" for who can still win the title, plus how the projection changed over time
  and each driver's or team's championship position round by round.
- **Race finishing positions**: each driver's spread of finishing positions so far, as a ridgeline chart.
- **Title simulator**: a Monte Carlo simulation of the rest of the season, with optional DNFs for the
  drivers you pick.

Every page has a season picker and an "as of round" slider, and light, dark and system themes.

## How it works

A static site: plain HTML, CSS and JavaScript, with [Chart.js](https://www.chartjs.org/) for the charts and
no build step. Race results are fetched in the browser from the free [f1api.dev](https://f1api.dev/docs)
API and cached locally. The site is hosted on GitHub Pages.

## Repository layout

| Path | What it is |
|---|---|
| `site/` | The website. The only folder that's deployed. |
| `tests/` | Automated browser tests (headless Chromium with fake race data). |
| `docs/` | Project docs: [context and design notes](docs/PROJECT_CONTEXT.md), [closed issues before the move to GitHub Issues](docs/DONE.md). Ideas are GitHub issues labelled `idea`. |
| `.github/workflows/` | GitHub Actions: deploy `site/` to GitHub Pages, and run the tests on every pull request. |
| `CLAUDE.md` | Notes for Claude Code sessions. |

## Running it

- **Locally:** serve `site/` with any static file server, e.g. `python3 -m http.server --directory site`,
  then open <http://localhost:8000>.
- **Tests:** `cd tests && npm ci && npx playwright install chromium && npm test`.

## How changes are made

Each change is tracked as a [GitHub issue](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+-label%3Aidea) and made on its own branch and pull
request. Ideas that aren't approved yet are issues labelled [`idea`](https://github.com/sguberman/f1-data-explorer/issues?q=is%3Aissue+is%3Aopen+label%3Aidea). GitHub runs the tests, and Cloudflare Pages posts a preview link on the
PR. Merging the PR puts the change live and closes the issue. Details: "Review and merge" in
[docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).
