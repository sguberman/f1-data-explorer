// #155: the backtest script (tools/backtest.mjs). Its parameterised model equals the site's at the default numbers,
// its exact race probability matches what the engine's own sampling gives, nothing after a race leaks into the
// model scored on it, and the season-level pieces hold together on a real season file. Plain Node, no browser.
module.exports = async (t, h) => {
  const B = await import('../tools/backtest.mjs');
  const M = require('../site/racemodel.js');
  const rng = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

  // ---- The parameterised model at the default numbers is the site's model ----
  let same = true;
  for (let k = 0; k < 300; k++) {
    const res = Array.from({ length: 1 + Math.floor(rng() * 12) }, () => rng() < 0.15 ? null : 1 + Math.floor(rng() * 20));
    const place = 1 + Math.floor(rng() * 20), grid = rng() * 0.2;
    if (Math.abs(B.placeWeight(res, place, B.DEFAULT) - M.placeWeight(res, place)) > 1e-12 || Math.abs(B.dnfRate(res, grid, B.DEFAULT) - M.dnfRate(res, grid)) > 1e-12) same = false;
  }
  t.check('default numbers: weights and DNF chance equal the site model', same);

  // ---- The exact probability of a result equals how often the engine's own draw produces it ----
  // 4 racers, driver 3 has a high DNF chance; the result under test: 3 retires and 1, 0, 2 finish in that order.
  const hist = [[1, 2, 1], [3, 1, 2], [2, 4, null], [5, null, 6]];
  const c = { year: 0, round: 9, racers: ['a', 'b', 'c', 'd'], hist, gridRate: 0.1, order: [1, 0, 2], dnf: new Set([3]) };
  const exact = Math.exp(B.raceLogLik(c, B.DEFAULT));
  const n = 4, W = new Float64Array(n * n), rate = hist.map(r => M.dnfRate(r, c.gridRate));
  hist.forEach((r, i) => { for (let s = 0; s < n; s++) W[i * n + s] = M.placeWeight(r, s + 1); });
  const ctx = { W, n, wts: new Float64Array(n) }, rand = (() => { let a = 99; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
  const RUNS = 400000; let hits = 0;
  for (let r = 0; r < RUNS; r++) {
    const alive = new Int16Array(n); let len = 0, ok = true;
    for (let i = 0; i < n; i++) { const out = rand() < rate[i]; if (out !== (i === 3)) ok = false; if (!out) alive[len++] = i; }
    if (!ok) continue;
    const o = M.sampleOrder(ctx, rand, alive, len, 0, null, null, [], null);
    if (o.join() === '1,0,2') hits++;
  }
  const se = Math.sqrt(exact * (1 - exact) / RUNS);
  t.check('exact result probability matches the engine sampling it', Math.abs(hits / RUNS - exact) < 4 * se, `exact ${exact.toFixed(5)} sampled ${(hits / RUNS).toFixed(5)} (±${se.toFixed(5)})`);

  // ---- Walk-forward: the model for a race sees only earlier races ----
  const cases = B.raceCases(2024), r5 = cases.find(x => x.round === 5), rounds = B.season(2024).rounds;
  const starts = id => rounds.filter(r => r.round < 5 && r.raceResults.some(x => x.driverId === id)).length;
  t.check('race 5: each driver\'s history is their starts in rounds 1–4', r5.racers.every((id, i) => r5.hist[i].length === starts(id)));
  const dnfs4 = rounds.slice(0, 4).flatMap(r => r.raceResults).filter(x => !(Number.isFinite(x.position) && x.position >= 1)).length;
  t.check('race 5: the grid DNF rate counts rounds 1–4 only', Math.abs(r5.gridRate - dnfs4 / rounds.slice(0, 4).flatMap(r => r.raceResults).length) < 1e-12);
  t.check('every race has an order and DNF set covering the field', cases.every(x => x.order.length + x.dnf.size === x.racers.length));

  // ---- Season level on a real season file ----
  const snap = B.snapshot(2024, 12), out = B.finalOutcome(2024);
  t.check('2024 final standings: Verstappen champion', Object.keys(out.rank).find(id => out.rank[id] === 0) === 'max_verstappen');
  t.check('snapshot at round 12: events left are the rest of the calendar', snap.events.filter(e => e.type === 'gp').length === 12 && snap.events.some(e => e.type === 'sprint'));
  const proj = B.projectSeason(snap, B.DEFAULT, 300, 1), byNow = Object.fromEntries(snap.roster.map(q => [q.driverId, q.now]));
  t.check('projection: everyone ends at least where they are now', proj.every(r => r.mean >= byNow[r.driverId] - 1e-9));
  t.check('projection: title probabilities add to 1', Math.abs(proj.reduce((s, r) => s + r.p1, 0) - 1) < 1e-9);
  t.check('same seed, same projection', JSON.stringify(proj) === JSON.stringify(B.projectSeason(snap, B.DEFAULT, 300, 1)));
  const sc = B.scoreProjection(B.paceProjection(snap, 0), out);
  t.check('standings-as-is projection scores a finite miss and rank correlation', Number.isFinite(sc.miss) && sc.spearman > 0.8 && sc.spearman <= 1, JSON.stringify(sc));

  // ---- Tuning never makes its own training score worse ----
  const some = { 2023: B.raceCases(2023), 2024: B.raceCases(2024) }, before = B.scoreRaces(some, B.DEFAULT);
  const tuned = B.tune(some, [2023, 2024]), after = B.scoreRaces(some, tuned.params);
  const m = s => [2023, 2024].flatMap(y => s[y].late).reduce((a, b, _, arr) => a + b / arr.length, 0);
  t.check('tuning does not lower the training score', m(after) >= m(before) - 1e-9, `${m(before)} → ${m(after)}`);
};
