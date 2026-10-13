// #46: no mechanical/non-mechanical DNF distinction. A classified position counts as that finish; a result
// with no classified position is NC ("not classified"). The finishing-position chart and the simulator use
// the same rule.
module.exports = async (t, h) => {
  const p = await h.openPage('position'); await h.loaded(p);
  const d = await p.evaluate(() => {
    const rows = F1Controls.state.seasonRounds.flatMap(r => [...r.raceResults, ...(r.sprintResults||[])]);
    return {
      fields: [...new Set(rows.flatMap(Object.keys))],
      badPos: rows.filter(q => !(q.position === null || (Number.isInteger(q.position) && q.position >= 1))).length,
      nulls: rows.filter(q => q.position === null).length,
      labels: ridgeChart.data.labels,
      opts: [...document.querySelectorAll('#chartOptRow input')].map(i => i.dataset.opt),
      note: document.getElementById('ridgeNote').textContent,
      api: typeof F1Data.isMechanical,
    };
  });
  t.check('results no longer carry mechanical/retired fields', !d.fields.includes('mechanical') && !d.fields.includes('retired'), d.fields.join(','));
  t.check('unclassified positions (null, "NC", "-") all become null', d.badPos === 0 && d.nulls > 0, `bad ${d.badPos}, null ${d.nulls}`);
  t.check('no Mechanical DNFs option', JSON.stringify(d.opts) === JSON.stringify(['below10','sprint']), d.opts.join(','));
  t.check('grouped bucket is "11+/NC"', d.labels[d.labels.length-1] === '11+/NC', d.labels.join(','));
  t.check('NC explained under the chart', /NC = not classified/.test(d.note), d.note);
  t.check('F1Data.isMechanical is gone', d.api === 'undefined');
  await p.check('#chartOptRow input[data-opt="below10"]');
  t.check('expanded view ends with an NC bucket', await p.evaluate(() => ridgeChart.data.labels.slice(-1)[0] === 'NC'));

  // Same rule on both pages: with sprints off, the position chart's top-10 counts equal the simulator's
  // finish histogram, and its 11+/NC bucket = the simulator's 11+ finishes + DNFs.
  await p.uncheck('#chartOptRow input[data-opt="below10"]');
  await p.uncheck('#chartOptRow input[data-opt="sprint"]');
  await p.click('#presetRow button[data-preset="all"]');
  const chart = await p.evaluate(() => {
    const codeToId = {}; F1Controls.state.seasonRounds.forEach(r => r.raceResults.forEach(q => { codeToId[q.code] = q.driverId; }));
    const out = {}; ridgeChart.data.datasets.filter(x => !x._baseline).forEach(x => { out[codeToId[x._code]] = x._counts; }); return out;
  });
  t.check('position: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  const s = await h.openPage('simulator'); await h.loaded(s);
  const sim = await s.evaluate(() => {
    const out = {}, st = buildDnfStats();
    fullRoster.forEach(d => { out[d.driverId] = { hist:d.posHist, dnfs:(st[d.driverId]||{}).dnfs||0 }; });
    return out;
  });
  const bad = Object.keys(chart).filter(id => {
    const c = chart[id], m = sim[id]; if(!m) return true;
    return c.slice(0,10).some((v,i) => v !== m.hist[i]) || c[10] !== m.hist[10] + m.dnfs;
  });
  t.check('position chart and simulator agree on finishes and NC/DNFs (Grand Prix only)', Object.keys(chart).length === 22 && bad.length === 0, bad.slice(0,3).join(','));
  t.check('simulator: DNF wording explained as no classified finish', /a DNF here means no classified finish/.test(await s.$eval('#outcomeNote', e => e.textContent)));
  t.check('simulator: no page errors', s.errors.length === 0, s.errors.join('; '));
  await s.done();
};
