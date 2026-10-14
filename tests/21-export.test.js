// #33: each chart has "⤓ PNG · CSV": a picture with title, season/round, legend, chart and site address, and the
// data behind the chart. Made in the browser — exporting never fetches.
const fs = require('fs');
module.exports = async (t, h) => {
  const grab = async (p, sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    return { name: d.suggestedFilename(), data: fs.readFileSync(await d.path()) };
  };
  const csvRows = buf => buf.toString('utf8').replace(/^﻿/, '').trim().split(/\r\n/).map(r => r.split(','));
  const pngSize = buf => ({ png: buf.readUInt32BE(0) === 0x89504e47, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

  // Drivers page: three charts, each with both links.
  let p = await h.openPage('drivers', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;
  t.check('drivers: every chart card has PNG and CSV links', await p.$$eval('.exportRow', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join('|')) === 'PNG · CSV|PNG · CSV|PNG · CSV');
  let f = await grab(p, '#c >> xpath=ancestor::div[contains(@class,"card")]//button[contains(@class,"exp-png")]');
  const size = pngSize(f.data), chartW = await p.$eval('#c', c => c.clientWidth), chartH = await p.$eval('#c', c => c.clientHeight);
  t.check('drivers: PNG named by season, chart and round', f.name === 'f1-2026-drivers-points-r12.png', f.name);
  t.check('drivers: PNG is the chart plus room for title, legend and footer', size.png && size.w >= chartW && size.h > chartH + 60, JSON.stringify({ ...size, chartW, chartH }));
  f = await grab(p, '#c >> xpath=ancestor::div[contains(@class,"card")]//button[contains(@class,"exp-csv")]');
  let rows = csvRows(f.data);
  const codes = await p.evaluate(() => D.map(d => d.n)), full0 = await p.evaluate(() => D.map(d => Math.round(d.full[0] * 100) / 100));
  t.check('drivers: points CSV has a column per driver plus the knockout line, a row per round',
    rows[0].join() === ['Round', 'Race', 'Projected', ...codes, 'Knockout line'].join() && rows.length === 1 + 23, rows[0].join());
  t.check('drivers: …with the chart\'s numbers (actual, then projected)', rows[1].slice(3, 3 + codes.length).map(Number).join() === full0.join() && rows[12][2] === 'no' && rows[13][2] === 'yes', rows[1].join());
  f = await grab(p, '#posChart >> xpath=ancestor::div[contains(@class,"card")]//button[contains(@class,"exp-csv")]');
  rows = csvRows(f.data);
  const posFirst = await p.evaluate(() => F1Common.standingsOrder(F1Controls.state.seasonRounds, 1, 'drivers')[0]);
  const posCode = await p.evaluate(id => F1Controls.state.seasonRounds[0].raceResults.find(r => r.driverId === id).code, posFirst);
  t.check('drivers: position CSV gives each driver\'s position after each round', rows.length === 13 && rows[1][rows[0].indexOf(posCode)] === '1', rows[0].slice(0, 4).join());
  t.check('drivers: exporting never fetches', p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
  t.check('drivers: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Positions page: CSV counts are the chart's counts.
  p = await h.openPage('position', { theme: 'dark' }); await h.loaded(p);
  f = await grab(p, '.exp-csv'); rows = csvRows(f.data);
  const counts = await p.evaluate(() => ridgeChart.data.datasets.filter(d => !d._baseline).map(d => [d._code, ...d._counts, d._starts].join()));
  t.check('position: CSV is the finishing-position counts per driver', rows.slice(1).map(r => r.join()).join('|') === counts.join('|') && rows[0][0] === 'Driver' && rows[0].slice(-1)[0] === 'Starts', rows[0].join());
  f = await grab(p, '.exp-png');
  t.check('position: PNG downloads (dark theme)', pngSize(f.data).png && f.name === 'f1-2026-finishing-positions-r12.png', f.name);
  await p.done();

  // Simulator: after a run, the win probability (drawn bars), the ridges and their CSVs.
  p = await h.openPage('simulator'); await h.loaded(p);
  await p.selectOption('#n', '2000'); await p.click('#run');
  await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  f = await grab(p, '#oddsCard .exp-csv'); rows = csvRows(f.data);
  const odds = await p.$$eval('#odds .driver-row', rs => rs.map(r => r.querySelector('.tag').textContent.trim()));
  t.check('simulator: win-probability CSV lists the tracked drivers, most likely first', rows[0].join() === 'Driver,Win probability (%)' && rows.slice(1).map(r => r[0]).join() === odds.join(), rows.slice(0, 3).join('|'));
  t.check('simulator: …and the percentages add up to no more than 100', rows.slice(1).reduce((s, r) => s + +r[1], 0) <= 100.01);
  f = await grab(p, '#oddsCard .exp-png');
  t.check('simulator: win-probability PNG (bars drawn for the picture)', pngSize(f.data).png && pngSize(f.data).h > 8 * 26, JSON.stringify(pngSize(f.data)));
  f = await grab(p, '#ridgePointsCard .exp-csv'); rows = csvRows(f.data);
  t.check('simulator: final-points CSV gives each 10-point range as a share of seasons', /^\d+–\d+ pts \(% of seasons\)$/.test(rows[0][1]) && Math.abs(rows[1].slice(1).reduce((s, v) => s + +v, 0) - 100) < 0.5, rows[0].slice(0, 2).join());
  t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // What-if: CSV of both tables (no PNG — they're tables).
  p = await h.openPage('whatif'); await h.loaded(p);
  t.check('what-if: CSV links for both tables, no PNG', await p.$eval('#resultCard .exportRow', r => r.textContent.replace(/\s+/g, ' ').trim()) === 'Drivers CSV · Constructors CSV');
  f = await grab(p, '#resultCard .exp-csv'); rows = csvRows(f.data);
  const tbl = await p.$$eval('#driverTable tr[data-id]', trs => trs.map(tr => tr.children[0].textContent + '/' + tr.children[5].textContent));
  t.check('what-if: drivers CSV matches the table', rows[0][0] === 'Position' && rows.slice(1).map(r => r[0] + '/' + r[5]).join() === tbl.join() && f.name === 'f1-2026-whatif-r12-drivers.csv', f.name + ' ' + rows[0].join());
  f = await grab(p, '#resultCard .exp-csv2');
  t.check('what-if: constructors CSV', f.name === 'f1-2026-whatif-r12-constructors.csv' && csvRows(f.data).length === 12, f.name);
  await p.done();

  // Phone: the export row fits.
  p = await h.openPage('constructors', { width: 390, theme: 'dark' }); await h.loaded(p);
  t.check('phone: export links fit without horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= 390 && [...document.querySelectorAll('.exportRow')].every(r => r.getBoundingClientRect().right <= 390)));
  await p.done();
};
