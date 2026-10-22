// #179 (Simulator stage 6): is the error in the simulated title-settling round bias, or the natural spread of when titles get decided?
//
//   node tools/clinch-diagnostic.mjs [--from 2014] [--to 2025] [--runs 1000] [--json]
//
// For every cut point from round 4 up to the real settling round it simulates the rest of the season with the Simulator's own model
// (`current`) and takes the median simulated settling round. Reported:
//   signed error   simulated median minus real settling round, by part of the season and by season
//   coverage       how often the real round lies inside the simulated 10–90% band (nominal 80%)
//   predictability can the error be predicted from what is known at the cut point? Features: the leader's lead over second place as a
//                  share of the points still available (1 = settled), the leader's share of wins so far, rounds left. Fitted
//                  leave-one-season-out; "gain" = mean absolute error before minus after subtracting the predicted error (> 0 = the error is a bias a
//                  model could remove; about 0 = natural spread).
// Walk-forward: the model sees only the races before the cut point.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { season, snapshot, simContext, simulateProjection, actualDecided, DEFAULT } from './backtest.mjs';

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// Ordinary least squares y ~ X (each row of X includes its own 1 for an intercept); returns the coefficients. Small systems only.
export function ols(X, y) {
  const k = X[0].length, A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  X.forEach((row, n) => { for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += row[i] * row[j]; A[i][k] += row[i] * y[n]; } });
  for (let i = 0; i < k; i++) A[i][i] += 1e-9; // tiny ridge: keeps a constant feature from singularity
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((row, i) => row[k] / row[i]);
}

export function cutPoints(years, runs) {
  const rows = [];
  for (const year of years) {
    const total = season(year).rounds.length, dec = actualDecided(year);
    for (let L = 4; L < dec && L < total; L++) {
      const snap = snapshot(year, L), ctx = simContext(snap, DEFAULT), { decided } = simulateProjection(snap, DEFAULT, runs, year * 100 + L);
      const q = p => decided[Math.floor(p * (decided.length - 1))], x = (L - 4) / Math.max(1, total - 5);
      const pts = snap.roster.map(r => r.now).sort((a, b) => b - a), leader = snap.roster.reduce((b, r) => (r.now > b.now ? r : b));
      rows.push({ year, L, total, dec, med: q(0.5), p10: q(0.1), p90: q(0.9), part: x < 1 / 3 ? 'early' : x < 2 / 3 ? 'mid' : 'late',
        lead: (pts[0] - pts[1]) / ctx.dec.room0, winShare: leader.finishes[0] ? leader.finishes[0] / L : 0, left: total - L });
    }
  }
  return rows;
}

export function diagnose(rows, years) {
  const err = r => r.med - r.dec, byPart = {}, bySeason = {};
  for (const part of ['early', 'mid', 'late']) {
    const r = rows.filter(x => x.part === part);
    byPart[part] = { n: r.length, signed: mean(r.map(err)), abs: mean(r.map(x => Math.abs(err(x)))), coverage: r.filter(x => x.dec >= x.p10 && x.dec <= x.p90).length / r.length, width: mean(r.map(x => x.p90 - x.p10)) };
  }
  for (const y of years) { const r = rows.filter(x => x.year === y); if (r.length) bySeason[y] = { signed: mean(r.map(err)), dec: r[0].dec, total: r[0].total }; }
  const feats = r => [1, r.lead, r.winShare, r.left / r.total], pred = {};
  let before = [], after = [];
  for (const y of years) {
    const train = rows.filter(r => r.year !== y), test = rows.filter(r => r.year === y);
    if (!test.length) continue;
    const b = ols(train.map(feats), train.map(err));
    for (const r of test) { const p = feats(r).reduce((s, v, i) => s + v * b[i], 0); before.push(Math.abs(err(r))); after.push(Math.abs(err(r) - p)); (pred[y] = pred[y] || []).push(Math.abs(err(r)) - Math.abs(err(r) - p)); }
  }
  const perSeasonGain = Object.values(pred).map(mean), all = ols(rows.map(feats), rows.map(err));
  return { cutPoints: rows.length, byPart, bySeason, coefficients: { intercept: all[0], lead: all[1], winShare: all[2], roundsLeftShare: all[3] },
    errorBefore: mean(before), errorAfter: mean(after), gain: mean(perSeasonGain), gainSe: sd(perSeasonGain) / Math.sqrt(perSeasonGain.length), seasonsBetter: perSeasonGain.filter(g => g > 0).length, seasons: perSeasonGain.length };
}

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : dflt; }
async function main() {
  const from = arg('from', 2014), to = arg('to', 2025), runs = arg('runs', 1000), years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const r = diagnose(cutPoints(years, runs), years);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return; }
  const f = (x, d = 2) => x.toFixed(d);
  console.log(`Clinch timing, ${from}–${to}: ${r.cutPoints} cut points before the title was settled (${runs} runs each)`);
  for (const [p, s] of Object.entries(r.byPart)) console.log(`  ${p.padEnd(6)} n ${String(s.n).padStart(3)}  signed error ${s.signed >= 0 ? '+' : ''}${f(s.signed)}  abs ${f(s.abs)}  real round inside the 10–90% band ${f(s.coverage)} (band ${f(s.width, 1)} rounds wide)`);
  console.log('  by season (mean signed error; real settling round / rounds): ' + Object.entries(r.bySeason).map(([y, s]) => `${y} ${s.signed >= 0 ? '+' : ''}${f(s.signed)} (${s.dec}/${s.total})`).join(', '));
  console.log(`  predictable from the lead, the leader's win share and the rounds left? mean abs error ${f(r.errorBefore)} → ${f(r.errorAfter)} after removing the predicted error (leave-one-season-out): gain ${f(r.gain, 3)} ± ${f(r.gainSe, 3)} rounds (better in ${r.seasonsBetter} of ${r.seasons} seasons)`);
  console.log('  fitted on all seasons: ' + JSON.stringify(Object.fromEntries(Object.entries(r.coefficients).map(([k, v]) => [k, +v.toFixed(2)]))));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
