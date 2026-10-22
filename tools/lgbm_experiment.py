"""#173: LightGBM against the Simulator's race model on win / podium / points probabilities.

    node tools/export-features.mjs --out features.csv
    python3 tools/lgbm_experiment.py features.csv [--holdout 2024] [--json]

Models, all scored on the same driver-race rows (rounds 4+, as the backtest):
  current   the Simulator's own probabilities (cur_* columns, seeded Monte Carlo of its race model)
  lgbm      LightGBM on the same pre-race information, one binary model per market
  grid      the "finish = grid" baseline, smoothed: the rate at which each grid position reached the market in the training seasons

Splits as docs/BACKTEST.md: leave-one-season-out over the seasons before the holdout (a model sees every other season),
then trained on those seasons and scored once on the holdout seasons. Lower is better for log loss and Brier. Differences are
paired per season (a season is the unit); the standard error is across seasons.
"""
import json
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd

MARKETS = ['win', 'podium', 'points']
FEATURES = ['known', 'n', 'round', 'starts', 'mean_finish', 'last3_finish', 'dnf_rate', 'top10_rate', 'podium_rate',
            'mate_mean_finish', 'q_starts', 'mean_quali', 'track_pos', 'known_rel', 'grid_rate']
PARAMS = dict(objective='binary', learning_rate=0.03, num_leaves=7, min_child_samples=40, subsample=0.8, subsample_freq=1,
              colsample_bytree=0.8, reg_lambda=5.0, n_estimators=250, random_state=1, verbose=-1)
EPS = 1e-4


def log_loss(y, p):
    p = np.clip(p, EPS, 1 - EPS)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def brier(y, p):
    return (y - p) ** 2


def grid_baseline(train, test, market):
    """P(market | grid position), smoothed toward the overall rate with 20 pseudo-starts."""
    base = train[market].mean()
    g = train.groupby('known')[market].agg(['sum', 'count'])
    rate = (g['sum'] + 20 * base) / (g['count'] + 20)
    return test['known'].map(rate).fillna(base).to_numpy()


def predict(train, test):
    out = {'current': {m: test['cur_' + m].to_numpy() for m in MARKETS}, 'lgbm': {}, 'grid': {}}
    for m in MARKETS:
        model = lgb.LGBMClassifier(**PARAMS).fit(train[FEATURES], train[m])
        out['lgbm'][m] = model.predict_proba(test[FEATURES])[:, 1]
        out['grid'][m] = grid_baseline(train, test, m)
    return out


def season_means(df, preds, years):
    """{model: {market: {metric: {year: mean over rows}}}} for the rows of df."""
    res = {}
    for name, ps in preds.items():
        res[name] = {}
        for m in MARKETS:
            y = df[m].to_numpy()
            res[name][m] = {'logloss': log_loss(y, ps[m]), 'brier': brier(y, ps[m])}
    out = {}
    for name in res:
        out[name] = {m: {k: {int(yr): float(v[(df['year'] == yr).to_numpy()].mean()) for yr in years} for k, v in res[name][m].items()} for m in MARKETS}
    return out


def paired(a, b, years):
    """b minus a per season: mean, standard error across seasons, seasons where b is lower (better)."""
    d = np.array([b[y] - a[y] for y in years])
    se = d.std(ddof=1) / np.sqrt(len(d)) if len(d) > 1 else float('nan')
    return {'diff': float(d.mean()), 'se': float(se), 'better': int((d < 0).sum()), 'seasons': len(d)}


def calibration(df, p, m, bins=10):
    b = np.minimum(bins - 1, (np.clip(p, 0, 1) * bins).astype(int))
    rows = []
    for k in range(bins):
        s = b == k
        if s.any():
            rows.append({'bin': f'{k * 100 // bins}-{(k + 1) * 100 // bins}%', 'n': int(s.sum()), 'predicted': float(p[s].mean()), 'observed': float(df[m].to_numpy()[s].mean())})
    return rows


def main():
    args = sys.argv[1:]
    path = args[0]
    holdout = int(args[args.index('--holdout') + 1]) if '--holdout' in args else 2024
    df = pd.read_csv(path)
    years = sorted(df['year'].unique())
    pool = [y for y in years if y < holdout]
    hold = [y for y in years if y >= holdout]

    def scored(rows):
        return rows[rows['round'] >= 4]

    # leave-one-season-out over the pool: every season is predicted by models that never saw it
    cv_parts, cv_preds = [], {k: {m: [] for m in MARKETS} for k in ('current', 'lgbm', 'grid')}
    for y in pool:
        train, test = df[df['year'].isin(pool) & (df['year'] != y) & (df['round'] >= 2)], scored(df[df['year'] == y])
        p = predict(train, test)
        cv_parts.append(test)
        for k in p:
            for m in MARKETS:
                cv_preds[k][m].append(p[k][m])
    cv_df = pd.concat(cv_parts)
    cv_preds = {k: {m: np.concatenate(v) for m, v in d.items()} for k, d in cv_preds.items()}
    # the holdout: fitted on the pool only
    ho_df = scored(df[df['year'].isin(hold)])
    ho_preds = predict(df[df['year'].isin(pool)], ho_df)

    result = {'pool': pool, 'hold': hold}
    for label, d, p, ys in (('cv', cv_df, cv_preds, pool), ('holdout', ho_df, ho_preds, hold)):
        sm = season_means(d, p, ys)
        res = {'mean': {n: {m: {k: float(np.mean(list(v.values()))) for k, v in sm[n][m].items()} for m in MARKETS} for n in sm}}
        res['lgbm_vs_current'] = {m: {k: paired(sm['current'][m][k], sm['lgbm'][m][k], ys) for k in ('logloss', 'brier')} for m in MARKETS}
        res['lgbm_vs_grid'] = {m: {k: paired(sm['grid'][m][k], sm['lgbm'][m][k], ys) for k in ('logloss', 'brier')} for m in MARKETS}
        res['current_vs_grid'] = {m: {k: paired(sm['grid'][m][k], sm['current'][m][k], ys) for k in ('logloss', 'brier')} for m in MARKETS}
        res['calibration'] = {n: {m: calibration(d, p[n][m], m) for m in MARKETS} for n in p}
        result[label] = res

    # The gate (issue #173): LightGBM beats `current` by more than one standard error in the cross-validation on at least
    # two of the three markets (log loss, Brier the same way), and is also ahead on the holdout for those markets.
    gate = {}
    for m in MARKETS:
        cv = result['cv']['lgbm_vs_current'][m]
        ho = result['holdout']['lgbm_vs_current'][m]
        cv_win = all(cv[k]['diff'] < -cv[k]['se'] for k in ('logloss', 'brier'))
        ho_win = all(ho[k]['diff'] < 0 for k in ('logloss', 'brier'))
        gate[m] = {'cv_beats_by_more_than_1se': bool(cv_win), 'holdout_ahead': bool(ho_win), 'passes': bool(cv_win and ho_win)}
    gate['phase2'] = sum(g['passes'] for g in gate.values() if isinstance(g, dict) and 'passes' in g) >= 2
    result['gate'] = gate

    if '--json' in args:
        print(json.dumps(result, indent=1))
        return
    for label, title in (('cv', f'Leave-one-season-out, {pool[0]}-{pool[-1]}'), ('holdout', f'Holdout {hold[0]}-{hold[-1]} (fitted on {pool[0]}-{pool[-1]})')):
        r = result[label]
        print(f'\n{title}: mean over seasons (lower is better)')
        for m in MARKETS:
            line = '  '.join(f"{n} {r['mean'][n][m]['logloss']:.4f}/{r['mean'][n][m]['brier']:.4f}" for n in ('current', 'lgbm', 'grid'))
            print(f'  {m:<7} logloss/brier  {line}')
        for key, name in (('lgbm_vs_current', 'lgbm minus current'), ('lgbm_vs_grid', 'lgbm minus grid'), ('current_vs_grid', 'current minus grid')):
            print(f'  {name}:')
            for m in MARKETS:
                c = r[key][m]
                print(f"    {m:<7} logloss {c['logloss']['diff']:+.4f} ± {c['logloss']['se']:.4f} (lower in {c['logloss']['better']} of {c['logloss']['seasons']})   brier {c['brier']['diff']:+.4f} ± {c['brier']['se']:.4f} (lower in {c['brier']['better']} of {c['brier']['seasons']})")
    print('\nGate:')
    for m in MARKETS:
        g = gate[m]
        print(f"  {m:<7} cv beats current by >1 SE: {g['cv_beats_by_more_than_1se']}   holdout ahead: {g['holdout_ahead']}   passes: {g['passes']}")
    print(f"  Phase 2 (feed the engine): {'GO' if gate['phase2'] else 'NO-GO'}")
    if '--calibration' in args:
        for label in ('cv', 'holdout'):
            for n in ('current', 'lgbm'):
                for m in MARKETS:
                    print(f'\nCalibration, {label}, {n}, {m}: predicted vs observed')
                    for b in result[label]['calibration'][n][m]:
                        print(f"  {b['bin']:<8} n={b['n']:>5}  predicted {b['predicted']:.3f}  observed {b['observed']:.3f}")


if __name__ == '__main__':
    main()
