// #177: the per-team "good weekend" factor (stage 5, research). Off, it changes nothing (same numbers, no extra random draws);
// on, it is a proper, repeatable model. Plain Node, no browser.
module.exports = async (t, h) => {
  const B = await import('../tools/backtest.mjs');
  const cases = B.raceCases(2024), c = cases.find(x => x.round === 8);

  // ---- Race level ----
  const base = B.raceLogLik(c, B.DEFAULT), zero = B.raceLogLik(c, { ...B.DEFAULT, sigma: 0 });
  t.check('sigma 0: the race log-probability is exactly the Simulator\'s', base === zero, `${base} ${zero}`);
  const tiny = B.raceLogLik(c, { ...B.DEFAULT, sigma: 1e-4 });
  t.check('a tiny sigma gives (almost) the same log-probability', Math.abs(tiny - base) < 1e-3, `${tiny} ${base}`);
  const on = B.raceLogLik(c, { ...B.DEFAULT, sigma: 0.6 });
  t.check('sigma 0.6: finite, repeatable', Number.isFinite(on) && on === B.raceLogLik(c, { ...B.DEFAULT, sigma: 0.6 }), String(on));

  // ---- Season engine ----
  const snap = B.snapshot(2024, 12), P = p => JSON.stringify(B.projectSeason(snap, p, 200, 3));
  t.check('sigma 0: the season projection is identical to the Simulator\'s (no extra random draws)', P(B.DEFAULT) === P({ ...B.DEFAULT, sigma: 0 }));
  const rows = B.projectSeason(snap, { ...B.DEFAULT, sigma: 0.6 }, 400, 3);
  t.check('sigma 0.6: repeatable, and the title probabilities add to 1', P({ ...B.DEFAULT, sigma: 0.6 }) === P({ ...B.DEFAULT, sigma: 0.6 }) && Math.abs(rows.reduce((s, r) => s + r.p1, 0) - 1) < 1e-9);
  t.check('sigma 0.6 changes the draws', P({ ...B.DEFAULT, sigma: 0.6 }) !== P(B.DEFAULT));
  const ctx = B.simContext(snap, { ...B.DEFAULT, sigma: 0.6 });
  t.check('the context carries one team index per racing driver, shared by teammates', ctx.sigma === 0.6 && ctx.teamOf.length === ctx.n && ctx.roster.every((q, i) => (ctx.teamOf[i] >= 0) === q.active) && ctx.roster.every((q, i) => ctx.roster.every((r, j) => !q.active || !r.active || (q.teamId === r.teamId) === (ctx.teamOf[i] === ctx.teamOf[j]))));
};
