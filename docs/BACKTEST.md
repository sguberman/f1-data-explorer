# Backtest (#155, #160)

`tools/backtest.mjs` scores simulator models against history and tunes their numbers. It reads `site/data/{year}.json`
(no network) and runs the site's own model and season engine (`site/racemodel.js`, #153) and standings code
(`site/common.js`) in Node. Run it locally, or by hand on GitHub (Actions → Backtest).

```
node tools/backtest.mjs race   --model current,retuned,team   # race level: the exact probability each model gave the real results
node tools/backtest.mjs season --model current,retuned,team   # season level: projections from every cut point vs the real season
node tools/backtest.mjs tune                                   # fit the numbers (leave-one-season-out, then the holdout)
  --from 2014 --to 2025 --holdout 2024 --runs 2000 --calibration --json
```

## What it measures

The Simulator's goals are the final order and points, when the title is clinched (the plots on the Simulator page),
and, for What-If, the next race. So there are two levels:

- **Race level (fast; tuning, and the next-race goal).** The model retires each driver at their DNF chance, then draws the
  finishers place by place with that place's weights. Both parts have an exact probability, so the score for a race is
  the log of the probability the model gave the real result: no simulation, a whole 2014–2025 pass takes about a tenth of
  a second. Differences are what matter: a gain of d means the real result got e^d times the probability. "Rounds 4+"
  is the score; rounds 2–3 (little in-season history) are reported apart. "No information" is a random order with
  everyone retiring at the grid's rate.
- **Season level (the deciding test for any change to the site).** From every cut point (round 4 to the second-last round)
  it projects the rest of the season with the real engine (seeded, the same seeds for every model) and compares with
  the real season. All lower-is-better:
  - **points miss**: the average miss on the real final top 10's points;
  - **order error**: the average error, in places, of the projected order (by projected points) for the real top 10;
  - **champion log score**: −ln of the probability given to the real champion (0.69 = 50%, 0.15 = 86%);
  - **title Brier**: the sum over drivers of (probability − 1 for the champion)²; spreading evenly over 20 drivers gives 0.95;
  - **clinch round miss**: how many rounds the median simulated settling round is off the real one, counted only at cut
    points before the title was settled. "Settled" is the Simulator's own test (#86): a win in every Grand Prix (25) and sprint
    (8) left, from the runner-up, would still not catch the leader. Baseline "last round": always say the final round.
  - Plain projections beside the models: the standings as they are, last-5 average pace, season-average pace.
  - Calibration (`--calibration`): predicted vs observed P(title), P(top 3), P(top 10) in 10% buckets.
- **Walk-forward only.** A model sees just the races before the one it is scored on (or before the cut point).
- **Points** are recomputed from finishing positions with the season's points table, as the Simulator scores them, so
  the fastest-lap point (2019–24), double points (2014) and half points (2021 Belgium) are out of both sides. The
  champion and final ranking are as awarded.
- **Comparing models.** Per-season means, then the paired difference between two models with its standard error across
  seasons (seasons, not races, are the unit) and the number of seasons one is better in. Twelve seasons is thin: treat
  differences under about one standard error as noise.
- **Tuning.** Coordinate descent over `window`, `nearBonus`, `nearDecay`, `floor`, `dnfPrior` (and `beta` for team
  strength). Leave-one-season-out over 2014–2023 (fit on nine seasons, score the tenth), then fit on 2014–2023 and score the
  untouched 2024–2025 holdout once.

## Models

A model is a set of numbers (`MODELS` in the script; `current` = the Simulator today).

| | window | near bonus | floor | DNF prior | team strength |
|---|---|---|---|---|---|
| `current` | last 8 | 0.5 | 0.01 | 4 | – |
| `retuned` | whole season | 0.5 | 0.1 | 64 | – |
| `team` | last 16 | 0.25 | 0.03 | 64 | 0.25 |

Team strength (`beta`): a driver's weight for a place is their own plus `beta` times the average of their teammates'
(teammates = the cars on the same team in the latest round), so a new or replaced driver inherits the car's pace.

## Results (2014–2025; the Simulator is unchanged)

**Race level**, mean log-probability of the real result per race (no information −43.08):
current −36.96, retuned −36.21, team −35.78. Fitted leave-one-season-out on 2014–2023 and scored on 2024–2025:

| gain per race | cross-validated | better in | holdout 2024–25 |
|---|---|---|---|
| retuned over current | +0.74 ± 0.14 | 9 of 10 seasons | +0.67 ± 0.62 |
| team over current | +1.18 ± 0.09 | 10 of 10 | +0.99 ± 0.46 |
| team over retuned | +0.44 ± 0.11 | 9 of 10 | +0.32 ± 0.16 |

Which numbers matter: the form window alone is worth about 0.2 (last 8 → whole season; last 5 is 0.8 worse than the
whole season); most of the retuned gain is the DNF smoothing and the floor. A driver's own DNF record barely predicts
their DNFs: any DNF prior from 32 to infinity scores the same, i.e. everyone retires at about the grid's rate. Weighting
recent races more (a decay) and team-based DNF chance were tried and add nothing (−0.05 ± 0.05 and +0.03 ± 0.02).

**Season level** (2,000 runs per cut point; all = mean of the per-season means):

| | current | retuned | team | standings as is | last 5 avg | season avg | last round |
|---|---|---|---|---|---|---|---|
| points miss | 25.4 | 24.8 | 24.0 | 85.3 | 26.9 | 25.0 | |
| order error (places) | 1.05 | 1.00 | 0.99 | 1.01 | 1.06 | 1.01 | |
| champion log score | 0.48 | 0.39 | 0.38 | | | | |
| title Brier | 0.32 | 0.26 | 0.25 | | | | |
| clinch round miss | 0.99 | 1.03 | 1.06 | | | | 1.92 |

Paired differences (± standard error across the 12 seasons):

| | retuned − current | team − current | team − retuned |
|---|---|---|---|
| points miss | −0.60 ± 0.49 | −1.38 ± 0.73 | −0.78 ± 0.69 |
| order error | −0.05 ± 0.04 | −0.06 ± 0.04 | −0.01 ± 0.03 |
| champion log score | −0.09 ± 0.04 | −0.10 ± 0.04 | −0.01 ± 0.01 |
| title Brier | −0.06 ± 0.02 | −0.07 ± 0.02 | −0.01 ± 0.01 |
| clinch round miss | +0.05 ± 0.06 | +0.08 ± 0.06 | +0.03 ± 0.02 |

What it says:
- The retune improves the title probabilities (log score 0.48 → 0.39, Brier 0.32 → 0.26, mostly early and mid-season)
  and the points slightly. Team strength adds little at season level; its gain is at race level (the next-race forecast).
- **Order:** the projected order is no better than the standings as they are (1.0 place error either way). The Simulator's
  value is in the probabilities and the points, not a better order.
- **Clinch timing** is off by about one round on average (twice as good as always saying the last round) and does not
  improve with either change; team strength is a hair worse (+0.08 ± 0.06 rounds, within about 1.3 standard errors).
- **Calibration:** the retune fixes most of the title overconfidence (the 80–90% bucket: observed 68% → 83%). P(top 10) is
  still overconfident at the top (the 80–90% bucket: observed 65–68%) and underconfident at the bottom (a predicted 1% is
  observed 3–4%). Results that move together across races (idea 5 in #151) are the likely cause.
- Even `current` has genuine skill (race level −36.96 vs −43.08 with no information), but its point estimate is no better
  than a driver's season-average pace.

## Data note

`site/data/2024.json` round 24 lists Pérez twice and has no Lawson (#157). The script keeps each driver once per race.
