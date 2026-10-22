// #173: the feature export for the LightGBM comparison (tools/export-features.mjs). Features use only earlier races, labels
// are the real result, and the Simulator's marginals are proper probabilities. Plain Node, no browser.
module.exports = async (t, h) => {
  const B = await import('../tools/backtest.mjs');
  const X = await import('../tools/export-features.mjs');

  const cases = B.raceCases(2024), rounds = B.season(2024).rounds, rows = X.featureRows(cases, 2000);
  const r6 = rows.filter(r => r.round === 6), cs = cases.find(c => c.round === 6);

  // ---- Labels ----
  const perRace = rows.reduce((m, r) => { const k = r.round; (m[k] = m[k] || { win: 0, podium: 0, points: 0 }); m[k].win += r.win; m[k].podium += r.podium; m[k].points += r.points; return m; }, {});
  t.check('every race has one winner, three podium places and ten points places', Object.values(perRace).every(x => x.win === 1 && x.podium === 3 && x.points === 10), JSON.stringify(Object.values(perRace).find(x => x.win !== 1 || x.podium !== 3 || x.points !== 10)));
  t.check('one row per racer per race, from round 2', rows.length === cases.reduce((s, c) => s + c.racers.length, 0) && rows.every(r => r.round >= 2));

  // ---- No leakage: features for round 6 come from rounds 1–5 only ----
  const before = id => rounds.filter(r => r.round < 6).flatMap(r => r.raceResults).filter(x => x.driverId === id);
  t.check('round 6: starts = the driver\'s starts in rounds 1–5', r6.every(r => r.starts === before(r.driverId).length));
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length, fin = x => Number.isFinite(x.position) && x.position >= 1;
  t.check('round 6: mean finish = classified finishes in rounds 1–5', r6.every(r => { const f = before(r.driverId).filter(fin).map(x => x.position); return f.length ? Math.abs(r.mean_finish - mean(f)) < 1e-5 : r.mean_finish === ''; }));
  const gf = B.gridFile(2024).rounds.find(g => g.round === 6);
  t.check('round 6: known = this race\'s starting grid (pit lane = last) or qualifying position', r6.every(r => {
    const g = gf.grid[r.driverId], q = gf.qualifying.find(x => x.driverId === r.driverId);
    const want = r.driverId in gf.grid ? (g === 0 ? r.n : g) : q ? q.position : null;
    return want == null ? r.known === '' : r.known === want;
  }));
  t.check('round 6: qualifying form counts rounds 1–5 only', r6.every(r => r.q_starts <= 5));
  t.check('grid DNF rate counts earlier races only', r6.every(r => r.grid_rate === cs.gridRate));

  // ---- The Simulator's marginals are probabilities ----
  const sum = k => r6.reduce((s, r) => s + r[k], 0);
  t.check('model marginals: wins add to 1, podiums to 3, points places to about 10', Math.abs(sum('cur_win') - 1) < 1e-9 && Math.abs(sum('cur_podium') - 3) < 1e-9 && sum('cur_points') > 9.5 && sum('cur_points') <= 10 + 1e-9, `${sum('cur_win')} ${sum('cur_podium')} ${sum('cur_points')}`);
  t.check('model marginals are nested: win <= podium <= points', r6.every(r => r.cur_win <= r.cur_podium + 1e-12 && r.cur_podium <= r.cur_points + 1e-12));
  const again = X.featureRows(cases.filter(c => c.round === 6), 2000);
  t.check('same seed, same marginals', JSON.stringify(again.map(r => r.cur_win)) === JSON.stringify(r6.map(r => r.cur_win)));
};
