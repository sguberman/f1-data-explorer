# CLAUDE.md

Static Formula 1 statistics site (2026 season), hosted on GitHub Pages, with live data from f1api.dev.

**Read `PROJECT_CONTEXT.md` first.** It's the full handoff: architecture, data layer, design requirements,
decisions, known issues, tests, and the owner's standing rules. Then `TODO.md` (open issues), `DONE.md`
(closed issues) and `BRAINSTORM.md` (ideas, not yet approved).

## Layout

- `site/`: the website. It's the only folder deployed (`.github/workflows/static.yml`, on pushes to
  `main` that touch `site/`). Vanilla HTML/CSS/JS, no build step; Chart.js from cdnjs.
- Previews: Cloudflare Pages builds `site/` for every PR branch and posts the link on the PR.
- `tests/`: browser tests (headless Chromium + fake f1api.dev data). `cd tests && npm ci && npm test`.
  CI runs them on every pull request (`.github/workflows/tests.yml`).
- `*.md` at the root: project docs. Not deployed.

## Standing rules (summary; details in PROJECT_CONTEXT.md)

- Track every request as a numbered issue in `TODO.md`. Numbers are permanent. "Log an issue" means log
  only; work on it when told.
- Only the owner closes issues: each issue's PR moves it to `DONE.md`, and the owner merging it (or saying
  to merge) closes it.
- Explain proposed changes before applying them; show mockups or options first for design-heavy work.
  Preserve the current design and behavior unless asked.
- Commit messages start with `issue #xx: `. No `Co-Authored-By`, session links or other attribution lines.
- Interactions (slider, toggles, sort, pickers) never fetch; only loading a season, Refresh data and Retry do.
- Verify visual changes by rendering them in light and dark at desktop and ~390px phone width, and add tests
  for new features.
- One branch (`claude/issue-NN`) and PR per issue, opened when ready for review so Cloudflare Pages posts a
  preview link. Merge only when the owner asks. See "Review and merge" in PROJECT_CONTEXT.md.
