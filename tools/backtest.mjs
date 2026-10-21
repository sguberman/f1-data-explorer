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
// A model is a set of numbers. DEFAULT is the Simulator as it is now (#162: the constants in racemodel.js, and the page's default
// "Form from" of the whole season); PREVIOUS is the Simulator before #162.
// `beta` is team strength: a driver's weights include beta times the average of their teammates' (0 = off).
export const DEFAULT = { window: Infinity, nearBonus: F1RaceModel.NEAR_BONUS, nearDecay: F1RaceModel.NEAR_DECAY, floor: F1RaceModel.WEIGHT_FLOOR, dnfPrior: F1RaceModel.DNF_PRIOR_RACES, beta: F1RaceModel.TEAM_SHARE };
export const PREVIOUS = { window: 8, nearBonus: 0.5, nearDecay: 0.5, floor: 0.01, dnfPrior: 4, beta: 0 };
const GRID = { // what `tune` tries for each number
  window: [3, 4, 5, 6, 8, 10, 12, 16, Infinity],
  nearBonus: [0, 0.25, 0.5, 0.75, 1, 1.5],
  nearDecay: [0.25, 0.35, 0.5, 0.65, 0.8],
  floor: [0.001, 0.01, 0.03, 0.1, 0.3, 1],
  dnfPrior: [1, 2, 4, 8, 16, 32, 64],
  beta: [0, 0.25, 0.5, 1, 2],
};
// Named models for `--model`. `retuned` = the previous model with the window, floor and DNF smoothing refitted;
// `current` = the Simulator now (those refitted plus team strength), fitted on 2014–2023 (see docs/BACKTEST.md).
export const MODELS = {
  previous: PREVIOUS,
  retuned: { ...PREVIOUS, window: Infinity, floor: 0.1, dnfPrior: 64 },
  current: DEFAULT,
};
const windowOf = (res, p) => p.window === Infinity || res.length <= p.window ? res : res.slice(-p.window);
// Weight for finishing at `place`: the same formula as F1RaceModel.placeWeight, with the numbers as parameters.
export function placeWeight(res, place, p) {
  let w = p.floor;
  for (const f of res) { if (f == null) continue; w += f <= place ? 1 : p.nearBonus * Math.pow(p.nearDecay, f - place - 1); }
  return w;
}
// A driver's weight for a place: their own, plus `beta` times the average of their teammates' (so a driver with a thin
// record inherits the car's pace). `res` = every racer's windowed results, `mates[i]` = the indexes of i's teammates.
export function pooledWeight(res, i, mates, place, p) {
  let w = placeWeight(res[i], place, p);
  if (p.beta > 0 && mates[i].length) w += p.beta * mates[i].reduce((a, j) => a + placeWeight(res[j], place, p), 0) / mates[i].length;
  return w;
}
export const matesOf = teams => teams.map((t, i) => teams.map((u, j) => j !== i && u === t ? j : -1).filter(j => j >= 0));
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
      cases.push({ year, round: r.round, racers, team: rows.map(x => x.teamId), hist: racers.map(id => (hist[id] || []).slice()), gridRate: starts ? dnfs / starts : 0,
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
  const res = c.hist.map(h => windowOf(h, p)), mates = c.mates || (c.mates = matesOf(c.team || c.racers.map((_, i) => '-' + i)));
  res.forEach((r, i) => { const q = clamp(dnfRate(r, c.gridRate, p)); ll += Math.log(c.dnf.has(i) ? q : 1 - q); });
  const m = c.order.length;
  for (let s = 0; s < m; s++) {
    let den = 0, num = 0;
    for (let x = s; x < m; x++) { const w = pooledWeight(res, c.order[x], mates, s + 1, p); den += w; if (x === s) num = w; }
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
export function tune(allCases, years, start = PREVIOUS, keys = Object.keys(GRID).filter(k => k !== 'beta')) {
  let best = { ...start }, bestScore = lateMean(scoreRaces(pick(allCases, years), best), years);
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const key of keys) for (const v of GRID[key]) {
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
    for (const x of rowsOf(r.raceResults)) { const q = get(x); q.teamId = x.teamId; q.gp.push(isFinish(x) ? x.position : null); q.gpPts.push(isFinish(x) ? table(sc.gp, x.position) : 0); q.now += q.gpPts.at(-1);
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
  const res = roster.map(q => windowOf(q.gp, p)), mates = matesOf(roster.map((q, i) => q.active ? q.teamId : '-' + i)); // only drivers racing now are teammates
  roster.forEach((q, i) => {
    dnf[i] = dnfRate(res[i], snap.gridRate, p);
    for (let s = 0; s < n; s++) W[i * n + s] = pooledWeight(res, i, mates, s + 1, p);
    q.finishes.forEach((c, pos) => { if (c && pos < n) fin0[i * n + pos] = c; });
  });
  const nowPts = roster.map(q => q.now), dec = F1RaceModel.decidedContext(events, snap.L, sc.gp, sc.sprint);
  return { roster, n, E, events, isGp: events.map(e => e.type === 'gp'), gpIdx: events.map((e, i) => e.type === 'gp' ? i : -1).filter(i => i >= 0),
           wins: roster.map(() => null), dnfs: roster.map(() => null), cols: [], W, dnfRate: dnf, active: roster.map(q => q.active), fin0,
           rank: roster.map(q => q.rank), winDrivers: [], nowPts, forcedWinner: roster.map(() => false), dec,
           decidedNow: F1RaceModel.titleSettled(nowPts, n, dec.room0) ? snap.L : 0,
           scratch: new Int16Array(Math.max(E, n)), alive: new Int16Array(n), wts: new Float64Array(n) };
}
// Simulates `runs` seasons: each driver's mean final points and how often they finish at each championship rank, and
// the round the title was settled in each simulated season (sorted).
export function simulateProjection(snap, p, runs, seed) {
  const ctx = simContext(snap, p), n = ctx.n, rand = mulberry32(seed), t = new Float64Array(n), rankCounts = new Int32Array(n * n), standing = new Array(n), decided = new Uint16Array(runs);
  for (let s = 0; s < runs; s++) {
    const sim = F1RaceModel.simulateSeason(ctx, rand, snap.sc.gp, snap.sc.sprint, false), tot = sim.totals;
    decided[s] = sim.decided;
    for (let i = 0; i < n; i++) { standing[i] = i; t[i] += tot[i]; }
    standing.sort((a, b) => tot[b] - tot[a] || F1RaceModel.countback(sim.fin, n, a, b) || ctx.rank[a] - ctx.rank[b]);
    for (let r = 0; r < n; r++) rankCounts[standing[r] * n + r]++;
  }
  const pRank = (i, k) => { let c = 0; for (let r = 0; r < k; r++) c += rankCounts[i * n + r]; return c / runs; };
  return { rows: snap.roster.map((q, i) => ({ driverId: q.driverId, mean: t[i] / runs, p1: pRank(i, 1), p3: pRank(i, 3), p10: pRank(i, 10) })), decided: decided.sort() };
}
export const projectSeason = (snap, p, runs, seed) => simulateProjection(snap, p, runs, seed).rows;
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
// The round after which the real title was mathematically settled (the Simulator's own test: a win in every Grand Prix
// and sprint left, from the runner-up, would still not catch the leader); the last round if it never was before then.
const decidedRounds = {};
export function actualDecided(year) {
  if (decidedRounds[year] == null) {
    const total = season(year).rounds.length;
    let found = total;
    for (let r = 1; r < total; r++) {
      const s = snapshot(year, r), ctx = simContext(s, DEFAULT);
      if (F1RaceModel.titleSettled(ctx.nowPts, ctx.n, ctx.dec.room0)) { found = r; break; }
    }
    decidedRounds[year] = found;
  }
  return decidedRounds[year];
}
// Score one projection against the final standings:
//   miss      the average miss on the real final top 10's points
//   rankErr   the average error in championship position for the real top 10 (projected order by projected points vs
//             the real final order, both among the drivers on the grid at the cut point)
// and for models with probabilities
//   champLog  the log score of the real champion (-ln of the probability given, floored at 1e-4)
//   brier     the Brier score for the title (sum over drivers of (probability - 1 if champion)^2)
export function scoreProjection(pred, outcome) {
  const rows = pred.filter(r => r.driverId in outcome.points), byId = Object.fromEntries(rows.map(r => [r.driverId, r]));
  const real = rows.map(r => r.driverId).sort((a, b) => outcome.rank[a] - outcome.rank[b]), realPos = Object.fromEntries(real.map((id, i) => [id, i]));
  const projected = rows.slice().sort((a, b) => b.mean - a.mean), projPos = Object.fromEntries(projected.map((r, i) => [r.driverId, i]));
  const top10 = real.slice(0, 10);
  const out = { miss: mean(top10.map(id => Math.abs(byId[id].mean - outcome.points[id]))), rankErr: mean(top10.map(id => Math.abs(projPos[id] - realPos[id]))) };
  if (rows[0] && 'p1' in rows[0]) {
    const champ = real[0];
    out.champLog = -Math.log(Math.max(byId[champ].p1, 1e-4));
    out.brier = rows.reduce((s, r) => s + (r.p1 - (r.driverId === champ ? 1 : 0)) ** 2, 0);
  }
  return out;
}
const bucketOf = p => Math.min(9, Math.floor(p * 10));
export const MEASURES = ['miss', 'rankErr', 'champLog', 'brier', 'clinchErr'];

// Season-level study over `years`: every cut point from round 4 to the second-last round, for each named model and for
// plain baselines. clinchErr = how many rounds the median predicted settling round is off the real one, counted only
// at cut points before the title was settled; the baseline "last round" assumes it is settled in the final round.
export function seasonCompare(years, names, runs) {
  const all = [...names, 'standings', 'last 5 avg', 'season avg', 'last round'], rec = Object.fromEntries(all.map(n => [n, []]));
  const calib = Object.fromEntries(names.map(n => [n, { title: Array.from({ length: 10 }, () => [0, 0, 0]), top3: Array.from({ length: 10 }, () => [0, 0, 0]), top10: Array.from({ length: 10 }, () => [0, 0, 0]) }]));
  for (const year of years) {
    const out = finalOutcome(year), total = season(year).rounds.length, dec = actualDecided(year);
    for (let L = 4; L < total; L++) {
      const snap = snapshot(year, L), x = (L - 4) / Math.max(1, total - 5), part = x < 1 / 3 ? 'early' : x < 2 / 3 ? 'mid' : 'late';
      for (const n of names) {
        const { rows, decided } = simulateProjection(snap, MODELS[n], runs, year * 100 + L), r = { year, L, part, ...scoreProjection(rows, out) };
        if (L < dec) r.clinchErr = Math.abs(decided[runs >> 1] - dec);
        rec[n].push(r);
        for (const q of rows) {
          if (!(q.driverId in out.rank)) continue;
          const k = out.rank[q.driverId] + 1;
          for (const [key, pr, hit] of [['title', q.p1, k === 1], ['top3', q.p3, k <= 3], ['top10', q.p10, k <= 10]]) { const b = calib[n][key][bucketOf(pr)]; b[0]++; b[1] += pr; b[2] += hit ? 1 : 0; }
        }
      }
      for (const [n, pred] of [['standings', paceProjection(snap, 0)], ['last 5 avg', paceProjection(snap, 5)], ['season avg', paceProjection(snap, Infinity)]]) rec[n].push({ year, L, part, ...scoreProjection(pred, out) });
      rec['last round'].push({ year, L, part, ...(L < dec ? { clinchErr: total - dec } : {}) });
    }
  }
  // per season mean of a measure (seasons with none are left out), then the mean over seasons; and by part of season
  const perSeason = (n, m) => Object.fromEntries(years.map(y => [y, rec[n].filter(r => r.year === y && r[m] != null).map(r => r[m])]).filter(([, v]) => v.length).map(([y, v]) => [y, mean(v)]));
  const summary = {};
  for (const n of all) {
    summary[n] = {};
    for (const m of MEASURES) {
      const ps = perSeason(n, m), vals = Object.values(ps);
      if (!vals.length) continue;
      summary[n][m] = { all: mean(vals), early: mean(rec[n].filter(r => r.part === 'early' && r[m] != null).map(r => r[m])), mid: mean(rec[n].filter(r => r.part === 'mid' && r[m] != null).map(r => r[m])), late: mean(rec[n].filter(r => r.part === 'late' && r[m] != null).map(r => r[m])), perSeason: ps };
    }
  }
  // paired against the first model: per-season difference (lower is better for every measure)
  const paired = {};
  for (const n of names.slice(1)) {
    paired[n] = {};
    for (const m of MEASURES) {
      const a = summary[names[0]][m], b = summary[n][m];
      if (!a || !b) continue;
      const ys = Object.keys(a.perSeason).filter(y => y in b.perSeason), d = ys.map(y => b.perSeason[y] - a.perSeason[y]);
      paired[n][m] = { diff: mean(d), se: sd(d) / Math.sqrt(d.length), better: d.filter(x => x < 0).length, seasons: d.length };
    }
  }
  const calibration = Object.fromEntries(names.map(n => [n, Object.fromEntries(Object.entries(calib[n]).map(([k, bs]) => [k, bs.map(([c, ps, hs], i) => ({ bin: `${i * 10}–${i * 10 + 10}%`, n: c, predicted: c ? ps / c : null, observed: c ? hs / c : null }))]))]));
  return { names, summary, paired, calibration };
}

// ---- Command line ----
const f = (x, d = 3) => x == null ? '–' : x.toFixed(d);
const J = (k, v) => v === Infinity ? 'Infinity' : v;
function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : dflt; }
function modelsArg() { const i = process.argv.indexOf('--model'), names = i > 0 ? process.argv[i + 1].split(',') : ['current']; for (const n of names) if (!MODELS[n]) { console.error(`unknown model "${n}"; models: ${Object.keys(MODELS).join(', ')}`); process.exit(2); } return names; }
async function main() {
  const cmd = process.argv[2], from = arg('from', 2014), to = arg('to', 2025), holdout = arg('holdout', 2024), runs = arg('runs', 2000), json = process.argv.includes('--json');
  const years = []; for (let y = from; y <= to; y++) years.push(y);
  const out = {};
  if (cmd === 'race') {
    const names = modelsArg(), cases = Object.fromEntries(years.map(y => [y, raceCases(y)])), sc = Object.fromEntries(names.map(n => [n, scoreRaces(cases, MODELS[n])]));
    out.race = { names, uniform: lateMean(Object.fromEntries(years.map(y => [y, { late: sc[names[0]][y].uniform }])), years),
      models: Object.fromEntries(names.map(n => [n, { params: MODELS[n], logLikPerRace: lateMean(sc[n], years), early: mean(years.flatMap(y => sc[n][y].early)), perSeason: Object.fromEntries(years.map(y => [y, mean(sc[n][y].late)])) }])),
      paired: Object.fromEntries(names.slice(1).map(n => [n, compare(sc[names[0]], sc[n], years)])) };
  } else if (cmd === 'tune') {
    // Three variants: the previous numbers, the numbers refitted (window, floor, DNF smoothing, near bonus) and refitted
    // with team strength. Each is fitted leave-one-season-out inside the pool, then on the whole pool and scored once on the holdout.
    const cases = Object.fromEntries(years.map(y => [y, raceCases(y)])), pool = years.filter(y => y < holdout), hold = years.filter(y => y >= holdout);
    const keys = { retuned: Object.keys(GRID).filter(k => k !== 'beta'), team: Object.keys(GRID) };
    const base = scoreRaces(cases, PREVIOUS), cv = {}, folds = {}, fin = {};
    for (const v of Object.keys(keys)) {
      cv[v] = {}; folds[v] = [];
      for (const y of pool) { const t = tune(cases, pool.filter(x => x !== y), PREVIOUS, keys[v]); cv[v][y] = scoreRaces(pick(cases, [y]), t.params)[y]; folds[v].push({ heldOut: y, params: t.params }); }
      const final = tune(cases, pool, PREVIOUS, keys[v]);
      fin[v] = { params: final.params, scores: scoreRaces(pick(cases, hold), final.params) };
    }
    const holdBase = pick(base, hold);
    out.tune = { pool, hold, baseline: { cv: lateMean(base, pool), holdout: lateMean(base, hold) },
      retuned: { ...compare(Object.fromEntries(pool.map(y => [y, base[y]])), cv.retuned, pool), holdout: compare(holdBase, fin.retuned.scores, hold), params: fin.retuned.params, folds: folds.retuned },
      team: { ...compare(Object.fromEntries(pool.map(y => [y, base[y]])), cv.team, pool), holdout: compare(holdBase, fin.team.scores, hold), params: fin.team.params, folds: folds.team },
      teamOverRetuned: { ...compare(cv.retuned, cv.team, pool), holdout: compare(fin.retuned.scores, fin.team.scores, hold) } };
  } else if (cmd === 'season') {
    out.season = seasonCompare(years, modelsArg(), runs);
  } else {
    console.error('usage: node tools/backtest.mjs race|season|tune [--model previous,retuned,current] [--from Y] [--to Y] [--holdout Y] [--runs N] [--calibration] [--json]'); process.exit(2);
  }
  if (json) { console.log(JSON.stringify(out, J, 1)); return; }
  if (out.race) {
    const r = out.race;
    console.log(`Race level, ${from}–${to}, rounds 4+: mean log-probability of the real result per race (no information: ${f(r.uniform)})`);
    for (const n of r.names) console.log(`  ${n.padEnd(9)} ${f(r.models[n].logLikPerRace)}   rounds 2–3: ${f(r.models[n].early)}`);
    for (const [n, c] of Object.entries(r.paired)) console.log(`  ${n} minus ${r.names[0]}: ${f(c.meanDiff, 3)} ± ${f(c.se, 3)} per race, better in ${c.seasonsBetter} of ${c.seasons} seasons`);
  }
  if (out.tune) {
    const t = out.tune, line = (name, c) => console.log(`  ${name.padEnd(26)} cross-validated ${f(c.meanDiff, 3)} ± ${f(c.se, 3)} (better in ${c.seasonsBetter} of ${c.seasons} seasons)   holdout ${f(c.holdout.meanDiff, 3)} ± ${f(c.holdout.se, 3)}`);
    console.log(`Race level, fitted on ${from}–${holdout - 1} (leave-one-season-out), holdout ${holdout}–${to}: gain in log-probability per race`);
    line('refitted vs previous', t.retuned); line('with team strength vs previous', t.team); line('team strength vs refitted', t.teamOverRetuned);
    console.log('  refitted numbers:     ' + JSON.stringify(t.retuned.params, J));
    console.log('  with team strength:   ' + JSON.stringify(t.team.params, J));
  }
  if (out.season) {
    const s = out.season, label = { miss: 'points miss', rankErr: 'order error (places)', champLog: 'champion log score', brier: 'title Brier', clinchErr: 'clinch round miss' };
    console.log(`Season level, ${from}–${to}, cut points from round 4 (${runs} runs each); lower is better. all = mean of the per-season means; early / mid / late = thirds of the season`);
    for (const m of MEASURES) {
      console.log(`\n${label[m]}`);
      for (const n of Object.keys(s.summary)) { const v = s.summary[n][m]; if (v) console.log(`  ${n.padEnd(11)} all ${f(v.all, 2).padStart(6)}   early ${f(v.early, 2).padStart(6)}  mid ${f(v.mid, 2).padStart(6)}  late ${f(v.late, 2).padStart(6)}`); }
      for (const n of s.names.slice(1)) { const c = s.paired[n][m]; if (c) console.log(`  ${n} minus ${s.names[0]}: ${f(c.diff, 2)} ± ${f(c.se, 2)} (lower in ${c.better} of ${c.seasons} seasons)`); }
    }
    if (process.argv.includes('--calibration')) for (const n of s.names) for (const [k, bs] of Object.entries(s.calibration[n])) {
      console.log(`\nCalibration, ${n}, ${k}: predicted vs observed`);
      for (const b of bs.filter(x => x.n)) console.log(`  ${b.bin.padEnd(9)} n=${String(b.n).padStart(5)}  predicted ${f(b.predicted, 3)}  observed ${f(b.observed, 3)}`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
