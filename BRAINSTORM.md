# Brainstorm — candidate ideas (not tracked issues)

Ideas generated for possible future work. None of these are tracked issues or approved work yet.
The owner promotes ideas to numbered issues (see `TODO.md`) when they want them built.

## New pages

- **Round detail / race results page** — pick a round, see the full classification, pole, fastest lap,
  points gained, and the DNF causes for that race (from `MANUAL_OVERRIDES` in `data.js`).
- **Season stats / records page** — season-long leaderboard: most wins, poles, podiums, fastest laps, DNFs.
- **Teammate battle page** — head-to-head points / qualifying / finishing-position tally for each pair of
  teammates, season-long. Complements issue #14 (any two drivers), but focused on intra-team rivalry.
- **Full standings table page** — a dense reference table (both championships, every round as a column)
  for people who want the numbers rather than a chart.
- **"Alternate scoring" page** — replay the season under other points systems (pre-2010 top-8-only,
  double-points finale, sprint variants) to see how the standings would differ.

## New features on existing pages

- **drivers.html / constructors.html** — hover or tap a round on the line chart to see that round's actual
  result (winner, fastest lap), turning the chart into a small results browser.
- **position.html** — draw each driver's median finish as a reference marker on their ridge, so the center
  of each shape is visible at a glance instead of only implied by the sort order.
- **simulator.html** — encode the current setup (tracked drivers, DNF/win overrides, round) in the URL so a
  simulation is shareable and bookmarkable.
- **simulator.html** — compare two simulation setups side by side (for example, "Verstappen DNFs twice" vs.
  the baseline) instead of one result at a time.
- **All chart pages** — export the current chart as PNG, or the underlying data as CSV.

## Data and infrastructure

- **Season-over-season pace comparison** — for example, "2026 points pace vs. 2025 at the same round", as a
  reference line or secondary series.
- **Sprint-only view** — a version of the finishing-position chart restricted to sprint results.
  position.html can currently exclude sprints but never isolate them.
