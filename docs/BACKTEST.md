# Backtest (#155, #160, #162, #167, #169, #173, #177, #179, #180)

`tools/backtest.mjs` scores simulator models against history and tunes their numbers. It reads `site/data/{year}.json`
(no network) and runs the site's own model and season engine (`site/racemodel.js`, #153) and standings code
(`site/common.js`) in Node. Run it locally, or by hand on GitHub (Actions → Backtest).

```
node tools/backtest.mjs race   --model previous,retuned,current # race level: the exact probability each model gave the real results
node tools/backtest.mjs season --model previous,retuned,current # season level: projections from every cut point vs the real season
node tools/backtest.mjs tune                                   # fit the numbers (leave-one-season-out, then the holdout)
node tools/backtest.mjs team                                   # #177: the per-team good-weekend factor, with and without (leave-one-season-out, holdout)
node tools/correlation-diagnostic.mjs                          # #177: do real results move together more than the model's own draws?
node tools/clinch-diagnostic.mjs                               # #179: is the clinch-round error bias or natural spread?
node tools/backtest.mjs drift --runs 400                       # #180: season-long pace drift, fitted at season level (about 5 minutes)
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

A model is a set of numbers (`MODELS` in the script; `current` is the Simulator now, #169; `quali` is it as of #167, without track history; `team` as of #162, without qualifying; `previous` is before #162).

| | window | near bonus | floor | DNF prior | team strength | grid / qualifying known | qualifying form | track |
|---|---|---|---|---|---|---|---|---|
| `previous` | last 8 | 0.5 | 0.01 | 4 | – | – | – | – |
| `retuned` | whole season | 0.5 | 0.1 | 64 | – | – | – | – |
| `team` | whole season | 0.5 | 0.03 | 64 | 0.25 | – | – | – |
| `quali` | whole season | 0.5 | 0.03 | 64 | 0.25 | 16 | 0.5 | – |
| `current` | whole season | 0.5 | 0.03 | 64 | 0.25 | 16 | 0.5 | 2 |

Team strength (`beta`): a driver's weight for a place is their own plus `beta` times the average of their teammates'
(teammates = the cars on the same team in the latest round), so a new or replaced driver inherits the car's pace.
`known` (#167): this race's starting grid (0 = pit lane = last) if it has one, else its qualifying position, counts as `known`
extra finishes at that position (and the near bonus behind it); `form` counts each of this season's earlier qualifying
positions. At season level only the next race has a known position. The tuner picked a window of 16 races with a near bonus of 0.25 for the model with team strength; whole season with 0.5
scores within 0.02 (−35.78 vs −35.77), so `current` keeps the simpler whole season and the old near bonus.

## Results (2014–2025)

**Race level**, mean log-probability of the real result per race (no information −43.08):
previous −36.96, retuned −36.20, current −35.78 (rounds 2–3: −45.58, −40.64, −39.27). Fitted leave-one-season-out on
2014–2023 and scored on 2024–2025 (the fitted numbers for the last two rows are the tuner's own, e.g. window 16 for team strength):

| gain per race | cross-validated | better in | holdout 2024–25 |
|---|---|---|---|
| retuned over previous | +0.74 ± 0.14 | 9 of 10 seasons | +0.67 ± 0.62 |
| with team strength over previous | +1.18 ± 0.09 | 10 of 10 | +0.99 ± 0.46 |
| team strength over retuned | +0.44 ± 0.11 | 9 of 10 | +0.32 ± 0.16 |

`current` over `previous`, all 12 seasons: +1.16 ± 0.13, better in 12 of 12.

Which numbers matter: the form window alone is worth about 0.2 (last 8 → whole season; last 5 is 0.8 worse than the
whole season); most of the retuned gain is the DNF smoothing and the floor. A driver's own DNF record barely predicts
their DNFs: any DNF prior from 32 to infinity scores the same, i.e. everyone retires at about the grid's rate. Weighting
recent races more (a decay) and team-based DNF chance were tried and add nothing (−0.05 ± 0.05 and +0.03 ± 0.02).

**Season level** (2,000 runs per cut point; all = mean of the per-season means):

| | previous | retuned | current | standings as is | last 5 avg | season avg | last round |
|---|---|---|---|---|---|---|---|
| points miss | 25.4 | 24.8 | 24.5 | 85.3 | 26.9 | 25.0 | |
| order error (places) | 1.05 | 1.00 | 0.99 | 1.01 | 1.06 | 1.01 | |
| champion log score | 0.48 | 0.39 | 0.39 | | | | |
| title Brier | 0.32 | 0.26 | 0.26 | | | | |
| clinch round miss | 0.99 | 1.03 | 1.08 | | | | 1.92 |

Paired differences (± standard error across the 12 seasons):

| | retuned − previous | current − previous |
|---|---|---|
| points miss | −0.60 ± 0.49 | −0.85 ± 0.57 |
| order error | −0.05 ± 0.04 | −0.06 ± 0.04 |
| champion log score | −0.09 ± 0.04 | −0.09 ± 0.04 |
| title Brier | −0.06 ± 0.02 | −0.06 ± 0.02 |
| clinch round miss | +0.05 ± 0.06 | +0.10 ± 0.07 |

What it says:
- The retune improves the title probabilities (log score 0.48 → 0.39, Brier 0.32 → 0.26, mostly early and mid-season)
  and the points slightly. Team strength adds nothing to the title probabilities; its gain is at race level (the next-race
  forecast) and a little in the points.
- **Order:** the projected order is no better than the standings as they are (1.0 place error either way). The Simulator's
  value is in the probabilities and the points, not a better order.
- **Clinch timing** is off by about one round on average (nearly twice as good as always saying the last round) and does
  not improve with either change: `current` is a hair worse (+0.10 ± 0.07 rounds, 1.4 standard errors).
- **Calibration:** the retune fixes most of the title overconfidence (the 80–90% bucket: observed 68% → 83%). P(top 10) is
  still overconfident at the top (the 80–90% bucket: observed 65–68%) and underconfident at the bottom (a predicted 1% is
  observed 3–4%). Results that move together across races (idea 5 in #151) are the likely cause.
- Even `previous` has genuine skill (race level −36.96 vs −43.08 with no information), but its point estimate is no better
  than a driver's season-average pace.

## Qualifying and the starting grid (#164, #167)

Race level, mean log-probability per race: `team` −35.78 → `current` −33.84 (**+1.88 ± 0.22, better in 12 of 12 seasons**).
Before the qualifying result is known, qualifying form alone gives −35.54 (+0.24). Fitted leave-one-season-out on 2014–2023
(all numbers free, including the weights of the new terms) and scored on 2024–2025: **+1.50 ± 0.21 over `team`, 10 of 10
seasons; holdout +3.20 ± 0.25.** Cross-validated pieces on their own, each over `team`: grid known +1.56 ± 0.16 (10 of 10;
holdout +2.8); qualifying position instead of the grid +1.44 ± 0.14 (a position known before penalties is nearly as good);
qualifying form +0.33 ± 0.10 (8 of 10; holdout +0.01); track history from earlier seasons at the same circuit +0.08 ± 0.03
(8 of 10; holdout +0.02, not built; a qualifying-based version is +0.09 in-sample, and the two carry the same information).
The grid / qualifying weight is best at 16 once form is also on (8 without it).

Season level (`current` against `team`, all cut points; the next race uses its known position, every race uses the form):

| | team | current | current − team |
|---|---|---|---|
| points miss | 24.54 | 23.11 | −1.43 ± 0.47 (lower in 9 of 12 seasons) |
| order error (places) | 0.99 | 0.93 | −0.05 ± 0.03 (8 of 12) |
| champion log score | 0.39 | 0.39 | 0.00 ± 0.01 |
| title Brier | 0.26 | 0.26 | 0.00 ± 0.01 |
| clinch round miss | 1.08 | 1.06 | −0.02 ± 0.02 |

The projected order is now slightly better than the standings as they are (1.01 places off); title odds and clinch timing
are unchanged. Letting only the next race use its known position gives −0.39 ± 0.07 on the points miss (12 of 12 seasons);
the rest comes from the qualifying form.

## Track history (#169)

`track` (weight 2): a driver's finishes at the same circuit in earlier seasons (2014 on), each minus their own average that season,
averaged and divided by (visits + 3), move their current average finish to an expected position at this circuit, which counts as
extra finishes there. `tools/track-history.mjs` builds `site/data/tracks.json` from the season and qualifying files; the pages use
only seasons before the one shown.

Race level, `quali` −33.835 → `current` −33.794 (**+0.040 ± 0.014 per race, better in 9 of 12 seasons**, about 4% more probability on
the real result). Before the qualifying result is in (form only): −35.542 → −35.510. The weights 1, 2 and 4 score within 0.003; the
gain is largest early in a season, when there is little in-season history (rounds 2–3: −37.26 → −36.40, +0.86). It was +0.08 ± 0.03
cross-validated against the Stage 3 model, +0.02 on the 2024–25 holdout.

Season level (`current` − `quali`): points miss +0.09 ± 0.09 (lower in 2 of 12 seasons), order error 0.00, champion log score 0.00 ± 0.01,
title Brier 0.00 ± 0.01, clinch round 0.00. So track history helps the next-race forecast a little and does not move the season
projection; it is kept at the owner's request.

## LightGBM challenger (#173, from the proposal in #172)

Question: does a gradient-boosted model (LightGBM) predict win / podium / points-finish probabilities better than the Simulator's
race model (`current`)? `tools/export-features.mjs` writes one row per driver per Grand Prix (2014–2025, rounds 2+) with only
pre-race information (this race's grid / qualifying position, earlier starts, finish, DNF and podium rates, teammates' finish,
earlier qualifying, track history, the grid's DNF rate) and the real result; `current`'s own probabilities come from a seeded
20,000-draw Monte Carlo of its race model. `tools/lgbm_experiment.py` trains one binary LightGBM per market (7 leaves, 250 trees,
learning rate 0.03, strong regularisation, no tuning) and scores both, plus a smoothed "finish = grid" baseline (the rate at which each
grid position reached the market). Same splits as above: leave-one-season-out over 2014–2023, and trained on 2014–2023 and scored on
2024–25. Rounds 4+; paired per-season differences. Run by hand: Actions → LightGBM comparison.

**Gate (fixed before running):** go on to feed LightGBM into the engine only if it beats `current` by more than one standard error, in
log loss and Brier, in the cross-validation on at least two of the three markets, and is also ahead on the 2024–25 holdout there.

Mean over seasons, log loss / Brier (lower is better):

| | | current | LightGBM | grid baseline |
|---|---|---|---|---|
| cross-validated 2014–23 | win | 0.1079 / 0.0320 | 0.1088 / 0.0322 | 0.1139 / 0.0322 |
| | podium | 0.2167 / 0.0668 | 0.2144 / 0.0667 | 0.2387 / 0.0703 |
| | points | 0.4742 / 0.1540 | 0.4754 / 0.1554 | 0.5218 / 0.1715 |
| holdout 2024–25 | win | 0.1157 / 0.0349 | 0.1183 / 0.0370 | 0.1135 / 0.0327 |
| | podium | 0.2218 / 0.0687 | 0.2117 / 0.0645 | 0.2284 / 0.0663 |
| | points | 0.4319 / 0.1378 | 0.4397 / 0.1402 | 0.4760 / 0.1516 |

LightGBM minus `current` (log loss, ± standard error across seasons; negative = LightGBM better):

| | cross-validated | holdout |
|---|---|---|
| win | +0.0008 ± 0.0037 (better in 5 of 10) | +0.0026 ± 0.0053 (0 of 2 on Brier) |
| podium | −0.0023 ± 0.0025 (6 of 10) | −0.0101 ± 0.0015 (2 of 2) |
| points | +0.0012 ± 0.0046 (5 of 10) | +0.0078 ± 0.0018 (0 of 2) |

**Result: gate not passed (no market beats `current` by more than one standard error in the cross-validation), so Phase 2 does not go ahead.**
- On three markets, LightGBM and `current` are statistically level over 2014–2023; the largest difference (podium log loss, −0.0023) is under one
  standard error. On the 2024–25 holdout LightGBM is better for the podium and worse for win and points (two seasons only, so the standard errors there are
  rough).
- Both clearly beat the grid baseline on podium and points (cross-validated, 10 of 10 seasons) and are no better than it for the win, where grid
  position already carries almost everything.
- Calibration is similar. `current` is a little over-confident in the middle of P(points) (40–50% predicted, 39% observed
  cross-validated), where LightGBM is closer; LightGBM's win probabilities above 10% rest on few cases and are noisy.
- The extra freedom of a tree model (interactions, non-linear grid effects) finds nothing the hand-built model misses with these features and
  about 4,800 driver-races. Practice pace and weather, the other inputs in #172, are not in our data; the proposal does not say where they would come from.

## Correlated outcomes: step 0 (#177)

Question: do real results move together more than the race model produces on its own? `tools/correlation-diagnostic.mjs` draws each
Grand Prix (rounds 4+, 2014–2025) 3,000 times from `current` and compares the real result with the model's own, for finishing position (a
retirement counts as last) and for "scores points". Walk-forward, per-season means, standard errors across the 12 seasons.

| | real | model | |
|---|---|---|---|
| teammate covariance, position | +1.59 | −1.50 | excess +3.09 ± 0.56, real above the model in 11 of 12 seasons |
| teammate covariance, scores points | +0.010 | −0.009 | excess +0.019 ± 0.003, 12 of 12 |
| dispersion, position (real / model variance) | | | 0.87 ± 0.03, above 1 in 1 of 12 |
| dispersion, scores points | | | 0.91 ± 0.02, above 1 in 0 of 12 |

- **Teammates move together, and the model has none of it.** The model's own draws make teammates slightly negatively related (a place can be
  taken only once); the real covariance is positive in 11–12 of 12 seasons. A per-team "good weekend" factor is supported.
- **No race-wide chaos.** Real races are not more spread out than the model says (dispersion 0.87–0.91, below 1 in 11–12 seasons); if
  anything the model is a little too uncertain about each driver. A factor that flattens every race (the planned "chaos") is not supported.

## Correlated outcomes: the per-team factor (#177, steps 1–2)

`sigma` (backtest models `refit` and `teamfx`): in each race (each simulated event, in the season engine) every team draws a "good weekend"
`exp(sigma·z − sigma²/2)`, z standard normal, the same for both of its cars, and multiplies both cars' weights for every place. At race
level the probability of the real order is the exact place-by-place probability averaged over 64 seeded draws of the factors (the same
draws for every parameter value, so tuning is smooth). `sigma = 0` is the Simulator exactly. In the season engine (`teamScaled` in
`racemodel.js`) it is off unless a context sets `sigma`, and then it is the only thing that draws extra random numbers, so the pages are unchanged.

**Race level** (`node tools/backtest.mjs team`; beta, floor, known, form and near bonus refitted in both variants, sigma also in the challenger;
leave-one-season-out on 2014–2023, then fitted on 2014–2023 and scored on 2024–25), mean log-probability per race:

| | cross-validated | holdout 2024–25 |
|---|---|---|
| numbers refitted, no factor | −33.615 | −34.661 (shipped numbers: −34.681) |
| plus the team factor | −33.441 | −34.652 |
| gain | **+0.168 ± 0.060, better in 9 of 10 seasons** | +0.009 ± 0.043 |

The fitted sigma is 0.6 in 8 of 10 folds and 0.4 in two (0.6 is the optimum, not the edge of the grid; the grid now goes to 1.5). The factor
makes the tuner prefer a smaller near bonus (0.25) and floor 0.001.

**Season level** (`teamfx` = floor 0.001, near bonus 0.25, sigma 0.6, against `refit` = `current` with floor 0.001; 2,000 runs per cut point;
lower is better; paired difference ± standard error across the 12 seasons):

| | refit | teamfx | teamfx − refit |
|---|---|---|---|
| points miss | 23.19 | 22.82 | −0.36 ± 0.19 (lower in 10 of 12 seasons) |
| order error (places) | 0.94 | 0.94 | +0.003 ± 0.009 |
| champion log score | 0.39 | 0.38 | −0.011 ± 0.008 |
| title Brier | 0.26 | 0.25 | −0.005 ± 0.006 |
| clinch round miss | 1.07 | 1.05 | −0.018 ± 0.020 |

Calibration (mean absolute gap between predicted and observed, over all 10% buckets): P(title) 0.0048 → 0.0048, P(top 3) 0.0042 → 0.0023,
P(top 10) 0.0376 → 0.0401.

**Result: the gate was not passed, so the factor is not built into the Simulator.** The gate asked for better calibration (P(top 10),
P(top 3), title) and a better title Brier or champion log score by more than one standard error, with the other measures no worse. The
points miss improves (−0.36, 1.9 standard errors) and the champion log score by 1.4 standard errors, but the title Brier does not (0.9), P(top 3) is already
well calibrated, and P(top 10), the weak spot that motivated the stage, gets slightly worse. Teammates really do move together
(step 0), but a season total is a sum over many races, so the shared team effect mostly cancels in the expected points and the title odds; it
widens the tails only a little.

- **The P(top 10) overconfidence is not a correlation problem.** At a predicted 70–90% the observed rate is 48–72%, with and without the
  factor. The cause is something else (the roster, how ties near the top 10 are counted, or the weights being too sharp for the middle of the
  field); that is the lead for the next stage.
- The engine option and the `teamfx` model stay in the repository so the result can be reproduced; nothing in the Simulator or What-If uses them.

## Clinch timing: is the error bias or natural spread? (#179)

The simulated settling round (the Simulator's "title decided" card) is off by about one round and no model change has improved it.
`tools/clinch-diagnostic.mjs` takes every cut point from round 4 to the real settling round (181 of them, 2014–2025), simulates the rest of the
season with `current` (1,000 runs) and compares the median simulated settling round with the real one.

| part of season | cut points | simulated median − real | mean absolute error | real round inside the 10–90% band (nominal 80%) |
|---|---|---|---|---|
| early | 69 | +0.59 | 1.46 | 83% (band 2.7 rounds wide) |
| mid | 64 | +0.34 | 1.03 | 88% (2.1 wide) |
| late | 48 | +0.06 | 0.35 | 98% (1.3 wide) |

By season the model leans late in runaway seasons (2015 +1.8, 2017 +1.1, 2018 +0.8, 2020 +1.3, 2022 +2.3, 2023 +1.4 rounds) and early in seasons settled in the last
round (2014 −0.7, 2016 −0.9, 2021 −0.7, 2025 −0.8). Could the error be predicted from what is known at the cut point? A least-squares fit on the leader's lead over second
place as a share of the points still available, the leader's share of wins so far and the share of rounds left, fitted leave-one-season-out, takes the mean
absolute error from 1.02 to 1.11 rounds (gain **−0.05 ± 0.09**, better in 7 of 12 seasons): it removes nothing.

**Result: natural spread, not a bias to fix. No model change.** The median is close to unbiased and the 80% band holds the real round about as often as it
claims (a little wider than needed late in the season). What differs between seasons, a runaway one against a title that goes to the last round, is not
visible in the lead, the win share or the rounds left at the cut point. The card already shows the whole distribution of settling rounds, which is the
honest answer. If the season-long pace drift (#180) improves the top-10 calibration it may also tighten this, and the backtest will show it.

## Season-long pace drift (#180)

Hypothesis (from the top-10 overconfidence, #151): the Simulator treats each team's pace as known for the rest of the season, while real
pace drifts. `driftTeam` / `driftDriver` (and `driftWalk`) give every team (and optionally driver) a strength offset per simulated season that
multiplies its weights as `exp(offset − variance/2)`: a random walk with one step per round after the first round simulated (`driftWalk`, the spread grows with the
rounds ahead, like car development) or one level shift drawn at the start of the season. The next race is never drifted, so What-If's
single-race forecast is unchanged. In the engine (`driftReset`, `driftStep`, `driftScaled` in `racemodel.js`) it is off unless a context sets it
and then draws extra random numbers only when it is on.

New season-level measures: the Brier score of P(top 3) and P(top 10) against the real final ranking (sum over drivers; lower is better).
Race level cannot see drift (a one-step forecast), so everything is at season level. `node tools/backtest.mjs drift` tries 28 walk models, 24 level models
and a control that refits the existing numbers (floor, near bonus, team strength) at season level, chooses each family's best by the top-10 Brier
leave-one-season-out on 2014–2023, and scores the 2024–25 holdout.

**Drift improves the top-10 Brier, and at a cost.** A random walk in each team's strength (sd per round; all 12 seasons, 1,000 runs per cut point, paired against `current`, in
standard errors across seasons; negative = better):

| sd per round | top 10 Brier | top 3 Brier | title Brier | champion log score | points miss | order error | top-10 calibration gap |
|---|---|---|---|---|---|---|---|
| 0.07 | −0.009 (−2.3) | −0.004 (−0.9) | −0.001 (−0.5) | −0.000 (−0.1) | −0.02 (−0.5) | −0.005 (−1.1) | 0.0349 |
| 0.10 | −0.016 (−3.1) | −0.006 (−0.8) | −0.000 (−0.1) | +0.003 (+0.6) | +0.00 (0.0) | −0.007 (−1.4) | 0.0349 |
| 0.15 | −0.031 (−4.4) | −0.009 (−0.8) | +0.000 (0.0) | +0.008 (+1.3) | +0.06 (+0.7) | −0.008 (−1.5) | 0.0320 |
| 0.20 | −0.042 (−3.9) | −0.011 (−0.6) | +0.002 (+0.5) | +0.017 (+1.9) | +0.13 (+1.0) | −0.006 (−1.1) | 0.0296 |
| 0.30 | −0.073 (−4.2) | −0.006 (−0.2) | +0.008 (+1.3) | +0.039 (+2.8) | +0.41 (+1.6) | −0.007 (−1.3) | 0.0238 |

(`current`: top-10 gap 0.0354, top-3 gap 0.0028, title gap 0.0045.) Chosen on the top-10 Brier alone, the fit runs to the edge of any grid and takes the
title odds and the points with it (walk, sd 0.3: top-10 Brier −0.060 ± 0.021 cross-validated, 8 of 10 seasons, holdout −0.095; champion log score
+0.027 ± 0.010, title Brier +0.007 ± 0.008, points miss +0.47 ± 0.29; level shift: top-10 −0.086 ± 0.040 but champion log score +0.080 ± 0.012, points miss
+1.2 ± 0.5). The control, flatter weights (floor 1, near bonus 1) refitted at season level, reaches the same top-10 Brier (−0.076 ± 0.032) and cuts the
top-10 gap to 0.0118, at +3.9 ± 1.0 points miss.

**Result: the gate was not passed, so drift is not built into the Simulator.** The gate asked for a better top-10 Brier **and** a smaller top-10 calibration gap, top-3 and title
gaps no worse, a better title Brier or champion log score by more than one standard error, and points miss and order error no worse. The top-10 Brier clears it easily
(−3 to −4 standard errors), but the title measures do not improve (they get worse from 0.15 per round), the top-3 and title gaps tick up, and the top-10 gap barely moves
below 0.15 per round (0.0354 → 0.0349 at 0.10).

- **The overconfidence is mostly still there.** With drift of 0.10–0.15 per round, drivers given 70–80% for the final top 10 still finish there about 45% of the time (50% without drift).
  The cause is not season-long drift of a team's pace. Making every race noisier (flat weights) moves the gap far more than drift does and costs the points; so the
  mid-field order is noisier than independent-race weights say, in a way a smooth pace drift does not represent.
- **A free small gain exists** (sd 0.07–0.10 per round: top-10 Brier −0.009 to −0.016, order error −1.1 to −1.4 standard errors, nothing else moves), but it is not visible in the
  calibration table, it changes every seeded share link, and the gate says no.
- The engine option and the models `drift04` … `drift30` stay in the repository to reproduce this; nothing in the Simulator or What-If uses them.

## Data note

`site/data/2024.json` round 24 used to list Pérez twice and have no Lawson (f1api.dev); it was repaired from Jolpica (#157), and
`tools/snapshot.mjs` now repairs any round that repeats a driver. The script still keeps each driver once per race, as a guard.
