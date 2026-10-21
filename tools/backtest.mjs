// #155: scores simulator models against history, and tunes their parameters.
//
//   node tools/backtest.mjs race            race level: the exact probability a model gave each real result
//   node tools/backtest.mjs season          season level: projections from many cut points vs the real final standings
//   node tools/backtest.mjs tune            fits the race model's parameters (leave-one-season-out, then the holdout)
//   options: --from 2014 --to 2025 --holdout 2024 --runs 2000 --json
//
// Reads site/data/{year}.json (no network) and runs the site's own model and season engine (site/racemodel.js, #153)
// and standings code (site/common.js) in Node. Walk-forward only: a model sees just the races before the one it is
// scored on, or before the cut point. Points are recomputed from finishing positions with the season's points table,
// as the Simulator scores them (so no fastest-lap point, double points or half points on either side).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'site', 'data');
const F1RaceModel = createRequire(import.meta.url)('../site/racemodel.js');
const F1Common = (() => {
  const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'common.js'), 'utf8') + '\n;globalThis.F1Common = F1Common;', ctx);
  return ctx.F1Common;
})();

// ---- Models ----
// A model is a set of numbers; DEFAULT is the Simulator as it is today (the constants in racemodel.js, window 8).
export const DEFAULT = { window: 8, nearBonus: F1RaceModel.NEAR_BONUS, nearDecay: F1RaceModel.NEAR_DECAY, floor: F1RaceModel.WEIGHT_FLOOR, dnfPrior: F1RaceModel.DNF_PRIOR_RACES };
const GRID = { // what `tune` tries for each number
  window: [3, 4, 5, 6, 8, 10, 12, 16, Infinity],
  nearBonus: [0, 0.25, 0.5, 0.75, 1, 1.5],
  nearDecay: [0.25, 0.35, 0.5, 0.65, 0.8],
  floor: [0.001, 0.01, 0.03, 0.1, 0.3, 1],
  dnfPrior: [1, 2, 4, 8, 16],
};
const windowOf = (res, p) => p.window === Infinity || res.length <= p.window ? res : res.slice(-p.window);
// Weight for finishing at `place`: the same formula as F1RaceModel.placeWeight, with the numbers as parameters.
export function placeWeight(res, place, p) {
  let w = p.floor;
  for (const f of res) { if (f == null) continue; w += f <= place ? 1 : p.nearBonus * Math.pow(p.nearDecay, f - place - 1); }
  return w;
}
export const dnfRate = (res, gridRate, p) => { const k = res.filter(f => f == null).length; return (k + p.dnfPrior * gridRate) / (res.length + p.dnfPrior); };

// ---- Data ----
const seasons = {};
export function season(year) {
  if (!seasons[year]) seasons[year] = JSON.parse(fs.readFileSync(path.join(DATA, `${year}.json`), 'utf8'));
  return seasons[year];
}
const isFinish = r => Number.isFinite(r.position) && r.position >= 1;
// A round's rows with each driver once: the 2024 file has Pérez twice in round 24, and a driver can start a race only once.
const rowsOf = rs => { const seen = new Set(); return (rs || []).filter(x => !seen.has(x.driverId) && seen.add(x.driverId)); };
const table = (tbl, pos) => pos >= 1 && pos <= tbl.length ? tbl[pos - 1] : 0;

// Every Grand Prix from round 2 on, with what a model may see before it: each racing driver's earlier starts
// (classified position, or null for a DNF), the grid's DNF rate so far, and the real result.
export function raceCases(year) {
  const rounds = season(year).rounds, hist = {}, cases = [];
  let starts = 0, dnfs = 0;
  for (const r of rounds) {
    const rows = rowsOf(r.raceResults), racers = rows.map(x => x.driverId);
    if (r.round >= 2 && racers.length) {
      const classified = rows.filter(isFinish).sort((a, b) => a.position - b.position);
      cases.push({ year, round: r.round, racers, hist: racers.map(id => (hist[id] || []).slice()), gridRate: starts ? dnfs / starts : 0,
                   order: classified.map(x => racers.indexOf(x.driverId)), dnf: new Set(rows.filter(x => !isFinish(x)).map(x => racers.indexOf(x.driverId))) });
    }
    for (const x of rows) { (hist[x.driverId] = hist[x.driverId] || []).push(isFinish(x) ? x.position : null); starts++; if (!isFinish(x)) dnfs++; }
  }
  return cases;
}

// ---- Race level ----
// The log-probability a model gives the real result. The model retires each driver at their DNF chance, then draws the
// finishers place by place with the place's weights; both parts have exact probabilities, so there is nothing to simulate.
const clamp = x => Math.min(1 - 1e-9, Math.max(1e-9, x));
export function raceLogLik(c, p) {
  let ll = 0;
  const res = c.hist.map(h => windowOf(h, p));
  res.forEach((r, i) => { const q = clamp(dnfRate(r, c.gridRate, p)); ll += Math.log(c.dnf.has(i) ? q : 1 - q); });
  const m = c.order.length;
  for (let s = 0; s < m; s++) {
    let den = 0, num = 0;
    for (let x = s; x < m; x++) { const w = placeWeight(res[c.order[x]], s + 1, p); den += w; if (x === s) num = w; }
    ll += Math.log(num / den);
  }
  return ll;
}
// The same race with no information: finishers in a random order, everyone retiring at the grid's rate.
export function uniformLogLik(c) {
  const q = clamp(c.gridRate), m = c.order.length;
  let ll = c.racers.length - m ? (c.racers.length - m) * Math.log(q) : 0;
  ll += m * Math.log(1 - q);
  for (let s = 0; s < m; s++) ll -= Math.log(m - s);
  return ll;
}
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// Mean log-probability per race, by season (rounds 4+ and rounds 2–3 apart).
export function scoreRaces(allCases, p) {
  const out = {};
  for (const [year, cs] of Object.entries(allCases)) {
    const late = cs.filter(c => c.round >= 4), early = cs.filter(c => c.round < 4);
    out[year] = { late: late.map(c => raceLogLik(c, p)), early: early.map(c => raceLogLik(c, p)), uniform: late.map(uniformLogLik) };
  }
  return out;
}
const lateMean = (scores, years) => mean(years.flatMap(y => scores[y].late));

// ---- Tuning ----
// Coordinate descent: try each number's grid with the others fixed, keep the best, repeat until nothing improves.
export function tune(allCases, years, start = DEFAULT) {
  let best = { ...start }, bestScore = lateMean(scoreRaces(pick(allCases, years), best), years);
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const key of Object.keys(GRID)) for (const v of GRID[key]) {
      if (v === best[key]) continue;
      const cand = { ...best, [key]: v }, sc = lateMean(scoreRaces(pick(allCases, years), cand), years);
      if (sc > bestScore + 1e-9) { best = cand; bestScore = sc; improved = true; }
    }
    if (!improved) break;
  }
  return { params: best, score: bestScore };
}
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

// Paired comparison of two models over the same races: the mean difference per race, its standard error across
// seasons (seasons are the unit, since races in a season are not independent) and in how many seasons B beats A.
export function compare(a, b, years) {
  const diffs = years.map(y => mean(b[y].late) - mean(a[y].late));
  return { meanDiff: mean(diffs), se: sd(diffs) / Math.sqrt(years.length), seasonsBetter: diffs.filter(d => d > 0).length, seasons: years.length, perSeason: diffs };
}

// ---- Season level ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Everything known after round L: each driver's points, starts and finishes, and the rounds left.
export function snapshot(year, L) {
  const s = season(year), sc = F1Common.scoring(year), upto = s.rounds.filter(r => r.round <= L);
  const d = {}, order = [];
  const get = (x) => d[x.driverId] || (order.push(x.driverId), d[x.driverId] = { driverId: x.driverId, now: 0, gp: [], gpPts: [], spPts: [], finishes: [], active: false });
  for (const r of upto) {
    for (const x of rowsOf(r.raceResults)) { const q = get(x); q.gp.push(isFinish(x) ? x.position : null); q.gpPts.push(isFinish(x) ? table(sc.gp, x.position) : 0); q.now += q.gpPts.at(-1);
      if (isFinish(x)) q.finishes[x.position - 1] = (q.finishes[x.position - 1] || 0) + 1; if (r.round === L) q.active = true; }
    for (const x of rowsOf(r.sprintResults)) { const q = get(x); const v = isFinish(x) ? table(sc.sprint, x.position) : 0; q.spPts.push(v); q.now += v; }
  }
  const rank = F1Common.standingsRank(upto, L, 'drivers');
  const events = [];
  for (let r = L + 1; r <= s.calendar.totalRounds; r++) { events.push({ round: r, type: 'gp' }); if ((s.calendar.sprintRounds || []).includes(r)) events.push({ round: r, type: 'sprint' }); }
  let starts = 0, dnfs = 0; Object.values(d).forEach(q => q.gp.forEach(f => { starts++; if (f == null) dnfs++; }));
  return { year, L, sc, roster: order.map(id => ({ ...d[id], rank: rank[id] })), events, gridRate: starts ? dnfs / starts : 0 };
}
// The final standings, as the model scores them (points) and as awarded (rank, the real champion).
export function finalOutcome(year) {
  const s = season(year), total = s.rounds.length, snap = snapshot(year, total);
  const rank = F1Common.standingsRank(s.rounds, total, 'drivers');
  return { points: Object.fromEntries(snap.roster.map(q => [q.driverId, q.now])), rank };
}

// The Simulator's context for a model at that point (what buildSimContext makes with no wins, DNFs or collisions set).
export function simContext(snap, p) {
  const { roster, events, sc } = snap, n = roster.length, E = events.length;
  const W = new Float64Array(n * n), dnf = new Float64Array(n), fin0 = new Int16Array(n * n);
  roster.forEach((q, i) => {
    const res = windowOf(q.gp, p); dnf[i] = dnfRate(res, snap.gridRate, p);
    for (let s = 0; s < n; s++) W[i * n + s] = placeWeight(res, s + 1, p);
    q.finishes.forEach((c, pos) => { if (c && pos < n) fin0[i * n + pos] = c; });
  });
  const nowPts = roster.map(q => q.now), dec = F1RaceModel.decidedContext(events, snap.L, sc.gp, sc.sprint);
  return { roster, n, E, events, isGp: events.map(e => e.type === 'gp'), gpIdx: events.map((e, i) => e.type === 'gp' ? i : -1).filter(i => i >= 0),
           wins: roster.map(() => null), dnfs: roster.map(() => null), cols: [], W, dnfRate: dnf, active: roster.map(q => q.active), fin0,
           rank: roster.map(q => q.rank), winDrivers: [], nowPts, forcedWinner: roster.map(() => false), dec,
           decidedNow: F1RaceModel.titleSettled(nowPts, n, dec.room0) ? snap.L : 0,
           scratch: new Int16Array(Math.max(E, n)), alive: new Int16Array(n), wts: new Float64Array(n) };
}
// Simulates `runs` seasons: each driver's mean final points and how often they finish at each championship rank.
export function projectSeason(snap, p, runs, seed) {
  const ctx = simContext(snap, p), n = ctx.n, rand = mulberry32(seed), t = new Float64Array(n), rankCounts = new Int32Array(n * n), standing = new Array(n);
  for (let s = 0; s < runs; s++) {
    const sim = F1RaceModel.simulateSeason(ctx, rand, snap.sc.gp, snap.sc.sprint, false), tot = sim.totals;
    for (let i = 0; i < n; i++) { standing[i] = i; t[i] += tot[i]; }
    standing.sort((a, b) => tot[b] - tot[a] || F1RaceModel.countback(sim.fin, n, a, b) || ctx.rank[a] - ctx.rank[b]);
    for (let r = 0; r < n; r++) rankCounts[standing[r] * n + r]++;
  }
  const pRank = i => { let c = 0; return k => { c = 0; for (let r = 0; r < k; r++) c += rankCounts[i * n + r]; return c / runs; }; };
  return snap.roster.map((q, i) => ({ driverId: q.driverId, mean: t[i] / runs, p1: pRank(i)(1), p3: pRank(i)(3), p10: pRank(i)(10) }));
}
// Simple projections to compare against: the points so far (`standings`), or points so far plus the average of the
// driver's last N Grand Prix scores for each Grand Prix left and their sprint average for each sprint left.
export function paceProjection(snap, last) {
  const gpLeft = snap.events.filter(e => e.type === 'gp').length, spLeft = snap.events.length - gpLeft;
  return snap.roster.map(q => {
    if (!q.active || last === 0) return { driverId: q.driverId, mean: q.now };
    const g = last === Infinity ? q.gpPts : q.gpPts.slice(-last);
    return { driverId: q.driverId, mean: q.now + mean(g) * gpLeft + mean(q.spPts) * spLeft };
  });
}
// Score one projection against the final standings: the average miss on the real final top 10's points, the rank
// correlation of projected and real points over the whole roster, and for models with probabilities the log score of
// the real champion and the Brier score for the title.
export function scoreProjection(pred, outcome) {
  const rows = pred.filter(r => r.driverId in outcome.points);
  const top10 = Object.keys(outcome.rank).filter(id => rows.some(r => r.driverId === id)).sort((a, b) => outcome.rank[a] - outcome.rank[b]).slice(0, 10);
  const byId = Object.fromEntries(rows.map(r => [r.driverId, r]));
  const miss = mean(top10.map(id => Math.abs(byId[id].mean - outcome.points[id])));
  const rk = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rk(rows.map(r => r.mean)), rb = rk(rows.map(r => outcome.points[r.driverId])), nn = rows.length;
  const spearman = 1 - 6 * ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0) / (nn * (nn * nn - 1));
  const out = { miss, spearman };
  if (rows[0] && 'p1' in rows[0]) {
    const champ = top10[0];
    out.champLog = -Math.log(Math.max(byId[champ].p1, 1e-4));
    out.brier = rows.reduce((s, r) => s + (r.p1 - (r.driverId === champ ? 1 : 0)) ** 2, 0);
  }
  return out;
}
const bucketOf = p => Math.min(9, Math.floor(p * 10));

// Season-level report over `years`: every cut point from round 4 to the second-last round.
export function seasonReport(years, p, runs) {
  const names = ['model', 'standings', 'last 5 avg', 'season avg'], acc = Object.fromEntries(names.map(n => [n, { early: [], mid: [], late: [] }]));
  const calib = { title: Array.from({ length: 10 }, () => [0, 0, 0]), top3: Array.from({ length: 10 }, () => [0, 0, 0]), top10: Array.from({ length: 10 }, () => [0, 0, 0]) };
  for (const year of years) {
    const out = finalOutcome(year), total = season(year).rounds.length;
    for (let L = 4; L < total; L++) {
      const snap = snapshot(year, L), third = (L - 4) / Math.max(1, total - 5) < 1 / 3 ? 'early' : (L - 4) / Math.max(1, total - 5) < 2 / 3 ? 'mid' : 'late';
      const preds = { model: projectSeason(snap, p, runs, year * 100 + L), standings: paceProjection(snap, 0), 'last 5 avg': paceProjection(snap, 5), 'season avg': paceProjection(snap, Infinity) };
      for (const n of names) acc[n][third].push(scoreProjection(preds[n], out));
      for (const r of preds.model) {
        if (!(r.driverId in out.rank)) continue;
        const k = out.rank[r.driverId] + 1;
        for (const [key, pr, hit] of [['title', r.p1, k === 1], ['top3', r.p3, k <= 3], ['top10', r.p10, k <= 10]]) { const b = calib[key][bucketOf(pr)]; b[0]++; b[1] += pr; b[2] += hit ? 1 : 0; }
      }
    }
  }
  const summary = {};
  for (const n of names) for (const part of ['early', 'mid', 'late']) {
    const rs = acc[n][part];
    summary[`${n} / ${part}`] = { cuts: rs.length, miss: mean(rs.map(r => r.miss)), spearman: mean(rs.map(r => r.spearman)), champLog: rs[0] && 'champLog' in rs[0] ? mean(rs.map(r => r.champLog)) : null, brier: rs[0] && 'brier' in rs[0] ? mean(rs.map(r => r.brier)) : null };
  }
  const calibration = Object.fromEntries(Object.entries(calib).map(([k, bs]) => [k, bs.map(([n, ps, hs], i) => ({ bin: `${i * 10}–${i * 10 + 10}%`, n, predicted: n ? ps / n : null, observed: n ? hs / n : null }))]));
  return { summary, calibration };
}

// ---- Command line ----
const f = (x, d = 3) => x == null ? '–' : x.toFixed(d);
function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : dflt; }
async function main() {
  const cmd = process.argv[2], from = arg('from', 2014), to = arg('to', 2025), holdout = arg('holdout', 2024), runs = arg('runs', 2000), json = process.argv.includes('--json');
  const years = []; for (let y = from; y <= to; y++) years.push(y);
  const out = {};
  if (cmd === 'race' || cmd === 'tune') {
    const cases = Object.fromEntries(years.map(y => [y, raceCases(y)]));
    const base = scoreRaces(cases, DEFAULT);
    out.race = { params: DEFAULT, logLikPerRace: lateMean(base, years), uniform: lateMean(Object.fromEntries(years.map(y => [y, { late: base[y].uniform }])), years),
                 early: mean(years.flatMap(y => base[y].early)), perSeason: Object.fromEntries(years.map(y => [y, mean(base[y].late)])) };
    if (cmd === 'tune') {
      const pool = years.filter(y => y < holdout), hold = years.filter(y => y >= holdout);
      // leave-one-season-out inside the pool: tune on the other seasons, score the one left out
      const cvA = {}, cvB = {}, folds = [];
      for (const y of pool) {
        const t = tune(cases, pool.filter(x => x !== y)), s = scoreRaces(pick(cases, [y]), t.params);
        cvA[y] = base[y]; cvB[y] = s[y]; folds.push({ heldOut: y, params: t.params });
      }
      out.cv = { ...compare(cvA, cvB, pool), folds };
      const final = tune(cases, pool), fin = scoreRaces(pick(cases, hold), final.params);
      out.holdout = { params: final.params, ...compare(pick(base, hold), fin, hold), baseline: lateMean(base, hold), tuned: lateMean(fin, hold) };
    }
  } else if (cmd === 'season') {
    out.season = seasonReport(years, DEFAULT, runs);
  } else {
    console.error('usage: node tools/backtest.mjs race|season|tune [--from Y] [--to Y] [--holdout Y] [--runs N] [--json]'); process.exit(2);
  }
  if (json) { console.log(JSON.stringify(out, (k, v) => v === Infinity ? 'Infinity' : v, 1)); return; }
  if (out.race) {
    const r = out.race;
    console.log(`Race level, ${from}–${to}, rounds 4+: mean log-probability of the real result per race`);
    console.log(`  model ${f(r.logLikPerRace)}   no information ${f(r.uniform)}   (rounds 2–3: ${f(r.early)})`);
    console.log('  by season: ' + Object.entries(r.perSeason).map(([y, v]) => `${y} ${f(v, 2)}`).join('  '));
  }
  if (out.cv) {
    console.log(`\nLeave-one-season-out over ${from}–${holdout - 1}: tuned minus current model, per race`);
    console.log(`  ${f(out.cv.meanDiff, 4)} ± ${f(out.cv.se, 4)} (se across seasons); tuned better in ${out.cv.seasonsBetter} of ${out.cv.seasons} seasons`);
    const keys = Object.keys(DEFAULT);
    for (const k of keys) console.log(`  ${k}: ` + out.cv.folds.map(x => x.params[k]).join(' '));
    console.log(`\nHoldout ${holdout}–${to} (tuned on ${from}–${holdout - 1}): current ${f(out.holdout.baseline)} tuned ${f(out.holdout.tuned)} difference ${f(out.holdout.meanDiff, 4)} ± ${f(out.holdout.se, 4)}`);
    console.log('  tuned parameters: ' + JSON.stringify(out.holdout.params, (k, v) => v === Infinity ? 'Infinity' : v));
  }
  if (out.season) {
    console.log(`Season level, ${from}–${to}, cut points from round 4 (${runs} runs each): average miss on the real final top 10's points (lower is better)`);
    console.log('  ' + 'projection / part of season'.padEnd(28) + 'cuts   miss  spearman  champLog  brier');
    for (const [k, v] of Object.entries(out.season.summary)) console.log('  ' + k.padEnd(28) + String(v.cuts).padStart(4) + f(v.miss, 1).padStart(7) + f(v.spearman, 2).padStart(9) + f(v.champLog, 2).padStart(10) + f(v.brier, 2).padStart(7));
    for (const [k, bs] of Object.entries(out.season.calibration)) {
      console.log(`\nCalibration, ${k}: predicted vs observed`);
      for (const b of bs.filter(x => x.n)) console.log(`  ${b.bin.padEnd(9)} n=${String(b.n).padStart(5)}  predicted ${f(b.predicted, 3)}  observed ${f(b.observed, 3)}`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
