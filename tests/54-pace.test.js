// #186: the Weekend Pace page — session picker, drivers/teams picker, lap-time lines, ridgeline, sector table, top speed,
// share link, cache, errors and themes. OpenF1 is answered by lib/openf1-fixture.js (Singapore over; Austin has run FP1 and FP2).
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const open = (opts = {}) => h.openPage('pace', { openf1: {}, now: fx.NOW, ...opts });
  const ready = async (p, text = /timed laps|no lap data/) => { await p.waitForFunction(re => new RegExp(re).test(document.getElementById('paceStatus').textContent), text.source, { timeout: 10000 }); await p.waitForTimeout(100); };
  const hits = p => p.openf1Hits.map(u => new URL(u).pathname.replace('/v1/', '')).join();
  const state = p => p.evaluate(() => ({
    status: document.getElementById('paceStatus').textContent,
    chips: [...document.querySelectorAll('.sessBtn')].map(b => [b.textContent, b.classList.contains('on'), b.disabled]),
    weekend: document.getElementById('weekendSel').selectedOptions[0]?.textContent,
    rows: [...document.querySelectorAll('#pacePicker input')].map(i => [i.dataset.id, i.checked]),
    lines: lapChart ? lapChart.data.datasets.map(d => d.label) : null,
    ridges: ridgeChart ? ridgeChart.data.datasets.filter(d => !d._baseline).map(d => d._code) : null,
    bars: speedChart ? speedChart.data.labels.slice() : null,
    table: [...document.querySelectorAll('#sectorTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    best: [...document.querySelectorAll('#sectorTable td.best')].length,
    url: location.pathname + location.search,
  }));
  const num = s => { const m = s.match(/^(?:(\d+):)?([\d.]+)$/); return (m[1] ? +m[1] * 60 : 0) + parseFloat(m[2]); };

  // ---- first view ----
  let p = await open(); await ready(p);
  let s = await state(p);
  t.check('opens the current weekend (Austin) on the latest session that has run (FP2)', /Austin/.test(s.weekend) && s.chips.find(c => c[1])?.[0] === 'FP2', JSON.stringify([s.weekend, s.chips]));
  t.check('the session chips: FP1 FP2 FP3 Quali, the two not yet run are disabled', s.chips.map(c => c[0]).join() === 'FP1,FP2,FP3,Quali' && s.chips.filter(c => c[2]).map(c => c[0]).join() === 'FP3,Quali', JSON.stringify(s.chips));
  t.check('the status line names the session, drivers and laps', /Austin · Practice 2 · 6 drivers · 65 timed laps/.test(s.status), s.status);
  t.check('loads the sessions and the one session once each (4 requests), nothing from f1api.dev', hits(p) === 'sessions,laps,stints,drivers' && p.apiHits.length === 0, hits(p));
  t.check('six drivers, all picked (the default is the fastest ten)', s.rows.length === 6 && s.rows.every(r => r[1]), JSON.stringify(s.rows));
  t.check('lap lines: one per driver', s.lines.join() === 'AAA,BBB,CCC,DDD,EEE,FFF', String(s.lines));
  t.check('the lap chart shows pace laps only (no pit-out, in, slow or untimed laps)', await p.evaluate(() => lapChart.data.datasets.flatMap(d => d.data).filter(q => q.y != null).length) === 41);
  t.check('tyre compounds colour the dots', await p.evaluate(() => { const d = lapChart.data.datasets[0]; return d.pointBackgroundColor.includes('#e53935') && d.pointBackgroundColor.includes('#fbc02d'); }));
  t.check('a stint change leaves a gap in the line', await p.evaluate(() => lapChart.data.datasets[0].data.some(q => q.y === null)));
  t.check('the second driver of a team is dashed', await p.evaluate(() => { const d = lapChart.data.datasets; return d[0].borderDash.length === 0 && d[1].borderDash.length === 2; }));
  t.check('ridgeline: a ridge per driver', s.ridges.length === 6, String(s.ridges));
  t.check('top speed: bars from fastest to slowest', s.bars.join() === 'AAA,BBB,CCC,DDD,EEE,FFF', String(s.bars));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));

  // ---- the sector table ----
  t.check('sector table: a row per driver, fastest best lap first', s.table.map(r => r[0]).join() === 'AAA,BBB,CCC,DDD,EEE,FFF', JSON.stringify(s.table.map(r => r[0])));
  const a = s.table[0];
  t.check('the ideal lap is the three sectors added and is quicker than the best lap', Math.abs(num(a[2]) + num(a[3]) + num(a[4]) - num(a[5])) < 0.002 && num(a[5]) < num(a[1]) && /^\+0\.\d{3}$/.test(a[6]), JSON.stringify(a));
  t.check('the session-best cells are marked (best lap, three sectors, ideal lap: one each)', s.best === 5, String(s.best));

  // ---- interactions never fetch ----
  const n0 = p.openf1Hits.length;
  await p.click('#pacePicker input[data-id="2"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('unpicking a driver removes them from every view', !s.lines.includes('BBB') && !s.ridges.includes('BBB') && !s.bars.includes('BBB') && !s.table.some(r => r[0] === 'BBB') && s.lines.length === 5, JSON.stringify(s.lines));
  t.check('…and the summary counts them', await p.$eval('#pickerSummary', e => e.textContent) === '5 of 6 drivers');
  await p.click('#presetRow [data-preset="none"]'); await p.waitForTimeout(100);
  t.check('None: every card says there is nothing to show', await p.evaluate(() => ['lap', 'ridge', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')));
  await p.click('#presetRow [data-preset="5"]'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('Fastest 5 picks the five quickest', s.rows.filter(r => r[1]).map(r => r[0]).join() === '1,2,3,4,5', JSON.stringify(s.rows));
  const shown = () => p.evaluate(() => lapChart.data.datasets.flatMap(d => d.data).filter(q => q.y != null).length);
  const before = await shown();
  await p.selectOption('#speedSel', 'i1'); await p.selectOption('#sortSel', 'gap'); await p.check('#slowChk'); await p.waitForTimeout(100);
  t.check('the speed point changes the bars (intermediate 1: 284 km/h tops the five)', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 284);
  t.check('"include slow laps" adds the five cool-down laps', before === 35 && await shown() === 40, `${before} ${await shown()}`);
  t.check('sorting by gap to ideal reorders the table', (await state(p)).table.map(r => r[6]).every((g, i, a) => !i || num(g.slice(1)) >= num(a[i - 1].slice(1))));
  t.check('none of that fetched anything', p.openf1Hits.length === n0, hits(p));

  // ---- teams ----
  await p.selectOption('#bySel', 'teams'); await p.waitForTimeout(100);
  s = await state(p);
  t.check('teams: three rows, all picked; the picker is relabelled', s.rows.length === 3 && s.rows.every(r => r[1]) && await p.$eval('#pickerLabel', e => e.textContent) === 'Teams shown', JSON.stringify(s.rows));
  t.check('teams: ridges, bars (fastest first) and table rows are teams', s.ridges.join() === 'Alpha,Beta,Gamma' && s.bars.join() === 'Gamma,Beta,Alpha' && s.table.map(r => r[0]).join() === 'Alpha,Beta,Gamma', JSON.stringify([s.ridges, s.bars, s.table.map(r => r[0])]));
  t.check('teams: the lap lines are still the teams’ drivers', s.lines.length === 6);
  t.check('teams: top speed is the team’s best of its two drivers (intermediate 1: Gamma’s 285)', await p.evaluate(() => speedChart.data.datasets[0].data[0]) === 285);
  t.check('teams: the table notes that a team’s ideal lap can mix both cars', /mix both cars/.test(await p.$eval('#sectorNote', e => e.textContent)));

  // ---- share link ----
  s = await state(p);
  t.check('the address carries the setup', /^\/pace\.html\?year=2026&session=202&by=teams/.test(s.url) && /slow=1/.test(s.url) && /speed=i1/.test(s.url) && /sort=gap/.test(s.url), s.url);
  t.check('…and the Share button is there', await p.$('#sessionCard .f1c-share') !== null);
  await p.click('#presetRow [data-preset="none"]'); await p.click('#pacePicker input[data-id="Beta"]'); await p.waitForTimeout(100);
  const link = await p.evaluate(() => location.pathname + location.search);
  t.check('a picked team is in the address', /t=Beta/.test(link), link);
  await p.done();

  p = await h.openPage('pace', { openf1: {}, now: fx.NOW }); await p.goto('http://site.test' + link); await ready(p);
  s = await state(p);
  t.check('opening the link restores session, teams, options', s.chips.find(c => c[1])[0] === 'FP2' && s.rows.filter(r => r[1]).map(r => r[0]).join() === 'Beta' && await p.$eval('#bySel', e => e.value) === 'teams' &&
    await p.$eval('#slowChk', e => e.checked) && await p.$eval('#speedSel', e => e.value) === 'i1' && await p.$eval('#sortSel', e => e.value) === 'gap', JSON.stringify(s.rows));
  await p.done();

  // ---- sessions, weekends, cache, refresh ----
  p = await open(); await ready(p);
  await p.click('.sessBtn:has-text("FP1")'); await ready(p);
  s = await state(p);
  t.check('clicking FP1 loads that session', /Practice 1/.test(s.status) && s.chips.find(c => c[1])[0] === 'FP1' && /session=201/.test(s.url), s.status);
  t.check('…with its three requests', hits(p) === 'sessions,laps,stints,drivers,laps,stints,drivers', hits(p));
  await p.click('.sessBtn:has-text("FP2")'); await ready(p);
  t.check('going back to a session already loaded is served from the cache', p.openf1Hits.length === 7, hits(p));
  await p.selectOption('#weekendSel', '1'); await ready(p);
  s = await state(p);
  t.check('another weekend opens on its last session (Quali)', /Marina Bay/.test(s.weekend) && s.chips.map(c => c[0]).join() === 'FP1,FP2,FP3,Quali' && s.chips.find(c => c[1])[0] === 'Quali' && s.chips.every(c => !c[2]), JSON.stringify(s.chips));
  await p.reload(); await ready(p);
  t.check('reloading the page opens the same session from the cache with no requests', p.openf1Hits.length === 10 && /Marina Bay · Qualifying/.test((await state(p)).status), hits(p));
  const hitsBefore = p.openf1Hits.length;
  await p.click('#refresh'); await ready(p);
  t.check('Refresh data fetches the session again', p.openf1Hits.length === hitsBefore + 3, hits(p));
  t.check('an older year can be chosen', await p.$$eval('#yearSel option', o => o.map(x => x.value).join()) === '2026,2025,2024,2023');
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // ---- empty and failing ----
  p = await open({ openf1: { empty: [201] } }); await ready(p);
  await p.click('.sessBtn:has-text("FP1")'); await ready(p);
  s = await state(p);
  t.check('a session with no data yet says so, with nothing drawn', /no lap data yet/.test(s.status) && s.lines === null && await p.evaluate(() => ['lap', 'ridge', 'sector', 'speed'].every(c => getComputedStyle(document.getElementById(c + 'Empty')).display !== 'none')), s.status);
  await p.done();

  let broken = true;
  p = await open({ openf1: { fail: u => broken && u.includes('/laps') } });
  await p.waitForSelector('#retry', { timeout: 10000 });
  t.check('a failed session shows the error and a Retry button', /Couldn’t load this session/.test(await p.$eval('#paceStatus', e => e.textContent)) && await p.$eval('#paceStatus', e => e.classList.contains('err')));
  broken = false; await p.click('#retry'); await ready(p);
  t.check('Retry loads it', /timed laps/.test(await p.$eval('#paceStatus', e => e.textContent)) && (await state(p)).lines.length === 6);
  await p.done();

  p = await open({ openf1: { fail: () => true } });
  await p.waitForSelector('#retry', { timeout: 10000 });
  t.check('a failed session list shows the error too', /Couldn’t load the sessions/.test(await p.$eval('#paceStatus', e => e.textContent)));
  await p.done();

  // ---- navigation, export ----
  p = await open(); await ready(p);
  const nav = await p.evaluate(() => ({ label: document.querySelector('#siteNav .nav-current').textContent, links: [...document.querySelectorAll('#siteNav .nav-menu a')].map(a => a.getAttribute('href')),
    current: document.querySelector('#siteNav [aria-current="page"]')?.getAttribute('href') }));
  t.check('the Pages menu lists Weekend Pace last and marks it', nav.label === 'Weekend Pace' && nav.current === 'pace.html' && nav.links.join() === 'eras.html,drivers.html,constructors.html,whatif.html,position.html,simulator.html,pace.html', JSON.stringify(nav));
  t.check('each card has a PNG and CSV link', await p.$$eval('.exportRow', r => r.length) === 4);
  const dl = p.waitForEvent('download');
  await p.click('#lapCard .exp-csv');
  const file = await dl;
  const body = require('fs').readFileSync(await file.path(), 'utf8');
  t.check('the lap CSV has every lap of the picked drivers, with what is shown marked', file.suggestedFilename() === 'f1-pace-laps.csv' && /^﻿Driver,Team,Lap,Time \(s\)/.test(body) && body.trim().split('\r\n').length === 1 + 66, `${file.suggestedFilename()} ${body.split('\n').length}`);
  const dl2 = p.waitForEvent('download'); await p.click('#sectorCard .exp-csv'); const f2 = await dl2;
  t.check('the sector table has a CSV too', /^﻿Driver,Best lap,S1,S2,S3,Ideal lap,Gap/.test(require('fs').readFileSync(await f2.path(), 'utf8')));
  await p.done();

  // ---- themes and phone ----
  for(const theme of ['light', 'dark']) for(const width of [1000, 390]){
    p = await open({ theme, width }); await ready(p);
    await h.screenshot(p, `pace-${width}-${theme}.png`);
    const r = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, tableOk: document.querySelector('.tableScroll').scrollWidth >= 0,
      pb: getComputedStyle(document.querySelector('#sectorTable td.best')).color }));
    t.check(`${theme} ${width}px: nothing overflows the screen`, r.scroll <= width, JSON.stringify(r));
    t.check(`${theme} ${width}px: session-best cells are purple, in the theme's own tone`, r.pb === (theme === 'dark' ? 'rgb(206, 147, 216)' : 'rgb(142, 36, 170)'), r.pb);
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
