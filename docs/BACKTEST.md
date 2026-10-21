# Backtest (#155)

`tools/backtest.mjs` scores simulator models against history and tunes their numbers. It reads `site/data/{year}.json`
(no network) and runs the site's own model and season engine (`site/racemodel.js`, #153) and standings code
(`site/common.js`) in Node. Run it locally, or by hand on GitHub (Actions → Backtest).

```
node tools/backtest.mjs race     # race level: the exact probability a model gave each real result
node tools/backtest.mjs season   # season level: projections from every cut point vs the real final standings
node tools/backtest.mjs tune     # fit the race model's numbers (leave-one-season-out, then the holdout)
  --from 2014 --to 2025 --holdout 2024 --runs 2000 --json
```

## How it works

- **Walk-forward only.** A model sees just the races before the one it is scored on (or before the cut point), as
  covered by `tests/43-backtest.test.js`.
- **Race level (used for tuning).** The model retires each driver at their DNF chance, then draws the finishers place by
  place with that place's weights. Both parts have an exact probability, so the score for a race is the log of the
  probability the model gave the real result: no simulation, a whole 2014–2025 pass takes about a tenth of a second.
  "Rounds 4+" is the score that tunes; rounds 2–3 (little in-season history) are reported apart. "No information" is
  the same race with a random order and everyone retiring at the grid's rate, for scale.
- **Season level (confirmation).** From every cut point (round 4 to the second-last round) it projects the rest of the
  season with the real engine (seeded, same seeds for every model) and compares with the final standings: the
  average miss on the real final top 10's points, the rank correlation of projected and real points, the log score
  and Brier score of the title, and calibration (predicted vs observed P(title), P(top 3), P(top 10) in 10% buckets).
  Beside the model it shows three plain projections: the standings as they are, last-5 average pace and season-average
  pace.
- **Points** are recomputed from finishing positions with the season's points table, as the Simulator scores them, so
  the fastest-lap point (2019–24), double points (2014) and half points (2021 Belgium) are out of both sides. The
  champion and final ranking are as awarded.
- **Tuning.** Coordinate descent over `window`, `nearBonus`, `nearDecay`, `floor` and `dnfPrior`. Leave-one-season-out
  over 2014–2023 (tune on nine seasons, score the tenth), then tune on 2014–2023 and score the untouched 2024–2025
  holdout once. Models are compared by the per-race difference with its standard error across seasons (seasons, not
  races, are the unit), and in how many seasons one beats the other.
- A model is a set of numbers (`DEFAULT` = the Simulator today). Later stages add factors as more fields and compare with
  this same machinery.

## Baseline results (the Simulator as of #153, 2014–2025)

Race level, rounds 4+, mean log-probability of the real result per race: **model −36.96**, no information −43.08
(rounds 2–3: −45.58). By season −34.6 (2018) to −39.3 (2024).

Season level, 2,000 runs per cut point, average miss on the real final top 10's points (rank correlation in brackets):

| projection | early | mid | late |
|---|---|---|---|
| model (mean of the simulation) | 41.6 (0.91) | 24.8 (0.96) | 11.4 (0.98) |
| standings as they are | 140.5 (0.90) | 87.6 (0.96) | 33.8 (0.98) |
| last-5 average pace | 44.8 (0.91) | 25.7 (0.95) | 12.1 (0.98) |
| season-average pace | 43.3 (0.90) | 23.0 (0.96) | 10.7 (0.98) |

The simulation's point estimate is no better than a driver's season-average pace; its value is the distribution around it.

Title probability: log score of the real champion 0.69 / 0.65 / 0.15, Brier 0.45 / 0.46 / 0.09 (early / mid / late).
**Calibration shows overconfidence:** drivers given 80–90% to win the title won 68%; drivers given 90–100% of a
top-10 finish made it 97%, while those given under 10% made it 4.7% (predicted 0.7%). That supports the correlated
outcomes (idea 5) and calibration (idea 11) items in #151.

Tuning (`tune`): leave-one-season-out 2014–2023 gives **+0.70 ± 0.13 per race** over the current numbers, better in 9 of 10
seasons, always choosing the whole season as the window (16 races in one fold), `floor` 0.1 and `dnfPrior` 16;
`nearBonus` 0.5 and `nearDecay` 0.5 stay where they are. On the 2024–2025 holdout the same numbers give +0.57 ± 0.61 (two seasons,
so not conclusive alone). The score scale: the information in the weights is worth about 6 per race, so this is a modest gain.
These are for later stages to build on; the Simulator is unchanged.

## Data note

`site/data/2024.json` round 24 lists Pérez twice. The script keeps each driver once per race.
