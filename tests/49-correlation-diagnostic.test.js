// #177: the stage 5 diagnostic (tools/correlation-diagnostic.mjs). Draws are valid race orders, the model's teammate covariance is
// negative (a place can be taken once), and the same seed gives the same numbers. Plain Node, no browser.
module.exports = async (t, h) => {
  const B = await import('../tools/backtest.mjs');
  const D = await import('../tools/correlation-diagnostic.mjs');
  const c = B.raceCases(2024).find(x => x.round === 6), n = c.racers.length, runs = 400;
  const pos = D.drawPositions(c, B.DEFAULT, runs, 7);
  let valid = true;
  for (let r = 0; r < runs; r++) {
    const row = Array.from(pos.subarray(r * n, (r + 1) * n)), fin = row.filter(p => p < n).sort((a, b) => a - b), retired = row.filter(p => p === n).length;
    // finishers take places 1..k once each; a retirement is n (a finisher can also take place n when nobody retires)
    const k = n - retired;
    if (retired === 0 ? fin.length !== n || fin.some((p, i) => p !== i + 1) : fin.length !== k || fin.some((p, i) => p !== i + 1)) { valid = false; break; }
  }
  t.check('draws: every run gives the finishers places 1..k once each, retirements last', valid);
  const a = D.raceStats(c, runs), b = D.raceStats(c, runs);
  t.check('same seed, same statistics', JSON.stringify(a) === JSON.stringify(b));
  t.check('the model\'s own teammate covariance in position is negative', a.position.modCov < 0, String(a.position.modCov));
  t.check('statistics are finite', Object.values(a).every(s => Object.values(s).every(Number.isFinite)));
};
