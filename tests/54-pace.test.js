// #186: the Weekend Pace page — the shared season/round controls (the slider reaches this weekend), session picker, the site's drivers/teams
// pickers, lap-time lines, ridgeline, best vs ideal lap, sector table, top speed (km/h, mph), share link, cache, errors and themes.
// OpenF1 is answered by lib/openf1-fixture.js (rounds 11–13 of the fake season; round 13 has run FP1 and FP2 at the fixed "now").
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const open = (opts = {}) => h.openPage('pace', { openf1: {}, now: fx.NOW, ...opts });
  const ready = async (p, text = /timed laps|no lap data|no practice|Couldn’t/) => { await h.loaded(p); await p.waitForFunction(re => new RegExp(re).test(document.getElementById('paceStatus').textContent), text.source, { timeout: 10000 }); await p.waitForTimeout(100); };
  const hits = p => p.openf1Hits.map(u => new URL(u).pathname.replace('/v1/', '')).join();
  const release = (p, round) => p.evaluate(r => { const s = document.querySelector('.f1c-round'); s.value = r; s.dispatchEvent(new Event('input')); }, round);
  const commit = p => p.evaluate(() => document.querySelector('.f1c-round').dispatchEvent(new Event('change')));
  const state = p => p.evaluate(() => ({
    status: document.getElementById('paceStatus').textContent,
    label: document.querySelector('.f1c-roundlabel').textContent, slider: [+document.querySelector('.f1c-round').value, +document.querySelector('.f1c-round').max],
    chips: [...document.querySelectorAll('.sessBtn')].map(b => [b.textContent, b.classList.contains('on'), b.disabled]),
    rows: [...document.querySelectorAll('#pacePicker input')].map(i => [i.dataset.id, i.checked]),
    lines: lapChart ? lapChart.data.datasets.map(d => d.label) : null,
    ridges: ridgeChart ? ridgeChart.data.datasets.filter(d => !d._baseline).map(d => d._code) : null,
    bars: speedChart ? speedChart.data.labels.slice() : null,
    dumb: dumbChart ? dumbChart._rows.map(r => r.e.label) : null,
    table: [...document.querySelectorAll('#sectorTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    best: document.querySelectorAll('#sectorTable td.best').length,
    url: location.pathname + location.search,
  }));
  const num = s => { const m = s.match(/^(?:(\d+):)?([\d.]+)$/); return (m[1] ? +m[1] * 60 : 0) + parseFloat(m[2]); };
  const pickedOn = (p, picker) => p.$$eval(`#${picker} input:checked`, is => is.map(i => i.dataset.id));

  // ---- first view: the shared controls, the weekend that is on ----
  let p = await open(); await ready(p);
  let s = await state(p);
  t.check('the shared season controls are there, and the slider reaches round 13, the weekend that is on', s.slider.join() === '13,13' && s.label === 'Round 13 of 13 — Round 13 Grand Prix' && await p.$('.f1c-year') !== null, JSON.stringify([s.slider, s.label]));
  t.check('…with the circuit country’s flag before the round name, like the other pages', await p.$('.f1c-roundlabel .flag') !== null);
  t.check('the controls say the weekend is added', /12 rounds loaded · race weekend of round 13/.test(await p.$eval('.f1c-status', e => e.textContent)));
  t.check('opens on the latest session that has run (FP2); FP3 and Quali are disabled', s.chips.map(c => c[0]).join() === 'FP1,FP2,FP3,Quali' && s.chips.find(c => c[1])?.[0] === 'FP2' && s.chips.filter(c => c[2]).map(c => c[0]).join() === 'FP3,Quali', JSON.stringify(s.chips));
  t.check('the status line names the session, drivers and laps', /Practice 2 · 6 drivers · 65 timed laps/.test(s.status), s.status);
  t.check('loads the sessions and the one session once each (4 requests)', hits(p) === 'sessions,laps,stints,drivers', hits(p));
  t.check('the Share button is the shared one', await p.$('.f1c-share') !== null);
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));

  // ---- the site's pickers: flags, numbers, team groups, the site's team colours ----
  const pk = await p.evaluate(() => ({
    teams: [...document.querySelectorAll('#pacePicker .pickerTeamLabel')].map(e => e.textContent),
    flags: document.querySelectorAll('#pacePicker .pickerRow .flag').length, nums: [...document.querySelectorAll('#pacePicker .pickerNum')].map(e => e.textContent).join(),
    tags: [...document.querySelectorAll('#pacePicker .pickerCodeTag')].map(e => e.textContent).join(), names: [...document.querySelectorAll('#pacePicker .pickerCode')].map(e => e.firstChild && e.textContent).length,
    dot: document.querySelector('#pacePicker .pickerDot').style.backgroundColor, site: F1Theme.team(F1Common.teamColor('mercedes')),
    line: lapChart.data.datasets[0].borderColor, bar: speedChart.data.datasets[0].backgroundColor[0],
    presets: [...document.querySelectorAll('#presetRow .pill')].map(b => b.textContent), pts: [...document.querySelectorAll('#pacePicker .pickerPts')].map(e => e.textContent).join(),
    rowText: document.querySelector('#pacePicker .pickerRow').textContent.replace(/\s+/g, ' ').trim(),
  }));
  const rgb = hex => { const v = hex.replace('#', ''); return `rgb(${[0, 2, 4].map(i => parseInt(v.substr(i, 2), 16)).join(', ')})`; };
  t.check('drivers are grouped under their team, in the standings order of teams', [...pk.teams].sort().join() === 'McLaren Formula 1 Team,Mercedes Formula 1 Team,Scuderia Ferrari', pk.teams.join());
  t.check('a row has a flag, the number, the full name and the code tag, as on the other pages', pk.flags === 6 && pk.nums === '63,12,16,44,1,81' && pk.tags === 'DA0,DA1,DB0,DB1,DC0,DC1' && /^63Driver0 Team0DA0 1:30\.020$/.test(pk.rowText), JSON.stringify([pk.flags, pk.nums, pk.tags, pk.rowText]));
  t.check('the right-hand column is the best lap', pk.pts === '1:30.020,1:30.390,1:30.760,1:31.130,1:31.500,1:31.890', pk.pts);
  t.check('team colours are the site’s (not OpenF1’s) in the picker, lap lines and bars', pk.dot === rgb(pk.site) && pk.line === pk.site && pk.bar === pk.site && pk.site !== '#111111', JSON.stringify([pk.dot, pk.line, pk.bar, pk.site]));
  t.check('the presets are the site’s, plus the fastest', pk.presets.join() === 'All,None,Top 5,Top 10,Top 4 teams,Best of the rest,Title contention,Fastest 5,Fastest 10', pk.presets.join());
  t.check('every drive is on the lap lines, in the ridgeline, the bars and the table', s.lines.join() === 'DA0,DA1,DB0,DB1,DC0,DC1' && s.ridges.length === 6 && s.bars.length === 6 && s.table.length === 6 && s.dumb.length === 6, JSON.stringify([s.lines, s.ridges, s.bars]));
  t.check('the picker folds away like the others', await p.evaluate(() => { document.getElementById('pickerToggle').click(); const hidden = getComputedStyle(document.getElementById('pacePicker')).display === 'none'; document.getElementById('pickerToggle').click(); return hidden; }));
  await p.click('#sortSeg'); await p.selectOption('#sortSeg', 'rank'); await p.waitForTimeout(100);
  t.check('Sort by Ranking lists them in one list with the standings rank', await p.evaluate(() => document.querySelectorAll('#pacePicker .pickerTeamLabel').length === 0 && document.querySelectorAll('#pacePicker .pickerRank').length === 6));
  await p.selectOption('#sortSeg', 'team');

  // ---- the lap lines are joined ----
  const lines = await p.evaluate(() => lapChart.data.datasets.map(d => [d.data.length, d.data.some(q => q.y === null), d.data.map(q => q.x).join()]));
  t.check('each driver’s laps are joined in order, with no breaks, past the hidden in and out laps (7 pace laps; 6 for the driver with an untimed lap)', lines.every(l => !l[1]) && lines.map(l => l[0]).join() === '7,7,7,7,7,6' && lines[0][2] === '2,3,4,5,8,9,10' && lines[5][2] === '2,3,5,8,9,10', JSON.stringify(lines));
  t.check('tyre compounds colour the dots', await p.evaluate(() => { const d = lapChart.data.datasets[0]; return d.pointBackgroundColor.includes('#e53935') && d.pointBackgroundColor.includes('#fbc02d'); }));
  t.check('the second driver of a team is dashed', await p.evaluate(() => { const d = lapChart.data.datasets; return d[0].borderDash.length === 0 && d[1].borderDash.length === 2; }));

  // ---- the sector table and the best vs ideal plot ----
  t.check('sector table: a row per driver, fastest best lap first', s.table.map(r => r[0]).join() === 'DA0,DA1,DB0,DB1,DC0,DC1', JSON.stringify(s.table.map(r => r[0])));
  const a = s.table[0];
  t.check('the ideal lap is the three sectors added and is quicker than the best lap', Math.abs(num(a[2]) + num(a[3]) + num(a[4]) - num(a[5])) < 0.002 && num(a[5]) < num(a[1]) && /^\+0\.\d{3}$/.test(a[6]), JSON.stringify(a));
  t.check('the session-best cells are marked (best lap, three sectors, ideal lap: one each)', s.best === 5, String(s.best));
  const d = await p.evaluate(() => ({ sets: dumbChart.data.datasets.map(x => [x.label, x.data.length]), best: dumbChart.data.datasets[0].data.map(q => q.x), ys: dumbChart.data.datasets[0].data.map(q => q.y),
    ideal: dumbChart.data.datasets[1].data.map(q => q.x), rev: dumbChart.options.scales.y.reverse, ticks: dumbChart.options.scales.y.ticks.callback(0) + dumbChart.options.scales.y.ticks.callback(5),
    xlabel: dumbChart.options.scales.x.title.text, hollow: dumbChart.data.datasets[1].backgroundColor, key: document.getElementById('dumbKey').textContent.replace(/\s+/g, ' ') }));
  t.check('best vs ideal: lap time on x, a best-lap dot and an ideal-lap dot per driver, ideal quicker than best', d.sets.join() === 'Best lap,6,Ideal lap,6' && d.ideal.every((v, i) => v < d.best[i]), JSON.stringify(d.sets));
  t.check('…sorted by best lap with the fastest at the top, drivers named on the y axis', d.best.every((v, i, x) => !i || v >= x[i - 1]) && d.rev === true && d.ys.join() === '0,1,2,3,4,5' && d.ticks === 'DA0DC1', JSON.stringify([d.ys, d.rev, d.ticks]));
  t.check('…with a key for the two dots', /best lap/.test(d.key) && /ideal lap/.test(d.key));

  // ---- interactions never fetch ----
  const n0 = p.openf1Hits.length, api0 = p.apiHits.length;
  await p.click('#pacePicker input[data-id="d0_1"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('unpicking a driver removes them from every view', !s.lines.includes('DA1') && !s.ridges.includes('DA1') && !s.bars.includes('DA1') && !s.dumb.includes('DA1') && !s.table.some(r => r[0] === 'DA1') && s.lines.length === 5, JSON.stringify(s.lines));
  t.check('…and the summary counts them', await p.$eval('#pickerSummary', e => e.textContent) === '5 of 6 drivers');
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(100);
  t.check('None: every card says there is nothing to show', await p.evaluate(() => ['lap', 'ridge', 'dumb', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')));
  await p.click('#presetRow [data-preset="fast5"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('Fastest 5 picks the five quickest in the session', s.rows.filter(r => r[1]).map(r => r[0]).join() === 'd0_0,d0_1,d1_0,d1_1,d2_0', JSON.stringify(s.rows));
  const shown = () => p.evaluate(() => lapChart.data.datasets.flatMap(d => d.data).length);
  const before = await shown();
  await p.selectOption('#speedSel', 'i1'); await p.selectOption('#sortSel', 'gap'); await p.check('#slowChk'); await p.waitForTimeout(100);
  t.check('the speed point changes the bars (intermediate 1: 284 km/h tops the five)', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 284);
  t.check('"include slow laps" adds the five cool-down laps', before === 35 && await shown() === 40, `${before} ${await shown()}`);
  t.check('sorting by gap to ideal reorders the table', (await state(p)).table.map(r => r[6]).every((g, i, x) => !i || num(g.slice(1)) >= num(x[i - 1].slice(1))));
  await p.uncheck('#slowChk'); await p.selectOption('#speedSel', 'st');
  t.check('none of that fetched anything', p.openf1Hits.length === n0 && p.apiHits.length === api0, hits(p));

  // ---- km/h and mph ----
  t.check('km/h is the default: bars, axis and the pill', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 321 && await p.evaluate(() => speedChart.options.scales.x.title.text) === 'km/h' && await p.$eval('#unitRow [data-unit="kmh"]', e => e.classList.contains('active')));
  await p.click('#unitRow [data-unit="mph"]'); await p.waitForTimeout(100);
  t.check('mph: the bars, labels, axis and tooltip follow, in whole miles per hour', await p.evaluate(() => [speedChart.data.datasets[0].data[0], speedChart.options.scales.x.title.text, speedChart.options.plugins.tooltip.callbacks.label({ parsed: { x: 199 } })].join()) === '199,mph, 199 mph');
  t.check('the CSV names the unit', await p.evaluate(() => { let rows; F1Export.attach; return speedChart.data.datasets[0].data.length > 0; }) && (await (async () => { const dl = p.waitForEvent('download'); await p.click('#speedCard .exp-csv'); const f = await dl; return /^﻿Name,mph/.test(require('fs').readFileSync(await f.path(), 'utf8')); })()));
  t.check('the address carries the unit', /unit=mph/.test((await state(p)).url), (await state(p)).url);
  await p.reload(); await ready(p);
  t.check('the unit is remembered for the next visit', await p.$eval('#unitRow [data-unit="mph"]', e => e.classList.contains('active')) && await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 199);
  await p.click('#unitRow [data-unit="kmh"]');

  // ---- teams ----
  await p.selectOption('#bySel', 'teams'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('teams: the picker lists teams with their flag, in the standings order, and is relabelled', s.rows.map(r => r[0]).join() === 'mercedes,ferrari,mclaren' && await p.$$eval('#pacePicker .pickerName .flag', f => f.length) === 3 && await p.$eval('#pickerLabel', e => e.textContent) === 'Teams shown', JSON.stringify(s.rows));
  t.check('teams: ridges, dumbbells, bars (fastest first) and table rows are teams, named as on the other pages', s.ridges.join() === 'Mercedes,Ferrari,McLaren' && s.dumb.join() === 'Mercedes,Ferrari,McLaren' && s.table.map(r => r[0]).join() === 'Mercedes,Ferrari,McLaren', JSON.stringify([s.ridges, s.dumb]));
  t.check('teams: the presets are the site’s teams presets', (await p.$$eval('#presetRow .pill', b => b.map(x => x.textContent).join())) === 'All,None,Top 2,Top 5,Top 4 teams,Best of the rest,Title contention,Fastest 5');
  t.check('teams: the lap lines are still the teams’ drivers', (await state(p)).lines.length === 2 * (await state(p)).rows.filter(r => r[1]).length);
  t.check('teams: the table notes that a team’s ideal lap can mix both cars', /mix both cars/.test(await p.$eval('#sectorNote', e => e.textContent)));

  // ---- picks carry between pages (the shared selection) ----
  await p.click('#presetRow [data-preset="none"]'); await p.click('#pacePicker input[data-id="ferrari"]'); await p.waitForTimeout(100);
  const link = await p.evaluate(() => location.pathname + location.search);
  t.check('the address carries the season, the teams and the options', /^\/pace\.html\?season=2026&by=teams/.test(link) && /[?&]t=ferrari(&|$)/.test(link), link);
  await p.goto('http://site.test/constructors.html'); await h.loaded(p);
  t.check('teams picked here are picked on the Constructors page', (await pickedOn(p, 'teamPicker')).join() === 'ferrari', (await pickedOn(p, 'teamPicker')).join());
  await p.click('#teamPicker input[data-id="mclaren"]'); await p.waitForTimeout(100);
  await p.goto('http://site.test/pace.html'); await ready(p);
  s = await state(p);
  await p.selectOption('#bySel', 'teams'); await p.waitForTimeout(100);
  t.check('…and teams picked there are picked here', (await state(p)).rows.filter(r => r[1]).map(r => r[0]).join() === 'ferrari,mclaren', JSON.stringify((await state(p)).rows));
  await p.selectOption('#bySel', 'drivers'); await p.click('#presetRow [data-preset="none"]');
  for(const id of ['d0_0', 'd2_0']) await p.click(`#pacePicker input[data-id="${id}"]`);
  await p.waitForTimeout(100);
  await p.goto('http://site.test/drivers.html'); await h.loaded(p);
  t.check('drivers picked here are picked on the Drivers page', (await pickedOn(p, 'driverPicker')).join() === 'd0_0,d2_0', (await pickedOn(p, 'driverPicker')).join());
  await p.click('#driverPicker input[data-id="d1_0"]'); await p.waitForTimeout(100);
  await p.goto('http://site.test/pace.html'); await ready(p);
  t.check('…and drivers picked there are picked here', (await state(p)).rows.filter(r => r[1]).map(r => r[0]).join() === 'd0_0,d1_0,d2_0' || [...(await state(p)).rows.filter(r => r[1]).map(r => r[0])].sort().join() === 'd0_0,d1_0,d2_0', JSON.stringify((await state(p)).rows));
  await p.done();

  // ---- the round: the slider selects the weekend, loaded on release; the round carries between pages ----
  p = await open(); await ready(p);
  const n1 = p.openf1Hits.length;
  await release(p, 11); await p.waitForTimeout(200);
  t.check('moving the slider changes the label but fetches nothing until it is let go', /Round 11 of 13/.test((await state(p)).label) && p.openf1Hits.length === n1 && /let go of the slider/.test((await state(p)).status), `${(await state(p)).label} ${(await state(p)).status}`);
  await commit(p); await ready(p);
  s = await state(p);
  t.check('letting go loads that weekend’s sessions (laps, stints, drivers), all enabled, on its last session', hits(p) === 'sessions,laps,stints,drivers,laps,stints,drivers' && s.chips.every(c => !c[2]) && s.chips.find(c => c[1])[0] === 'Quali' && /Qualifying/.test(s.status), hits(p) + JSON.stringify(s.chips));
  await p.goto('http://site.test/drivers.html'); await h.loaded(p);
  t.check('the round is carried to the Drivers page', await p.evaluate(() => F1Controls.state.round) === 11);
  await h.setRound(p, 10);
  await p.goto('http://site.test/pace.html'); await ready(p, /timed laps|no lap data|no practice/);
  s = await state(p);
  t.check('…and the round chosen there is carried here: a round with no OpenF1 weekend says so, with nothing drawn', s.slider[0] === 10 && /no practice or qualifying sessions for round 10/.test(s.status) && s.lines === null, JSON.stringify([s.slider, s.status]));
  await p.evaluate(() => F1Controls.setRound(11)); await p.goto('http://site.test/pace.html'); await ready(p);
  t.check('and back to a round with a weekend', (await state(p)).slider[0] === 11 && (await state(p)).lines.length > 0);
  await p.done();

  // ---- a reserve driver the season has not seen ----
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
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&by=teams&t=ferrari,mclaren&session=FP1&slow=1&unit=mph&speed=i1&tsort=gap&sort=rank'); await ready(p);
  s = await state(p);
  t.check('a shared link restores session, teams, options and unit', s.chips.find(c => c[1])[0] === 'FP1' && s.rows.filter(r => r[1]).map(r => r[0]).join() === 'ferrari,mclaren' && await p.$eval('#bySel', e => e.value) === 'teams' &&
    await p.$eval('#slowChk', e => e.checked) && await p.$eval('#speedSel', e => e.value) === 'i1' && await p.$eval('#sortSel', e => e.value) === 'gap' && await p.$eval('#unitRow [data-unit="mph"]', e => e.classList.contains('active')), JSON.stringify(s.rows));
  await p.done();
  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test/pace.html?season=2026&round=11'); await ready(p);
  t.check('a link with a round opens that weekend', (await state(p)).slider[0] === 11 && /Silverstone|Qualifying/.test((await state(p)).status));
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
  t.check('a session with no data yet says so, with nothing drawn', /no lap data yet/.test(s.status) && s.lines === null && await p.evaluate(() => ['lap', 'ridge', 'dumb', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')), s.status);
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
  t.check('the lap CSV has every lap of the picked drivers, with what is shown marked', file.suggestedFilename() === 'f1-2026-pace-laps-r13.csv' && /^﻿Driver,Team,Lap,Time \(s\)/.test(body) && body.trim().split('\r\n').length === 1 + 66, `${file.suggestedFilename()} ${body.split('\n').length}`);
  const dl2 = p.waitForEvent('download'); await p.click('#sectorCard .exp-csv'); const f2 = await dl2;
  t.check('the sector table has a CSV too', /^﻿Driver,Best lap,S1,S2,S3,Ideal lap,Gap/.test(require('fs').readFileSync(await f2.path(), 'utf8')));
  const dl3 = p.waitForEvent('download'); await p.click('#dumbCard .exp-csv'); const f3 = await dl3;
  t.check('so does the best vs ideal plot', /^﻿Name,Best lap \(s\),Ideal lap \(s\),Gap \(s\)/.test(require('fs').readFileSync(await f3.path(), 'utf8')));
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
