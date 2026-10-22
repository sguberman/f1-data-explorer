// #179: the clinch-timing diagnostic (tools/clinch-diagnostic.mjs). Least squares recovers a known line, and the cut points of one
// real season are well formed (before the real settling round, an ordered band, a lead between 0 and 1). Plain Node, no browser.
module.exports = async (t, h) => {
  const D = await import('../tools/clinch-diagnostic.mjs');
  const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]], b = D.ols(X, X.map(r => 2 + 3 * r[1]));
  t.check('ols recovers y = 2 + 3x', Math.abs(b[0] - 2) < 1e-6 && Math.abs(b[1] - 3) < 1e-6, JSON.stringify(b));
  const rows = D.cutPoints([2020], 100);
  t.check('2020: cut points run from round 4 to just before the real settling round (14)', rows.length === 10 && rows[0].L === 4 && rows.at(-1).L === 13 && rows.every(r => r.dec === 14), JSON.stringify(rows.map(r => r.L)));
  t.check('each cut point has an ordered band around the median and a lead share in [0, 1)', rows.every(r => r.p10 <= r.med && r.med <= r.p90 && r.lead >= 0 && r.lead < 1));
  const d = D.diagnose(rows, [2020]);
  t.check('diagnose: counts and finite statistics (one season: no leave-one-out gain to report)', d.cutPoints === 10 && Number.isFinite(d.byPart.early.signed));
  const rows2 = rows.concat(D.cutPoints([2021], 100)), d2 = D.diagnose(rows2, [2020, 2021]);
  t.check('diagnose, two seasons: a leave-one-season-out gain', Number.isFinite(d2.gain) && d2.seasons === 2 && Number.isFinite(d2.errorAfter));
};
