// #173: one row per driver per Grand Prix (2014 on, from round 2) for the LightGBM comparison (tools/lgbm_experiment.py).
//
//   node tools/export-features.mjs [--from 2014] [--to 2025] [--runs 20000] [--out features.csv]
//
// Features use only what is known before the race (the backtest's walk-forward cases, tools/backtest.mjs): earlier starts
// this season, the starting grid / qualifying position of this race, earlier qualifying, track history from earlier seasons.
// Labels are the real result (win, podium, points = classified in the top 10). `cur_*` are the Simulator's own (`current`)
// probabilities for the same three events, from a seeded Monte Carlo of its race model, so both models are scored on the same rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raceCases, DEFAULT, pooledWeight, extraWeight, matesOf, dnfRate } from './backtest.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const classified = h => h.filter(f => f != null);

// The model's chance that each racer wins / is on the podium / finishes in the top 10: `runs` draws of its race model
// (each driver retires at their DNF chance, the rest are drawn place by place), as the Simulator does.
export function modelMarginals(c, p, runs, seed) {
  const n = c.racers.length, mates = c.mates || (c.mates = matesOf(c.team));
  const res = c.hist, q = res.map(r => dnfRate(r, c.gridRate, p));
  const W = new Float64Array(n * 10);
  for (let i = 0; i < n; i++) for (let s = 0; s < 10; s++) W[i * 10 + s] = pooledWeight(res, i, mates, s + 1, p) + extraWeight(c.known[i], c.form[i], c.track[i], s + 1, p);
  const rand = mulberry32(seed), win = new Float64Array(n), pod = new Float64Array(n), pts = new Float64Array(n), alive = new Int16Array(n), wts = new Float64Array(n);
  for (let r = 0; r < runs; r++) {
    let len = 0;
    for (let i = 0; i < n; i++) if (rand() >= q[i]) alive[len++] = i;
    for (let s = 0; s < 10 && s < len; s++) {
      let total = 0;
      for (let x = s; x < len; x++) { const w = W[alive[x] * 10 + s]; wts[x] = w; total += w; }
      let t = rand() * total, pick = len - 1;
      for (let x = s; x < len; x++) { if ((t -= wts[x]) <= 0) { pick = x; break; } }
      const i = alive[pick]; alive[pick] = alive[s]; alive[s] = i;
      if (s === 0) win[i]++;
      if (s < 3) pod[i]++;
      pts[i]++;
    }
  }
  return { win: Array.from(win, x => x / runs), podium: Array.from(pod, x => x / runs), points: Array.from(pts, x => x / runs) };
}

export const COLUMNS = ['year', 'round', 'driverId', 'teamId', 'n', 'pos', 'win', 'podium', 'points',
  'known', 'starts', 'mean_finish', 'last3_finish', 'dnf_rate', 'top10_rate', 'podium_rate', 'mate_mean_finish', 'q_starts', 'mean_quali', 'track_pos', 'known_rel', 'grid_rate',
  'cur_win', 'cur_podium', 'cur_points'];

// Rows for one season's cases (see raceCases). `marginals` = false skips the Monte Carlo (cur_* left empty).
export function featureRows(cases, runs = 20000, marginals = true) {
  const rows = [];
  for (const c of cases) {
    const n = c.racers.length, pos = {};
    c.order.forEach((i, k) => { pos[i] = k + 1; });
    const cur = marginals ? modelMarginals(c, DEFAULT, runs, c.year * 100 + c.round) : null;
    const mates = matesOf(c.team);
    c.racers.forEach((id, i) => {
      const h = c.hist[i], cl = classified(h), mf = mean(cl), mm = mean(mates[i].flatMap(j => classified(c.hist[j]))), mq = mean(c.form[i]);
      rows.push({
        year: c.year, round: c.round, driverId: id, teamId: c.team[i], n,
        pos: pos[i] ?? '', win: pos[i] === 1 ? 1 : 0, podium: pos[i] <= 3 ? 1 : 0, points: pos[i] <= 10 ? 1 : 0,
        known: c.known[i] ?? '', starts: h.length, mean_finish: mf ?? '', last3_finish: mean(classified(h.slice(-3))) ?? '',
        dnf_rate: h.length ? (h.length - cl.length) / h.length : '', top10_rate: h.length ? cl.filter(f => f <= 10).length / h.length : '',
        podium_rate: h.length ? cl.filter(f => f <= 3).length / h.length : '', mate_mean_finish: mm ?? '',
        q_starts: c.form[i].length, mean_quali: mq ?? '', track_pos: c.track[i] ?? '',
        known_rel: c.known[i] != null && mf != null ? c.known[i] - mf : '', grid_rate: c.gridRate,
        cur_win: cur ? cur.win[i] : '', cur_podium: cur ? cur.podium[i] : '', cur_points: cur ? cur.points[i] : '',
      });
    });
  }
  return rows;
}

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; }
async function main() {
  const from = +arg('from', 2014), to = +arg('to', 2025), runs = +arg('runs', 20000), out = arg('out', 'features.csv');
  const lines = [COLUMNS.join(',')];
  for (let y = from; y <= to; y++) for (const r of featureRows(raceCases(y), runs)) lines.push(COLUMNS.map(k => typeof r[k] === 'number' ? +r[k].toFixed(6) : r[k]).join(','));
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${lines.length - 1} rows, ${from}–${to}, written to ${out}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
