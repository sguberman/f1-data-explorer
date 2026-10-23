// #186: the Weekend Pace page — the shared season/round controls (the slider reaches this weekend), the site's driver picker, the session buttons
// (practice, qualifying, sprint and the Race), lap-time lines (compound breaks, qualifying parts, hover tooltip, follow a driver, outliers), the lap-time
// dot plot with its box plot, the sector table, the best vs ideal lap plot, top speed (mph, km/h), share link, cache, errors and themes.
// OpenF1 is answered by lib/openf1-fixture.js (rounds 11–13 of the fake season; round 13 has run FP1 and FP2 at the fixed "now").
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const open = (opts = {}) => h.openPage('pace', { openf1: {}, now: fx.NOW, ...opts });
  const ready = async (p, text = /timed laps|no lap data|no sessions|Couldn’t/) => { await h.loaded(p); await p.waitForFunction(re => new RegExp(re).test(document.getElementById('paceStatus').textContent), text.source, { timeout: 10000 }); await p.waitForTimeout(100); };
  const hits = p => p.openf1Hits.map(u => new URL(u).pathname.replace('/v1/', '')).join();
  const release = (p, round) => p.evaluate(r => { const s = document.querySelector('.f1c-round'); s.value = r; s.dispatchEvent(new Event('input')); }, round);
  const commit = p => p.evaluate(() => document.querySelector('.f1c-round').dispatchEvent(new Event('change')));
  const state = p => p.evaluate(() => ({
    status: document.getElementById('paceStatus').textContent,
    label: document.querySelector('.f1c-roundlabel').textContent, slider: [+document.querySelector('.f1c-round').value, +document.querySelector('.f1c-round').max],
    chips: [...document.querySelectorAll('.sessBtn')].map(b => [b.textContent, b.classList.contains('on'), b.disabled]),
    rows: [...document.querySelectorAll('#pacePicker input')].map(i => [i.dataset.id, i.checked]),
    lines: lapChart ? lapChart.data.datasets.filter(d => !d._outlier).map(d => d.label) : null,
    dots: dotChart ? dotChart.data.datasets[0].data.length : null,
    bars: speedChart ? speedChart.data.labels.slice() : null,
    dumb: dumbChart ? dumbChart._rows.map(r => r.e.label) : null,
    table: [...document.querySelectorAll('#sectorTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    best: document.querySelectorAll('#sectorTable td.best').length,
    url: location.pathname + location.search,
  }));
  const num = s => { const m = s.match(/^(?:(\d+):)?([\d.]+)$/); return (m[1] ? +m[1] * 60 : 0) + parseFloat(m[2]); };
  const pickedOn = (p, picker) => p.$$eval(`#${picker} input:checked`, is => is.map(i => i.dataset.id));
  // where a chart's point is on the screen (the chart is scrolled into view first)
  const spot = async (p, chartName, canvas, ds, i) => { await p.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'center' }), canvas);
    return p.evaluate(([c, d, k, id]) => { const el = window.eval(c).getDatasetMeta(d).data[k], r = document.getElementById(id).getBoundingClientRect(); return [r.left + el.x, r.top + el.y]; }, [chartName, ds, i, canvas]); };
  const lapSpot = (p, ds, i) => spot(p, 'lapChart', 'lapCanvas', ds, i), dotSpot = (p, ds, i) => spot(p, 'dotChart', 'dotCanvas', ds, i);
  const lapStyle = p => p.evaluate(() => lapChart.data.datasets.filter(d => !d._outlier).map(d => /^rgba/.test(d.borderColor)));

  // ---- first view: the shared controls, the weekend that is on ----
  let p = await open(); await ready(p);
  let s = await state(p);
  t.check('the shared season controls are there, and the slider reaches round 13, the weekend that is on', s.slider.join() === '13,13' && s.label === 'Round 13 of 13 — Round 13 Grand Prix' && await p.$('.f1c-year') !== null, JSON.stringify([s.slider, s.label]));
  t.check('…with the circuit country’s flag before the round name, like the other pages', await p.$('.f1c-roundlabel .flag') !== null);
  t.check('the controls say the weekend is added', /12 rounds loaded · race weekend of round 13/.test(await p.$eval('.f1c-status', e => e.textContent)));
  t.check('the cards run: drivers, session, lap times, distribution, best sectors table, best vs ideal plot, top speed', await p.$$eval('.wrap > .card', c => c.map(x => x.id).join()) === 'pickCard,sessionCard,lapCard,dotCard,sectorCard,dumbCard,speedCard');
  t.check('opens on the latest session that has run (FP2); FP3, Quali and the Race are disabled', s.chips.map(c => c[0]).join() === 'FP1,FP2,FP3,Quali,Race' && s.chips.find(c => c[1])?.[0] === 'FP2' && s.chips.filter(c => c[2]).map(c => c[0]).join() === 'FP3,Quali,Race', JSON.stringify(s.chips));
  t.check('the status line names the session, drivers and laps', /Practice 2 · 6 drivers · 65 timed laps/.test(s.status), s.status);
  t.check('loads the sessions and the one session once each (4 requests), no race control for practice', hits(p) === 'sessions,laps,stints,drivers', hits(p));
  t.check('the Share button is the shared one', await p.$('.f1c-share') !== null);
  t.check('there is no Drivers/Teams choice: the picker is drivers only', await p.$('#bySel') === null && await p.$$eval('#presetRow .pill', b => b.map(x => x.textContent).join()) === 'All,None,Top 5,Top 10,Top 4 teams,Best of the rest,Title contention,Fastest 5,Fastest 10');
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));

  // ---- the site's picker: flags, numbers, team groups, the site's team colours ----
  t.check('in practice the sort defaults to the fastest lap: one list, numbered, quickest first', await p.evaluate(() => document.querySelector('.sortSeg').value === 'fast' && document.querySelectorAll('#pacePicker .pickerTeamLabel').length === 0 && [...document.querySelectorAll('#pacePicker .pickerRank')].map(e => e.textContent).join() === '1,2,3,4,5,6'));
  await p.selectOption('#pickCard .sortSeg', 'team'); await p.waitForTimeout(100);
  const pk = await p.evaluate(() => ({
    teams: [...document.querySelectorAll('#pacePicker .pickerTeamLabel')].map(e => e.textContent),
    flags: document.querySelectorAll('#pacePicker .pickerRow .flag').length, nums: [...document.querySelectorAll('#pacePicker .pickerNum')].map(e => e.textContent).join(),
    tags: [...document.querySelectorAll('#pacePicker .pickerCodeTag')].map(e => e.textContent).join(),
    dot: document.querySelector('#pacePicker .pickerDot').style.backgroundColor, site: F1Theme.team(F1Common.teamColor('mercedes')),
    line: lapChart.data.datasets[0]._color, bar: speedChart.data.datasets[0].backgroundColor[0], pts: [...document.querySelectorAll('#pacePicker .pickerPts')].map(e => e.textContent).join(),
    rowText: document.querySelector('#pacePicker .pickerRow').textContent.replace(/\s+/g, ' ').trim(),
  }));
  const rgb = hex => { const v = hex.replace('#', ''); return `rgb(${[0, 2, 4].map(i => parseInt(v.substr(i, 2), 16)).join(', ')})`; };
  t.check('drivers are grouped under their team', [...pk.teams].sort().join() === 'McLaren Formula 1 Team,Mercedes Formula 1 Team,Scuderia Ferrari', pk.teams.join());
  t.check('a row has a flag, the number, the full name and the code tag, as on the other pages', pk.flags === 6 && pk.nums === '63,12,16,44,1,81' && pk.tags === 'DA0,DA1,DB0,DB1,DC0,DC1' && /^63Driver0 Team0DA0 1:30\.020$/.test(pk.rowText), JSON.stringify([pk.flags, pk.nums, pk.tags, pk.rowText]));
  t.check('the right-hand column is the best lap', pk.pts === '1:30.020,1:30.390,1:30.760,1:31.130,1:31.500,1:31.890', pk.pts);
  t.check('team colours are the site’s (not OpenF1’s) in the picker, lap lines and bars', pk.dot === rgb(pk.site) && pk.line === pk.site && pk.bar === pk.site && pk.site !== '#111111', JSON.stringify([pk.dot, pk.line, pk.bar, pk.site]));
  t.check('every driver is on the lap lines, the dots, the bars, the table and the best vs ideal plot', s.lines.join() === 'DA0,DA1,DB0,DB1,DC0,DC1' && s.dots === 41 && s.bars.length === 6 && s.table.length === 6 && s.dumb.length === 6, JSON.stringify([s.lines, s.dots, s.bars]));
  t.check('the picker folds away like the others', await p.evaluate(() => { document.getElementById('pickerToggle').click(); const hidden = getComputedStyle(document.getElementById('pacePicker')).display === 'none'; document.getElementById('pickerToggle').click(); return hidden; }));
  await p.selectOption('#pickCard .sortSeg', 'rank'); await p.waitForTimeout(100);
  t.check('Sort by Ranking lists them in one list with the standings rank', await p.evaluate(() => document.querySelectorAll('#pacePicker .pickerTeamLabel').length === 0 && document.querySelectorAll('#pacePicker .pickerRank').length === 6));
  await p.selectOption('#pickCard .sortSeg', 'fast');

  // ---- the lap lines ----
  const lines = await p.evaluate(() => lapChart.data.datasets.map(d => [d.data.filter(q => q.y !== null).length, d.data.map(q => q.y === null ? '|' : q.n).join()]));
  t.check('the line breaks where the tyre compound changes (softs on laps 2–5, mediums from 8) and not at the hidden in and out laps', lines[0][1] === '2,3,4,5,|,8,9,10' && lines.map(l => l[0]).join() === '7,7,7,7,7,6' && lines[5][1] === '2,3,5,|,8,9,10', JSON.stringify(lines));
  t.check('faster is lower: the lap time axis is not reversed', await p.evaluate(() => !lapChart.options.scales.y.reverse && /faster is lower/.test(lapChart.options.scales.y.title.text)));
  t.check('tyre compounds colour the dots', await p.evaluate(() => { const d = lapChart.data.datasets[0]; return d._fills.includes('#e53935') && d._fills.includes('#fbc02d'); }));
  t.check('the second driver of a team is dashed', await p.evaluate(() => { const d = lapChart.data.datasets; return d[0].borderDash.length === 0 && d[1].borderDash.length === 2; }));
  t.check('practice has no qualifying parts, and its x axis is minutes into the session like qualifying’s (only the Sprint and the Race use lap numbers)', await p.evaluate(() => !(model.segments || []).length && lapChart.options.scales.x.title.text === 'Minutes into the session' && lapChart.data.datasets[0].data[0].x === 2.5));

  // hover: every driver's time at that lap, fastest first
  let [x3, y3] = await p.evaluate(() => { const a = lapChart.chartArea, r = document.getElementById('lapCanvas').getBoundingClientRect(); document.getElementById('lapCanvas').scrollIntoView({ block: 'center' });
    const r2 = document.getElementById('lapCanvas').getBoundingClientRect(); return [r2.left + lapChart.scales.x.getPixelForValue(5.2), r2.top + a.top + 30]; });
  await p.mouse.move(x3, y3); await p.waitForTimeout(100);
  const tip = await p.$eval('#lapTip', e => ({ hidden: e.hidden, head: e.querySelector('.tipHead')?.textContent, rows: [...e.querySelectorAll('.tipRow')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }));
  t.check('hovering lists each driver’s lap then (minutes into the session), fastest first, with the tyre and lap number', !tip.hidden && /^5:\d\d into the session$/.test(tip.head) && tip.rows.length === 6 && /^DA01:30\.0\d\dsoft, lap 3$/.test(tip.rows[0]) && /^DC11:31\.\d{3}soft, lap 3$/.test(tip.rows[5]), JSON.stringify(tip));
  await p.mouse.move(5, 5); await p.waitForTimeout(100);
  t.check('…and goes away when the pointer leaves', await p.$eval('#lapTip', e => e.hidden));

  // click: follow a driver (the others dim); the legend does the same
  let [a0x, a0y] = await lapSpot(p, 0, 1);
  await p.mouse.click(a0x, a0y); await p.waitForTimeout(100);
  t.check('clicking a dot follows that driver: the others fade', JSON.stringify(await lapStyle(p)) === '[false,true,true,true,true,true]' && await p.$eval('.paceLegend .lgItem[data-code="DA0"]', e => e.classList.contains('on')));
  t.check('…the legend fades the others too', await p.$$eval('#lapLegend .lgItem[data-code]', b => b.map(x => x.classList.contains('dim')).join()) === 'false,true,true,true,true,true');
  t.check('…and the dot plot follows the same driver', await p.evaluate(() => dotChart.data.datasets[0].pointBackgroundColor.filter((c, i) => /^rgba/.test(c)).length === dotChart.data.datasets[0].data.filter(q => q.code !== 'DA0').length));
  await p.mouse.click(a0x, a0y); await p.waitForTimeout(100);
  t.check('clicking it again lets go', JSON.stringify(await lapStyle(p)) === '[false,false,false,false,false,false]');
  await p.click('#lapLegend .lgItem[data-code="DB0"]'); await p.waitForTimeout(100);
  t.check('clicking a name in the legend follows that driver', JSON.stringify(await lapStyle(p)) === '[true,true,false,true,true,true]');
  const [lx, ly] = await p.evaluate(() => { const a = lapChart.chartArea, r = document.getElementById('lapCanvas').getBoundingClientRect(); return [r.left + lapChart.scales.x.getPixelForValue(13), r.top + a.top + 8]; });
  await p.mouse.click(lx, ly); await p.waitForTimeout(100);
  t.check('clicking an empty part of the chart lets go', JSON.stringify(await lapStyle(p)) === '[false,false,false,false,false,false]');
  const [segx, segy] = await p.evaluate(() => { const m = lapChart.getDatasetMeta(0).data, a = m[0], b = m[1], r = document.getElementById('lapCanvas').getBoundingClientRect(); return [r.left + (a.x + b.x) / 2, r.top + (a.y + b.y) / 2]; });
  await p.mouse.click(segx, segy); await p.waitForTimeout(100);
  t.check('clicking a line (not only a dot) follows it', JSON.stringify(await lapStyle(p)) === '[false,true,true,true,true,true]');
  await p.mouse.click(lx, ly);

  // ---- outliers: right-click a dot on either plot; both plots stay in step ----
  [a0x, a0y] = await lapSpot(p, 0, 2); // DA0's lap 4, its best
  await p.mouse.click(a0x, a0y, { button: 'right' }); await p.waitForTimeout(150);
  let o = await p.evaluate(() => ({ n: outliers.size, key: [...outliers].join(), main: lapChart.data.datasets[0].data.filter(q => q.y !== null).length, ds: lapChart.data.datasets.map(d => d._outlier ? 'o' : 'm').join(''),
    dotMain: dotChart.data.datasets[0].data.length, dotOut: dotChart.data.datasets[1] ? dotChart.data.datasets[1].data.length : 0, reset: [...document.querySelectorAll('.resetOut')].map(b => b.hidden + ':' + b.textContent).join() }));
  t.check('right-click marks the lap as an outlier: off the line, drawn as a faded cross', o.n === 1 && o.key === '63:4' && o.main === 6 && /^mo/.test(o.ds), JSON.stringify(o));
  t.check('…and on the dot plot too (out of the box, shown as a cross)', o.dotMain === 40 && o.dotOut === 1, JSON.stringify(o));
  t.check('both plots, the table and the best lap plot offer Reset outliers, with the count', o.reset === Array(4).fill('false:Reset outliers (1)').join(), o.reset);
  t.check('no browser menu was left open and the page is fine', p.errors.length === 0, p.errors.join('; '));
  await p.uncheck('#dotCard .outChk'); await p.waitForTimeout(100);
  o = await p.evaluate(() => ({ lap: document.querySelector('#lapCard .outChk').checked, dot: document.querySelector('#dotCard .outChk').checked, ds: lapChart.data.datasets.some(d => d._outlier), dd: dotChart.data.datasets.length }));
  t.check('Show outliers off (on the dot plot) hides them on both, and the two checkboxes stay in step', !o.lap && !o.dot && !o.ds && o.dd === 1, JSON.stringify(o));
  await p.check('#lapCard .outChk'); await p.waitForTimeout(100);
  t.check('…and back on (on the line plot)', await p.evaluate(() => document.querySelector('#dotCard .outChk').checked && lapChart.data.datasets.some(d => d._outlier) && dotChart.data.datasets.length === 2));
  const [dx, dy] = await dotSpot(p, 1, 0);
  await p.mouse.click(dx, dy, { button: 'right' }); await p.waitForTimeout(150);
  t.check('right-click on the outlier in the dot plot takes the mark off, on both plots', await p.evaluate(() => outliers.size === 0 && lapChart.data.datasets[0].data.filter(q => q.y !== null).length === 7 && dotChart.data.datasets.length === 1));
  const [d2x, d2y] = await dotSpot(p, 0, 3);
  await p.mouse.click(d2x, d2y, { button: 'right' }); await p.waitForTimeout(150);
  t.check('right-click on a dot in the dot plot marks it, and the line plot follows', await p.evaluate(() => outliers.size === 1 && lapChart.data.datasets.some(d => d._outlier)));
  await p.reload(); await ready(p);
  t.check('outliers are remembered for the session when the page is reloaded', await p.evaluate(() => outliers.size === 1 && lapChart.data.datasets.some(d => d._outlier)));
  await p.click('#dotCard .resetOut'); await p.waitForTimeout(100);
  t.check('Reset outliers clears them (and the button goes)', await p.evaluate(() => outliers.size === 0 && [...document.querySelectorAll('.resetOut')].every(b => b.hidden) && !lapChart.data.datasets.some(d => d._outlier)));

  // ---- the best lap table and plot follow the outliers and share one sort ----
  [a0x, a0y] = await lapSpot(p, 0, 2); // DA0's best lap, lap 4
  await p.mouse.click(a0x, a0y, { button: 'right' }); await p.waitForTimeout(150);
  const afterOut = await p.evaluate(() => ({ row: [...document.querySelector('#sectorTable tbody tr').children].map(td => td.textContent), label: dumbChart._labels[0].text,
    reset: [...document.querySelectorAll('#sectorCard .resetOut, #dumbCard .resetOut')].map(b => b.hidden + ':' + b.textContent).join() }));
  t.check('marking a lap as an outlier takes it out of the table (DA0’s best lap is now its next best, 1:30.040) and of the plot', afterOut.row[0] === 'DA0' && afterOut.row[1] === '1:30.040' && afterOut.row[6] === '+0.040' && afterOut.label === '1:30.040', JSON.stringify(afterOut));
  t.check('…and the table and the plot each offer Reset outliers, with the count', afterOut.reset === 'false:Reset outliers (1),false:Reset outliers (1)', afterOut.reset);
  await p.click('#dumbCard .resetOut'); await p.waitForTimeout(100);
  t.check('Reset outliers on the plot gives the lap back everywhere', await p.evaluate(() => document.querySelector('#sectorTable tbody tr').children[1].textContent === '1:30.020' && outliers.size === 0 && dumbChart._labels[0].text === '1:30.020'));
  await p.selectOption('#dumbCard .tsortSel', 'gap'); await p.waitForTimeout(100);
  let sorted = await p.evaluate(() => ({ table: [...document.querySelectorAll('#sectorTable tbody tr')].map(tr => tr.children[0].textContent).join(), plot: dumbChart._rows.map(r => r.e.label).join(), sel: document.querySelector('#sectorCard .tsortSel').value,
    labels: dumbChart._labels.map(l => l.side + l.text).join(''), key: document.getElementById('dumbKey').textContent }));
  t.check('the plot has the table’s sort picker, kept in step: gap to ideal on either sets both, in the same order', sorted.sel === 'gap' && sorted.table === sorted.plot && sorted.table.split(',').length === 6, JSON.stringify(sorted));
  t.check('sorted by the gap the plot labels each row with its gap (to the right of the best lap dot) instead of lap times', sorted.labels.split('right').filter(Boolean).length === 6 && !/left/.test(sorted.labels) && /^(right[+−]0\.\d{3})+$/.test(sorted.labels) && /gap/.test(sorted.key), sorted.labels);
  await p.selectOption('#sectorCard .tsortSel', 'ideal'); await p.waitForTimeout(100);
  sorted = await p.evaluate(() => ({ table: [...document.querySelectorAll('#sectorTable tbody tr')].map(tr => tr.children[0].textContent).join(), plot: dumbChart._rows.map(r => r.e.label).join(), dsel: document.querySelector('#dumbCard .tsortSel').value, labels: dumbChart._labels.length }));
  t.check('sorted by ideal lap (picked on the table) the plot follows and goes back to lap time labels', sorted.dsel === 'ideal' && sorted.table === sorted.plot && sorted.labels === 12, JSON.stringify(sorted));
  await p.selectOption('#sectorCard .tsortSel', 'best');

  // ---- the driver picker can sort by the fastest lap ----
  await p.selectOption('#pickCard .sortSeg', 'fast'); await p.waitForTimeout(100);
  const fastRows = await p.evaluate(() => ({ codes: [...document.querySelectorAll('#pacePicker .pickerCodeTag')].map(e => e.textContent).join(), ranks: [...document.querySelectorAll('#pacePicker .pickerRank')].map(e => e.textContent).join(),
    pts: [...document.querySelectorAll('#pacePicker .pickerPts')].map(e => e.textContent), teams: document.querySelectorAll('#pacePicker .pickerTeamLabel').length, url: location.search }));
  t.check('Sort by Fastest Lap: one list, quickest first, numbered, with the lap time', fastRows.codes === 'DA0,DA1,DB0,DB1,DC0,DC1' && fastRows.ranks === '1,2,3,4,5,6' && fastRows.teams === 0 && fastRows.pts[0] === '1:30.020' && !/sort=/.test(fastRows.url), JSON.stringify(fastRows));
  await p.selectOption('#pickCard .sortSeg', 'fast');

  // ---- the keys, the box plot checkbox and layering, short race names ----
  const keys = await p.evaluate(() => ({ lap: [...document.querySelectorAll('#lapLegend .lgItem')].map(e => e.querySelector('.tyre') ? 'T:' + e.textContent : 'D:' + e.textContent).slice(0, 4).join(),
    dot: [...document.querySelectorAll('#dotLegend .lgItem')].map(e => e.querySelector('.tyre') ? 'T:' + e.textContent : 'D:' + e.textContent).slice(0, 4).join() }));
  t.check('the tyre keys come first on both plots, in the same order (soft, medium, hard)', keys.lap === 'T:Soft,T:Medium,D:DA0,D:DA1' && keys.dot === 'T:Soft,T:Medium,D:DA0,D:DA1', JSON.stringify(keys));
  t.check('the box plot checkbox flows to the right end of the options line', await p.evaluate(() => { const row = document.querySelector('#dotCard .plotOpts').getBoundingClientRect(), box = document.getElementById('boxChk').closest('label').getBoundingClientRect(), first = document.querySelector('#dotCard .plotOpts .optCheck').getBoundingClientRect();
    return box.right > row.right - 6 && box.left > first.right + 40; }));
  t.check('the box plot is drawn over the dots, not under them', await p.evaluate(() => { const pl = dotChart.config.plugins.find(x => x.id === 'dotBoxes'); return !!pl.afterDatasetsDraw && !pl.beforeDatasetsDraw; }));
  await p.evaluate(() => { calendar.raceNames[13] = 'Formula 1 Qatar Airways Dutch Grand Prix 2026'; render(); });
  t.check('race names are the site’s short names ("Dutch GP"), with "Round 13" where the calendar has no proper name', await p.$eval('#sectorSub', e => e.textContent) === 'Dutch GP · FP2' && await p.evaluate(() => { const was = calendar.raceNames[13]; calendar.raceNames[13] = 'Round 13 Grand Prix'; const t = raceTitle(); calendar.raceNames[13] = was; return t; }) === 'Round 13');

  // ---- hiding the outliers rescales the axes to what is shown ----
  await p.check('#lapCard .slowChk'); await p.waitForTimeout(100);
  await p.evaluate(() => { const best = O.sessionBest(model.laps); model.laps.filter(l => l.t > best * 1.07 && !l.out && !l.inn).forEach(l => outliers.add(l.d + ':' + l.n)); render(); }); // mark every slow lap
  const axesOn = await p.evaluate(() => ({ dotMax: dotChart.scales.x.max, lapMax: lapChart.scales.y.max }));
  await p.uncheck('#dotCard .outChk'); await p.waitForTimeout(100);
  const axesOff = await p.evaluate(() => ({ dotMax: dotChart.scales.x.max, lapMax: lapChart.scales.y.max }));
  t.check('with outliers shown the axes include the slow outliers; hidden, both plots rescale to the laps that are left', axesOff.dotMax < axesOn.dotMax - 10 && axesOff.lapMax < axesOn.lapMax - 10, JSON.stringify([axesOn, axesOff]));
  await p.check('#dotCard .outChk'); await p.click('#dotCard .resetOut'); await p.uncheck('#lapCard .slowChk'); await p.waitForTimeout(100);

  // ---- slow laps: one setting for both plots ----
  const nd = () => p.evaluate(() => [lapChart.data.datasets.flatMap(d => d.data).filter(q => q.y !== null).length, dotChart.data.datasets[0].data.length]);
  t.check('slow laps are left out by default: 41 laps', (await nd()).join() === '41,41');
  await p.check('#lapCard .slowChk'); await p.waitForTimeout(100);
  t.check('"Include slow laps" on the line plot adds the six cool-down laps to both plots, and ticks the other plot’s box', (await nd()).join() === '47,47' && await p.$eval('#dotCard .slowChk', e => e.checked) && /all laps/.test(await p.$eval('#dotSub', e => e.textContent)));
  await p.uncheck('#dotCard .slowChk'); await p.waitForTimeout(100);
  t.check('…and unticking it on the dot plot takes them off both', (await nd()).join() === '41,41' && !(await p.$eval('#lapCard .slowChk', e => e.checked)));
  t.check('the Include slow laps box is not in the picker card any more', await p.$('#pickCard .slowChk') === null);

  // ---- the box plot overlay ----
  t.check('the box plot is on by default and the dots are not violins: a dot per lap, coloured by the tyre', await p.$eval('#boxChk', e => e.checked) && await p.evaluate(() => dotChart.config.type === 'scatter' && dotChart.data.datasets[0].pointBackgroundColor.includes('#e53935') && dotChart.data.datasets[0].pointBackgroundColor.includes('#fbc02d')));
  const withBox = await p.evaluate(() => document.getElementById('dotCanvas').toDataURL());
  await p.uncheck('#boxChk'); await p.waitForTimeout(100);
  const noBox = await p.evaluate(() => document.getElementById('dotCanvas').toDataURL());
  t.check('turning the box plot off redraws the dots without the boxes', withBox !== noBox && /box=0/.test((await state(p)).url) && !/box plot|The box is/.test(await p.$eval('#dotNote', e => e.textContent)));
  await p.check('#boxChk');

  // ---- the sector table and the best vs ideal plot ----
  s = await state(p);
  t.check('sector table: a row per driver, fastest best lap first', s.table.map(r => r[0]).join() === 'DA0,DA1,DB0,DB1,DC0,DC1', JSON.stringify(s.table.map(r => r[0])));
  const a = s.table[0];
  t.check('the ideal lap is the three sectors added and is quicker than the best lap', Math.abs(num(a[2]) + num(a[3]) + num(a[4]) - num(a[5])) < 0.002 && num(a[5]) < num(a[1]) && /^\+0\.\d{3}$/.test(a[6]), JSON.stringify(a));
  t.check('the session-best cells are marked (best lap, three sectors, ideal lap: one each)', s.best === 5, String(s.best));
  const d = await p.evaluate(() => ({ sets: dumbChart.data.datasets.map(x => [x.label, x.data.length]), best: dumbChart.data.datasets[0].data.map(q => q.x), ys: dumbChart.data.datasets[0].data.map(q => q.y),
    ideal: dumbChart.data.datasets[1].data.map(q => q.x), rev: dumbChart.options.scales.y.reverse, ticks: dumbChart.options.scales.y.ticks.callback(0) + dumbChart.options.scales.y.ticks.callback(5),
    tip: dumbChart.options.plugins.tooltip.enabled, xmin: dumbChart.options.scales.x.min, labels: dumbChart._labels, hollow: dumbChart.data.datasets[1].backgroundColor }));
  t.check('best vs ideal: lap time on x, a best-lap dot and an ideal-lap dot per driver, ideal quicker than best', d.sets.join() === 'Best lap,6,Ideal lap,6' && d.ideal.every((v, i) => v < d.best[i]), JSON.stringify(d.sets));
  t.check('…sorted by best lap with the fastest at the top, drivers named on the y axis', d.best.every((v, i, x) => !i || v >= x[i - 1]) && d.rev === true && d.ys.join() === '0,1,2,3,4,5' && d.ticks === 'DA0DC1', JSON.stringify([d.ys, d.rev, d.ticks]));
  t.check('…each dot is labelled with its time instead of a tooltip: the best lap to its right, the ideal lap to its left', d.tip === false && d.labels.length === 12 &&
    d.labels.filter(l => l.side === 'right').map(l => l.text).join() === '1:30.020,1:30.390,1:30.760,1:31.130,1:31.500,1:31.890' && d.labels.filter(l => l.side === 'left').map(l => l.text).join() === '1:30.000,1:30.370,1:30.740,1:31.110,1:31.480,1:31.850', JSON.stringify(d.labels.slice(0, 2)));
  t.check('…and the axis is widened so the labels fit inside the chart', d.xmin < Math.min(...d.ideal) - 0.05 && d.labels.every(l => l.side === 'right' || l.dotX - 11 > 0));

  // ---- interactions never fetch ----
  const n0 = p.openf1Hits.length, api0 = p.apiHits.length;
  await p.click('#pacePicker input[data-id="d0_1"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('unpicking a driver removes them from every view', !s.lines.includes('DA1') && !s.bars.includes('DA1') && !s.dumb.includes('DA1') && !s.table.some(r => r[0] === 'DA1') && s.lines.length === 5 && s.dots === 34, JSON.stringify(s.lines));
  t.check('…and the summary counts them', await p.$eval('#pickerSummary', e => e.textContent) === '5 of 6 drivers');
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(100);
  t.check('None: every card says there is nothing to show', await p.evaluate(() => ['lap', 'dot', 'dumb', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')));
  await p.click('#presetRow [data-preset="fast5"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('Fastest 5 picks the five quickest in the session', s.rows.filter(r => r[1]).map(r => r[0]).join() === 'd0_0,d0_1,d1_0,d1_1,d2_0', JSON.stringify(s.rows));
  await p.selectOption('#speedSel', 'i1'); await p.selectOption('#sectorCard .tsortSel', 'gap'); await p.waitForTimeout(100);
  t.check('the speed point changes the bars (intermediate 1: 284 km/h tops the five)', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 176.5);
  t.check('sorting by gap to ideal reorders the table', (await state(p)).table.map(r => r[6]).every((g, i, x) => !i || num(g.slice(1)) >= num(x[i - 1].slice(1))));
  await p.selectOption('#speedSel', 'st');
  t.check('none of that fetched anything', p.openf1Hits.length === n0 && p.apiHits.length === api0, hits(p));

  // ---- mph (the default) and kph ----
  t.check('mph is the default: bars to 0.1, axis and the pill', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 199.5 && await p.evaluate(() => speedChart.options.scales.x.title.text) === 'mph' && await p.$eval('#unitRow [data-unit="mph"]', e => e.classList.contains('active')));
  t.check('…and the tooltip says mph with one decimal', await p.evaluate(() => speedChart.options.plugins.tooltip.callbacks.label({ parsed: { x: 199.46 } })) === ' 199.5 mph');
  t.check('the address leaves the default unit out', !/unit=/.test((await state(p)).url), (await state(p)).url);
  t.check('the CSV names the unit', await (async () => { const dl = p.waitForEvent('download'); await p.click('#speedCard .exp-csv'); const f = await dl; return /^﻿Driver,mph\r\nDA0,199\.5/.test(require('fs').readFileSync(await f.path(), 'utf8')); })());
  await p.click('#unitRow [data-unit="kph"]'); await p.waitForTimeout(100);
  t.check('kph: whole numbers, as OpenF1 gives them', await p.evaluate(() => [speedChart.data.datasets[0].data[0], speedChart.options.scales.x.title.text].join()) === '321,kph' && /unit=kph/.test((await state(p)).url));
  await p.reload(); await ready(p);
  t.check('the unit is remembered for the next visit', await p.$eval('#unitRow [data-unit="kph"]', e => e.classList.contains('active')) && await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 321);
  await p.click('#unitRow [data-unit="mph"]');

  // ---- the address, and the picks carry between pages (the shared selection) ----
  await p.click('#presetRow [data-preset="none"]'); await p.click('#pacePicker input[data-id="d1_0"]'); await p.waitForTimeout(100);
  const link = await p.evaluate(() => location.pathname + location.search);
  t.check('the address carries the season and the drivers', /^\/pace\.html\?season=2026&d=d1_0/.test(link), link);
  await p.goto('http://site.test/drivers.html'); await h.loaded(p);
  t.check('drivers picked here are picked on the Drivers page', (await pickedOn(p, 'driverPicker')).join() === 'd1_0', (await pickedOn(p, 'driverPicker')).join());
  await p.click('#driverPicker input[data-id="d2_0"]'); await p.waitForTimeout(100);
  await p.goto('http://site.test/pace.html'); await ready(p);
  t.check('…and drivers picked there are picked here', [...(await state(p)).rows.filter(r => r[1]).map(r => r[0])].sort().join() === 'd1_0,d2_0', JSON.stringify((await state(p)).rows));
  await p.done();

  // ---- the round: the slider selects the weekend, loaded on release; the Race; qualifying parts ----
  p = await open(); await ready(p);
  const n1 = p.openf1Hits.length;
  await release(p, 12); await p.waitForTimeout(200);
  t.check('moving the slider changes the label but fetches nothing until it is let go', /Round 12 of 13/.test((await state(p)).label) && p.openf1Hits.length === n1 && /let go of the slider/.test((await state(p)).status), `${(await state(p)).label} ${(await state(p)).status}`);
  await commit(p); await ready(p);
  s = await state(p);
  t.check('letting go loads that weekend, all its sessions enabled, on the Race (the latest that has run), and the classifications of the sessions that have finished', hits(p) === 'sessions,laps,stints,drivers,laps,stints,drivers,session_result,session_result' && s.chips.map(c => c[0]).join() === 'FP1,FP2,FP3,Quali,Race' && s.chips.every(c => !c[2]) && s.chips.find(c => c[1])[0] === 'Race' && /Race/.test(s.status), hits(p) + JSON.stringify(s.chips));

  t.check('the Race plots lap by lap', await p.evaluate(() => lapChart.options.scales.x.title.text) === 'Lap of the race' && (await state(p)).lines.length > 0);

  // ---- the shared sort (the list and both lap plots), its session defaults and its lock ----
  const orders = q => q.evaluate(() => { const codes = sel => [...document.querySelectorAll(sel)].map(e => e.dataset.code || e.textContent);
    return { picker: [...document.querySelectorAll('#pacePicker .pickerCodeTag')].map(e => e.textContent).join(), picked: [...document.querySelectorAll('#pacePicker .pickerRow')].filter(r => r.querySelector('input').checked).map(r => r.querySelector('.pickerCodeTag').textContent).join(),
      lines: lapChart.data.datasets.filter(d => !d._outlier).map(d => d.label).join(), legend: codes('#lapLegend .lgItem[data-code]').join(), dots: dotRows.map(r => r.e.label).join(), dotLegend: codes('#dotLegend .lgItem[data-code]').join(),
      sels: [...document.querySelectorAll('.sortSeg')].map(x => x.value).join(), locks: [...document.querySelectorAll('.sortLock')].map(b => b.getAttribute('aria-pressed')).join(), url: location.search,
      opts: [...document.querySelector('#lapCard .sortSeg').options].map(o => o.textContent).join(), ranks: [...document.querySelectorAll('#pacePicker .pickerRank')].map(e => e.textContent).join() }; });
  const followed = (o, order) => { const want = order.split(',').filter(c => o.picked.split(',').includes(c)).join(); return o.lines === want && o.legend === want && o.dots === want && o.dotLegend === want; };
  let od = await orders(p);
  t.check('on the Race the sort defaults to the GP result, and the options offer the results of the sessions that have finished', od.sels === 'gp,gp,gp' && od.opts === 'Team,Ranking,Fastest Lap,Median Lap,GP Result,Quali Result', JSON.stringify([od.sels, od.opts]));
  t.check('…the list is in finishing order, numbered by the result', od.picker === 'DB0,DA1,DC1,DA0,DC0,DB1' && od.ranks === '1,2,3,4,5,6', JSON.stringify([od.picker, od.ranks]));
  t.check('…and the lap lines, their legend, the dot plot rows and their legend follow it', followed(od, 'DB0,DA1,DC1,DA0,DC0,DB1'), JSON.stringify(od));
  t.check('the lock is off to begin with, on all three controls', od.locks === 'false,false,false' && await p.$$eval('.sortLock', b => b.every(x => /unlocked/i.test(x.getAttribute('aria-label')) && !!x.querySelector('svg'))));
  await p.click('.sessBtn:has-text("Quali")'); await ready(p);
  od = await orders(p);
  t.check('unlocked, choosing the Quali session moves the sort to the Quali result', od.sels === 'quali,quali,quali' && od.picker === 'DC0,DA0,DB1,DA1,DB0,DC1' && followed(od, od.picker), JSON.stringify(od));
  await p.selectOption('#dotCard .sortSeg', 'median'); await p.waitForTimeout(100);
  od = await orders(p);
  t.check('choosing a sort on one plot sets the list and the other plot too (Median Lap: the median shows in the list)', od.sels === 'median,median,median' && followed(od, od.picker) && /^1:3\d\.\d{3}$/.test(await p.$eval('#pacePicker .pickerPts', e => e.textContent)) && /sort=median/.test(od.url), JSON.stringify(od));
  t.check('…and picking it did not lock it', od.locks === 'false,false,false' && !/lock=1/.test(od.url));
  await p.click('.sessBtn:has-text("FP2")'); await ready(p);
  od = await orders(p);
  t.check('unlocked, the next session brings the sort back to the session’s own (the fastest lap in practice)', od.sels === 'fast,fast,fast' && !/sort=/.test(od.url), JSON.stringify([od.sels, od.url]));
  await p.selectOption('#lapCard .sortSeg', 'rank'); await p.click('#lapCard .sortLock'); await p.waitForTimeout(100);
  od = await orders(p);
  t.check('the lock is one setting on all three controls, and is kept in the address', od.locks === 'true,true,true' && /lock=1/.test(od.url) && /sort=rank/.test(od.url), JSON.stringify([od.locks, od.url]));
  await p.click('.sessBtn:has-text("Race")'); await ready(p);
  od = await orders(p);
  t.check('locked, changing the session leaves the sort alone', od.sels === 'rank,rank,rank' && followed(od, od.picker), JSON.stringify(od));
  await p.click('#pickCard .sortLock'); await p.click('.sessBtn:has-text("Quali")'); await ready(p);
  od = await orders(p);
  t.check('unlocked again, it follows the session', od.locks === 'false,false,false' && od.sels === 'quali,quali,quali');
  await p.click('.sessBtn:has-text("Quali")'); await ready(p);
  const q = await p.evaluate(() => ({ title: lapChart.options.scales.x.title.text, seg: model.segments.map(g => g.label).join(), first: lapChart.data.datasets[0].data[0].x, plug: lapChart.config.plugins.map(x => x.id).join(),
    x: lapChart.data.datasets.flatMap(d => d.data).filter(v => v.y !== null).map(v => v.x), note: document.getElementById('lapNote').textContent }));
  t.check('qualifying: time into the session on the x axis, so the parts line up for every driver', q.title === 'Minutes into the session' && Math.min(...q.x) === 4 && Math.max(...q.x) > 47, JSON.stringify([q.title, q.first]));
  t.check('…with Q1, Q2 and Q3 marked by a dashed line between them (from the race control messages)', q.seg === 'Q1,Q2,Q3' && /qualiParts/.test(q.plug) && /qualifying parts/.test(q.note) && /race_control/.test(hits(p)), q.seg + hits(p));
  const qpx = await p.evaluate(() => { const r = document.getElementById('lapCanvas').getBoundingClientRect(); document.getElementById('lapCanvas').scrollIntoView({ block: 'center' }); const r2 = document.getElementById('lapCanvas').getBoundingClientRect();
    return [r2.left + lapChart.scales.x.getPixelForValue(25.2), r2.top + lapChart.chartArea.top + 40]; });
  await p.mouse.move(qpx[0], qpx[1]); await p.waitForTimeout(100);
  const qtip = await p.$eval('#lapTip', e => ({ hidden: e.hidden, head: e.querySelector('.tipHead')?.textContent, rows: e.querySelectorAll('.tipRow').length }));
  t.check('hovering in qualifying shows the drivers’ laps near that moment', !qtip.hidden && /into the session/.test(qtip.head) && qtip.rows === 6, JSON.stringify(qtip));
  await p.click('.sessBtn:has-text("FP2")'); await ready(p);
  t.check('practice has no parts again', await p.evaluate(() => !model.segments.length && lapChart.options.scales.x.title.text === 'Minutes into the session'));
  await p.selectOption('#lapCard .sortSeg', 'gp'); await p.click('#lapCard .sortLock'); await p.waitForTimeout(100);
  await release(p, 13); await commit(p); await ready(p);
  od = await orders(p);
  t.check('locked on a result the new weekend does not have yet, the sort falls back to the session’s own (the lock stays)', od.sels === 'fast,fast,fast' && od.locks === 'true,true,true' && !/GP Result/.test(od.opts), JSON.stringify([od.sels, od.opts]));
  await p.goto('http://site.test/drivers.html'); await h.loaded(p);
  t.check('the round is carried to the Drivers page', await p.evaluate(() => F1Controls.state.round) === 12);
  await h.setRound(p, 10);
  await p.goto('http://site.test/pace.html'); await ready(p, /timed laps|no lap data|no sessions/);
  s = await state(p);
  t.check('…and the round chosen there is carried here: a round with no OpenF1 weekend says so, with nothing drawn', s.slider[0] === 10 && /no sessions for round 10/.test(s.status) && s.lines === null, JSON.stringify([s.slider, s.status]));
  await p.done();

  // ---- a sprint weekend has the sprint results too; a link restores the sort and the lock ----
  p = await open(); await ready(p);
  await release(p, 11); await commit(p); await ready(p);
  let sp = await orders(p);
  t.check('the sprint weekend: five sessions, and the result sorts of all four', (await state(p)).chips.map(c => c[0]).join() === 'FP1,Sprint Quali,Sprint,Quali,Race' && sp.opts === 'Team,Ranking,Fastest Lap,Median Lap,GP Result,Sprint Result,Quali Result,Sprint Quali Result', JSON.stringify([(await state(p)).chips.map(c => c[0]).join(), sp.opts]));
  await p.click('.sessBtn[title="Sprint Qualifying"]'); await ready(p);
  sp = await orders(p);
  t.check('Sprint Quali defaults to the Sprint Quali result', sp.sels === 'sprintquali,sprintquali,sprintquali' && sp.picker === 'DC1,DC0,DA0,DA1,DB0,DB1' && followed(sp, sp.picker), JSON.stringify(sp));
  await p.click('.sessBtn[title="Sprint"]'); await ready(p);
  sp = await orders(p);
  t.check('the Sprint defaults to the Sprint result; a driver who did not start is last, with no number', sp.sels === 'sprint,sprint,sprint' && sp.picker === 'DA1,DA0,DB0,DC0,DB1,DC1' && sp.ranks === '1,2,3,4,5', JSON.stringify([sp.picker, sp.ranks]));
  t.check('the Sprint plots by lap number, the other sessions by minutes', await p.evaluate(() => lapChart.options.scales.x.title.text) === 'Lap of the race');
  await p.done();
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&round=12&sort=median&lock=1&session=Quali'); await ready(p);
  sp = await orders(p);
  t.check('a link restores the sort and the lock', sp.sels === 'median,median,median' && sp.locks === 'true,true,true' && /Qualifying/.test((await state(p)).status), JSON.stringify([sp.sels, sp.locks]));
  await p.done();
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&round=12&sort=sprint'); await ready(p);
  t.check('a link with a sort that weekend does not have is ignored', (await orders(p)).sels === 'gp,gp,gp');
  await p.done();

  // ---- the cache, a reserve driver the season has not seen ----
  p = await open(); await ready(p);
  await p.click('.sessBtn:has-text("FP1")'); await ready(p);
  s = await state(p);
  const rz = await p.evaluate(() => { const r = [...document.querySelectorAll('#pacePicker .pickerRow')].pop(); return { text: r.textContent.replace(/\s+/g, ' ').trim(), flag: r.querySelectorAll('.flag').length, dot: r.querySelector('.pickerDot').style.backgroundColor, checked: r.querySelector('input').checked }; });
  t.check('a driver not in the season data is listed last, without a flag, in OpenF1’s colour, and is not picked', s.rows.length === 7 && s.rows[6][0] === 'of1:ZZZ' && rz.flag === 0 && rz.dot === 'rgb(17, 17, 17)' && !rz.checked && /Zed Reserve/.test(rz.text), JSON.stringify(rz));
  t.check('clicking FP1 loads that session; the address has it', /session=FP1/.test(s.url) && /Practice 1/.test(s.status), s.url);
  await p.click('.sessBtn:has-text("FP2")'); await ready(p);
  t.check('going back to a session already loaded is served from the cache', p.openf1Hits.length === 7, hits(p));
  await p.reload(); await ready(p);
  t.check('reloading the page opens the same weekend from the cache with no more OpenF1 requests', p.openf1Hits.length === 7 && /Practice 2/.test((await state(p)).status), hits(p));
  const hitsBefore = p.openf1Hits.length;
  await p.click('#refreshSession'); await ready(p);
  t.check('Refresh session fetches the session again (and nothing else)', hits(p).split(',').slice(hitsBefore).join() === 'laps,stints,drivers', hits(p));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- a link restores the setup ----
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&session=FP1&slow=1&unit=kph&speed=i1&tsort=gap&sort=fast&out=0&box=0&d=d1_0,d2_0'); await ready(p);
  s = await state(p);
  t.check('a shared link restores session, drivers, options and unit', s.chips.find(c => c[1])[0] === 'FP1' && s.rows.filter(r => r[1]).map(r => r[0]).sort().join() === 'd1_0,d2_0' &&
    await p.$$eval('.slowChk', c => c.every(x => x.checked)) && await p.$$eval('.outChk', c => c.every(x => !x.checked)) && !(await p.$eval('#boxChk', e => e.checked)) && await p.$eval('#speedSel', e => e.value) === 'i1' &&
    await p.$eval('#sectorCard .tsortSel', e => e.value) === 'gap' && await p.$eval('#dumbCard .tsortSel', e => e.value) === 'gap' && await p.$eval('#pickCard .sortSeg', e => e.value) === 'fast' && await p.$eval('#unitRow [data-unit="kph"]', e => e.classList.contains('active')), JSON.stringify(s.rows));
  await p.done();
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&round=11'); await ready(p);
  t.check('a link with a round opens that weekend', (await state(p)).slider[0] === 11 && /Race/.test((await state(p)).status));
  await p.done();

  // ---- OpenF1 closed for a live session; saved copies of finished sessions ----
  const O = require('../site/openf1.js');
  const snapOf = key => { const x = fx.SESSIONS.find(q => q.session_key === key); return O.compact({ laps: fx.lapsFor(key), stints: fx.stintsFor(key), drivers: fx.driversFor(key), raceControl: fx.raceControlFor(key), result: fx.resultFor(key) }, { key, year: 2026, name: x.session_name }, Date.parse(fx.NOW)); };
  const listFile = { v: 1, year: 2026, generatedAt: Date.parse(fx.NOW) - 3600e3, sessions: fx.SESSIONS.map(x => Object.fromEntries(O.SESSION_FIELDS.map(f => [f, x[f] === undefined ? null : x[f]]))) };
  const saved = { list: { 2026: listFile }, sessions: { 201: snapOf(201), 202: snapOf(202), 104: snapOf(104), 105: snapOf(105), 101: snapOf(101), 102: snapOf(102), 103: snapOf(103) } };

  p = await open({ pace: saved }); await ready(p);
  t.check('with a saved copy, the session comes from the site: no laps, stints or drivers request to OpenF1', hits(p) === 'sessions' && p.paceHits.some(u => /pace\/2026\/202\.json/.test(u)) && (await state(p)).lines.length === 6 && /65 timed laps · saved/.test((await state(p)).status), hits(p) + (await state(p)).status);
  await p.click('#refreshSession'); await ready(p);
  t.check('Refresh session skips the saved copy and asks OpenF1', hits(p) === 'sessions,laps,stints,drivers' && /fetched/.test((await state(p)).status), hits(p));
  await p.done();

  const closed = { live: true };
  p = await open({ openf1: closed, pace: saved }); await ready(p);
  s = await state(p);
  t.check('while a session is live (OpenF1 answers 401), saved copies carry the whole page: the list, the session, its charts', s.chips.length === 5 && s.chips.find(c => c[1])[0] === 'FP2' && s.lines.length === 6 && s.dots === 41 && !p.errors.length, JSON.stringify([s.chips, s.lines]));
  t.check('…it asked OpenF1 for the session list once (closed) and read the rest from saved files', hits(p) === 'sessions', hits(p));
  await p.click('.sessBtn:has-text("FP1")'); await ready(p);
  t.check('…and another finished session too (a reserve driver and all)', (await state(p)).rows.length === 7 && /Practice 1/.test((await state(p)).status));
  await release(p, 12); await commit(p); await ready(p);
  t.check('…and another weekend, with its results sorts from the saved classifications', (await state(p)).chips.find(c => c[1])[0] === 'Race' && (await orders(p)).sels === 'gp,gp,gp' && (await orders(p)).picker === 'DB0,DA1,DC1,DA0,DC0,DB1' && !hits(p).includes('session_result'), hits(p));
  await p.done();

  // the session that is live now has no saved copy: the latest finished one is shown, with the reason
  const duringFP3 = { live: true };
  p = await open({ openf1: duringFP3, pace: saved, now: '2026-08-29T11:00:00Z' }); await ready(p);
  s = await state(p);
  t.check('a session that is live and not saved: the latest finished session of the weekend is shown instead, and the page says why', s.chips.find(c => c[1])[0] === 'FP2' && /Practice 3 is live: OpenF1 is closed to the public while a session is live \(until about [\d:]+\s?[AP]M\); showing Practice 2/.test(s.status) && s.lines.length === 6, s.status);
  await p.click('.sessBtn:has-text("FP3")'); await h.loaded(p); await p.waitForSelector('#retry', { timeout: 10000 });
  const closedMsg = await p.$eval('#paceStatus', e => ({ text: e.textContent, err: e.classList.contains('err') }));
  t.check('choosing the live session yourself says OpenF1 is closed (until when) and that it is not saved yet, with Retry', closedMsg.err && /OpenF1 is closed to the public while a session is live \(until about [\d:]+\s?[AP]M\), and Practice 3 is not saved here yet\. Retry/.test(closedMsg.text) && (await state(p)).lines === null, closedMsg.text);
  await p.done();

  // nothing saved and OpenF1 closed: a plain message, and it recovers when OpenF1 opens
  const gate = { live: true };
  p = await open({ openf1: gate }); await h.loaded(p); await p.waitForSelector('#retry', { timeout: 10000 });
  t.check('closed with nothing saved: the page says so (not "couldn’t load") and offers Retry', /OpenF1 is closed to the public while a session is live, and this season’s sessions are not saved here yet/.test(await p.$eval('#paceStatus', e => e.textContent)) && p.errors.length === 0);
  gate.live = false; await p.click('#retry'); await ready(p);
  t.check('…and Retry works once OpenF1 is open again', (await state(p)).lines.length === 6);
  await p.done();

  // an older cached answer when closed
  const later = { live: false };
  p = await open({ openf1: later }); await ready(p);
  await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('f1o:v1:')).forEach(k => { const o = JSON.parse(localStorage.getItem(k)); o.t = 1; localStorage.setItem(k, JSON.stringify(o)); })); // everything cached is old now
  later.live = true; await p.reload(); await ready(p);
  s = await state(p);
  t.check('closed, with only older cached answers: they are shown, marked as older, with why', s.lines.length === 6 && /an older saved list of the sessions; OpenF1 is closed to the public while a session is live|an older saved copy; OpenF1 is closed/.test(s.status), s.status);
  await p.done();

  // OpenF1's free limit: 3 requests a second
  const limited = { rate: { left: 2 } };
  p = await open({ openf1: limited }); await ready(p);
  t.check('a 429 from OpenF1 is waited out and the request tried again: the page still loads', (await state(p)).lines.length === 6 && p.openf1Hits.length === 4 + 2, hits(p));
  await p.done();
  p = await open({ spacing: 300 }); await ready(p);
  const gaps = p.openf1Times.slice(1).map((x, i) => x - p.openf1Times[i]);
  t.check('requests to OpenF1 go out at least ~300 ms apart (3 a second is its free limit)', p.openf1Times.length === 4 && gaps.every(g => g >= 250), JSON.stringify(gaps));
  await p.done();

  // ---- failing ----
  let broken = true;
  p = await open({ openf1: { fail: u => broken && u.includes('/laps') } });
  await h.loaded(p); await p.waitForSelector('#retry', { timeout: 10000 });
  t.check('a failed session shows the error and a Retry button', /Couldn’t load this session/.test(await p.$eval('#paceStatus', e => e.textContent)) && await p.$eval('#paceStatus', e => e.classList.contains('err')) && (await state(p)).lines === null);
  broken = false; await p.click('#retry'); await ready(p);
  t.check('Retry loads it', /timed laps/.test(await p.$eval('#paceStatus', e => e.textContent)) && (await state(p)).lines.length === 6);
  await p.done();

  p = await open({ openf1: { fail: () => true } });
  await h.loaded(p); await p.waitForSelector('#retry', { timeout: 10000 });
  t.check('a failed session list shows the error too', /Couldn’t load the sessions/.test(await p.$eval('#paceStatus', e => e.textContent)));
  await p.done();

  p = await open({ openf1: { empty: [202] } }); await ready(p);
  s = await state(p);
  t.check('a session with no data yet says so, with nothing drawn', /no lap data yet/.test(s.status) && s.lines === null && await p.evaluate(() => ['lap', 'dot', 'dumb', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')), s.status);
  await p.done();

  // ---- navigation, export ----
  p = await open(); await ready(p);
  const nav = await p.evaluate(() => ({ label: document.querySelector('#siteNav .nav-current').textContent, links: [...document.querySelectorAll('#siteNav .nav-menu a')].map(a => a.getAttribute('href')),
    current: document.querySelector('#siteNav [aria-current="page"]')?.getAttribute('href'), title: document.title }));
  t.check('the Pages menu lists Weekend Pace last and marks it; the tab names the season', nav.label === 'Weekend Pace' && nav.current === 'pace.html' && nav.links.join() === 'eras.html,drivers.html,constructors.html,whatif.html,position.html,simulator.html,pace.html' && /^2026 Weekend Pace/.test(nav.title), JSON.stringify(nav));
  t.check('each card has a PNG and CSV link', await p.$$eval('.exportRow', r => r.length) === 5);
  const dl = p.waitForEvent('download');
  await p.click('#lapCard .exp-csv');
  const file = await dl;
  const body = require('fs').readFileSync(await file.path(), 'utf8');
  t.check('the lap CSV has every lap of the picked drivers, with what is shown and what is an outlier marked', file.suggestedFilename() === 'f1-2026-pace-laps-r13.csv' && /^﻿Driver,Team,Lap,Time \(s\)/.test(body) && /,Shown,Outlier\r\n/.test(body) && body.trim().split('\r\n').length === 1 + 66, `${file.suggestedFilename()} ${body.split('\n').length}`);
  const dl2 = p.waitForEvent('download'); await p.click('#sectorCard .exp-csv'); const f2 = await dl2;
  t.check('the sector table has a CSV too', /^﻿Driver,Best lap,S1,S2,S3,Ideal lap,Gap/.test(require('fs').readFileSync(await f2.path(), 'utf8')));
  const dl3 = p.waitForEvent('download'); await p.click('#dumbCard .exp-csv'); const f3 = await dl3;
  t.check('so does the best vs ideal plot', /^﻿Driver,Best lap \(s\),Ideal lap \(s\),Gap \(s\)/.test(require('fs').readFileSync(await f3.path(), 'utf8')));
  await p.done();

  // ---- themes and phone ----
  for(const theme of ['light', 'dark']) for(const width of [1000, 390]){
    p = await open({ theme, width }); await ready(p);
    await h.screenshot(p, `pace-${width}-${theme}.png`);
    const r = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, pb: getComputedStyle(document.querySelector('#sectorTable td.best')).color }));
    t.check(`${theme} ${width}px: nothing overflows the screen`, r.scroll <= width, JSON.stringify(r));
    t.check(`${theme} ${width}px: session-best cells are purple, in the theme's own tone`, r.pb === (theme === 'dark' ? 'rgb(206, 147, 216)' : 'rgb(142, 36, 170)'), r.pb);
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
