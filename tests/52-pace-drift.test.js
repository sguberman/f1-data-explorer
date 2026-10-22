// #180: season-long pace drift (research). Off, it changes nothing (same numbers, no extra random draws); the next race is never
// drifted; on, it is repeatable and changes the multi-race projection. Plain Node, no browser.
module.exports = async (t, h) => {
  const B = await import('../tools/backtest.mjs');
  const P = (snap, p) => JSON.stringify(B.projectSeason(snap, p, 200, 3));
  const snap = B.snapshot(2024, 12), walk = { ...B.DEFAULT, driftTeam: 0.15, driftWalk: true }, level = { ...B.DEFAULT, driftTeam: 0.3, driftDriver: 0.1, driftWalk: false };

  t.check('drift 0: the season projection is identical to the Simulator\'s (no extra random draws)', P(snap, B.DEFAULT) === P(snap, { ...B.DEFAULT, driftTeam: 0, driftDriver: 0 }));
  t.check('walk and level drift: repeatable', P(snap, walk) === P(snap, walk) && P(snap, level) === P(snap, level));
  t.check('walk and level drift change the multi-race projection', P(snap, walk) !== P(snap, B.DEFAULT) && P(snap, level) !== P(snap, B.DEFAULT) && P(snap, walk) !== P(snap, level));
  const rows = B.projectSeason(snap, walk, 400, 3);
  t.check('with drift the title probabilities still add to 1', Math.abs(rows.reduce((s, r) => s + r.p1, 0) - 1) < 1e-9);

  // One round left: the only round simulated is the next race, which is never drifted, so the projection equals the Simulator's.
  const last = B.snapshot(2024, B.season(2024).rounds.length - 1), rounds = new Set(last.events.map(e => e.round));
  t.check('2024 before the last round: one round to simulate', rounds.size === 1);
  t.check('the next race is never drifted (walk): one round left, the projection equals the Simulator\'s', P(last, walk) === P(last, B.DEFAULT));
  // (level drift draws its season offsets up front, so the random stream differs, but the offsets are not applied to the first round)
  const ctxL = B.simContext(last, level), M = require('../site/racemodel.js'), rand = (() => { let a = 5; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const sim = M.simulateSeason(ctxL, rand, last.sc.gp, last.sc.sprint, false);
  t.check('level drift: the offsets exist but are not applied in the first round', ctxL.dActive === false && sim.totals.every(Number.isFinite));

  const ctx = B.simContext(snap, walk);
  t.check('the context carries the drift settings', ctx.driftTeam === 0.15 && ctx.driftDriver === 0 && ctx.driftWalk === true && ctx.nTeams > 0);
  t.check('the pages\' context has no drift (never set)', !(B.simContext(snap, B.DEFAULT).driftTeam > 0));
};
