// #177 (Simulator stage 5, step 0): do real results move together more than the Simulator's race model produces on its own?
//
//   node tools/correlation-diagnostic.mjs [--from 2014] [--to 2025] [--runs 5000] [--json]
//
// For every Grand Prix (round 4+) it draws the `current` model's race `runs` times (each driver retires at their DNF chance,
// the rest are drawn place by place; a retirement counts as last place) and compares the real result with the model's own:
//   teammate covariance   mean over teammate pairs of (real position - model mean) products, against the covariance the model's
//                         own draws give the same pair (the draws are not independent: a place can be taken only once)
//   dispersion            real sum over drivers of (position - model mean)^2, against the model's own sum of variances
//                         (1 = as spread out as the model says; above 1 = real races are more chaotic than the model)
// Both are also shown for "scores points" (a top-10 finish). Per-season means, then the mean across seasons with its standard
// error across seasons (a season is the unit). Walk-forward: the model sees only the earlier races.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raceCases, DEFAULT, pooledWeight, extraWeight, matesOf, dnfRate } from './backtest.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// Draws a race `runs` times; returns, per run and driver, the finishing position (1..finishers; a retirement = n).
export function drawPositions(c, p, runs, seed) {
  const n = c.racers.length, mates = c.mates || (c.mates = matesOf(c.team)), q = c.hist.map(r => dnfRate(r, c.gridRate, p));
  const W = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let s = 0; s < n; s++) W[i * n + s] = pooledWeight(c.hist, i, mates, s + 1, p) + extraWeight(c.known[i], c.form[i], c.track[i], s + 1, p);
  const rand = mulberry32(seed), pos = new Int16Array(runs * n), alive = new Int16Array(n), wts = new Float64Array(n);
  for (let r = 0; r < runs; r++) {
    let len = 0;
    for (let i = 0; i < n; i++) { if (rand() < q[i]) pos[r * n + i] = n; else alive[len++] = i; }
    for (let s = 0; s < len; s++) {
      let total = 0;
      for (let x = s; x < len; x++) { const w = W[alive[x] * n + s]; wts[x] = w; total += w; }
      let t = rand() * total, pick = len - 1;
      for (let x = s; x < len; x++) { if ((t -= wts[x]) <= 0) { pick = x; break; } }
      const i = alive[pick]; alive[pick] = alive[s]; alive[s] = i;
      pos[r * n + i] = s + 1;
    }
  }
  return pos;
}

// Real position of each racer in the case (a retirement = n).
const realPositions = c => { const n = c.racers.length, pos = new Array(n).fill(n); c.order.forEach((i, k) => { pos[i] = k + 1; }); return pos; };

// One race: for position and for "scores points", the observed and the model-implied teammate covariance (summed over teammate pairs),
// the observed sum of squared deviations and the model's sum of variances, and the number of pairs / drivers.
export function raceStats(c, runs, p = DEFAULT) {
  const n = c.racers.length, pos = drawPositions(c, p, runs, c.year * 100 + c.round), real = realPositions(c), mates = matesOf(c.team);
  const out = {};
  for (const [name, f] of [['position', x => x], ['points', x => (x <= 10 ? 1 : 0)]]) {
    const mu = new Float64Array(n), vr = new Float64Array(n);
    for (let r = 0; r < runs; r++) for (let i = 0; i < n; i++) mu[i] += f(pos[r * n + i]);
    for (let i = 0; i < n; i++) mu[i] /= runs;
    for (let r = 0; r < runs; r++) for (let i = 0; i < n; i++) vr[i] += (f(pos[r * n + i]) - mu[i]) ** 2;
    for (let i = 0; i < n; i++) vr[i] /= runs;
    let obsCov = 0, modCov = 0, pairs = 0;
    for (let i = 0; i < n; i++) for (const j of mates[i]) if (j > i) {
      pairs++;
      obsCov += (f(real[i]) - mu[i]) * (f(real[j]) - mu[j]);
      let e = 0; for (let r = 0; r < runs; r++) e += (f(pos[r * n + i]) - mu[i]) * (f(pos[r * n + j]) - mu[j]);
      modCov += e / runs;
    }
    let obsSS = 0, modSS = 0;
    for (let i = 0; i < n; i++) { obsSS += (f(real[i]) - mu[i]) ** 2; modSS += vr[i]; }
    out[name] = { obsCov, modCov, pairs, obsSS, modSS, n, sdSum: 0 };
  }
  return out;
}

export function diagnose(years, runs) {
  const perSeason = {};
  for (const y of years) {
    const rows = raceCases(y).filter(c => c.round >= 4).map(c => raceStats(c, runs));
    perSeason[y] = {};
    for (const name of ['position', 'points']) {
      const pairs = rows.reduce((s, r) => s + r[name].pairs, 0);
      perSeason[y][name] = {
        obsCov: rows.reduce((s, r) => s + r[name].obsCov, 0) / pairs, modCov: rows.reduce((s, r) => s + r[name].modCov, 0) / pairs,
        dispersion: rows.reduce((s, r) => s + r[name].obsSS, 0) / rows.reduce((s, r) => s + r[name].modSS, 0),
      };
    }
  }
  const summary = {};
  for (const name of ['position', 'points']) {
    const d = years.map(y => perSeason[y][name].obsCov - perSeason[y][name].modCov), disp = years.map(y => perSeason[y][name].dispersion);
    summary[name] = {
      obsCov: mean(years.map(y => perSeason[y][name].obsCov)), modCov: mean(years.map(y => perSeason[y][name].modCov)),
      covExcess: mean(d), covExcessSe: sd(d) / Math.sqrt(years.length), seasonsAbove: d.filter(x => x > 0).length,
      dispersion: mean(disp), dispersionSe: sd(disp) / Math.sqrt(years.length), seasonsAbove1: disp.filter(x => x > 1).length, seasons: years.length,
    };
  }
  return { perSeason, summary };
}

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : dflt; }
async function main() {
  const from = arg('from', 2014), to = arg('to', 2025), runs = arg('runs', 5000), years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const r = diagnose(years, runs);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return; }
  const f = (x, d = 3) => x.toFixed(d);
  console.log(`Correlated outcomes, ${from}–${to}, rounds 4+, ${runs} model draws per race (mean over seasons, ± standard error across seasons)`);
  for (const name of ['position', 'points']) {
    const s = r.summary[name];
    console.log(`\n${name === 'position' ? 'Finishing position (retirement = last)' : 'Scores points (top 10)'}`);
    console.log(`  teammate covariance: real ${f(s.obsCov)}  model ${f(s.modCov)}  excess ${f(s.covExcess)} ± ${f(s.covExcessSe)} (real above model in ${s.seasonsAbove} of ${s.seasons} seasons)`);
    console.log(`  dispersion (real / model variance): ${f(s.dispersion)} ± ${f(s.dispersionSe)} (above 1 in ${s.seasonsAbove1} of ${s.seasons} seasons)`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
