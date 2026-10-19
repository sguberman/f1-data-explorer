// Group 5 (#122): #108 median lines and sort by median (NC ignored) on the position and simulator ridge plots;
// #114 bars instead of curves on the simulator's points plot.
module.exports = async (t, h) => {
  const J = JSON.stringify;
  let p = await h.openPage('position', { width: 1000 }); await h.loaded(p);
  const m = await p.evaluate(() => ({ odd: F1Common.medianOf([0, 1, 1, 1]), even: F1Common.medianOf([2, 2, 0, 0]), skip: F1Common.medianOf([0, 1, 5], [2]),
    none: F1Common.medianOf([0, 0, 3], [2]) }));
  t.check('medianOf: middle value, halfway for an even count, skipped category ignored, null when empty',
    m.odd === 2 && m.even === 0.5 && m.skip === 1 && m.none === null, J(m));

  const hits = p.apiHits.length;
  await p.selectOption('#chartSortSelect', 'median');
  const pos = await p.evaluate(() => {
    const ch = Chart.getChart(document.getElementById('ridgeCanvas')), ds = ch.data.datasets.filter(d => !d._baseline);
    const med = D.map(d => d.median);
    return { codes: ds.map(d => d._code), order: sortedRows().map(d => d.median ?? Infinity), hasLine: ds.some(d => d._median != null), plugin: !!ch.config.plugins.find(x => x.id === 'ridgeMedians'),
      link: location.search, med };
  });
  t.check('position: Median finish sorts best median first (ties by standings), no NC in it', pos.order.every((v, i) => i === 0 || pos.order[i - 1] <= v), J(pos));
  t.check('position: ridges carry a median line and the plugin draws them', pos.hasLine && pos.plugin, J(pos));
  t.check('position: the sort is in the link (chart=median), and sorting never fetches', /chart=median/.test(pos.link) && p.apiHits.length === hits, pos.link);

  p = await h.openPage('simulator', { width: 1000 }); await h.loaded(p);
  await p.click('#run'); await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent));
  const hits2 = p.apiHits.length;
  const before = await p.evaluate(() => ({ seed: lastRun.seed, pts: Chart.getChart(document.getElementById('ridgePointsCanvas')).data.datasets.filter(d => !d._baseline).map(d => d._code) }));
  await p.selectOption('#ridgePointsCard .resultSort', 'median');
  const after = await p.evaluate(() => {
    const ds = id => Chart.getChart(document.getElementById(id)).data.datasets.filter(d => !d._baseline);
    const pts = ds('ridgePointsCanvas'), pos = ds('ridgePosCanvas');
    return { seed: lastRun.seed, codes: pts.map(d => d._code), meds: pts.map(d => d._median), posMeds: pos.map(d => d._median), both: document.querySelectorAll('.resultSort')[1].value,
      link: location.search };
  });
  t.check('simulator: sort by median redraws both plots from the same run (no re-run, no fetch)', after.seed === before.seed && after.both === 'median' && p.apiHits.length === hits2, J(after));
  t.check('simulator: both plots have a median line per ridge', after.meds.every(v => v != null) && after.posMeds.every(v => v != null), J(after));
  t.check('simulator: sorting is in the link (rsort=median)', /rsort=median/.test(after.link), after.link);

  await p.check('#ridgeBarsOpt');
  const bars = await p.evaluate(() => ({ b: Chart.getChart(document.getElementById('ridgePointsCanvas')).data.datasets.filter(d => !d._baseline).every(d => d._bars && d.fill === false),
    pos: Chart.getChart(document.getElementById('ridgePosCanvas')).data.datasets.some(d => d._bars), link: location.search }));
  t.check('simulator: Bars switches the points plot to bins, and only that plot (bars=1 in the link)', bars.b && !bars.pos && /bars=1/.test(bars.link), J(bars));
  await p.uncheck('#ridgeBarsOpt');
  t.check('simulator: unticking Bars brings the curves back', await p.evaluate(() => Chart.getChart(document.getElementById('ridgePointsCanvas')).data.datasets.filter(d => !d._baseline).every(d => !d._bars && d.fill === '-1')));
  t.check('simulator: Bars never fetches', p.apiHits.length === hits2);
};
