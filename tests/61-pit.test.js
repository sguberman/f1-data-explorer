// #203: the Pit Stops page — the shared season/round controls, the range of races (season so far, this race, from round N), drivers or teams, Race / Sprint,
// long stops, the picker, the table, the bar chart, the trend, every stop, how much was timed, share link, CSV, errors and themes. The saved pit stops are
// built from lib/openf1-fixture.js (rounds 11 and 12 of the fake season; the slider's last round is 12).
const fx = require('./lib/openf1-fixture');
const P = require('../site/pit.js');

module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const full = await buildSnapshot(2026, fakeFetch, Date.now());
  const snapshots = { 2026: full, 2025: { ...full, year: 2025, complete: true } };
  const meta = k => { const s = fx.SESSIONS.find(x => x.session_key === k); return { key: k, meeting: s.meeting_key, name: s.session_name, start: s.date_start, location: s.location }; };
  const file = { v: 1, year: 2026, generatedAt: 1, sessions: [303, 305, 105, 205].map(k => P.compact(fx.pitFor(k), fx.driversFor(k), meta(k))) };
  const open = (opts = {}) => h.openPage('pit', { snapshots, pit: { 2026: file }, ...opts });
  const ready = async (p, text = /stops timed|No pit|Couldn’t|nothing to show|from 2025/) => { await h.loaded(p); await p.waitForFunction(re => new RegExp(re).test(document.getElementById('pitStatus').textContent), text.source, { timeout: 10000 }); await p.waitForTimeout(100); };
  const everyone = async p => { await p.click('#presetRow [data-preset="all"]'); await p.waitForTimeout(100); };
  const state = p => p.evaluate(() => ({
    status: document.getElementById('pitStatus').textContent,
    label: document.querySelector('.f1c-roundlabel').textContent, slider: [+document.querySelector('.f1c-round').value, +document.querySelector('.f1c-round').max],
    active: [...document.querySelectorAll('#viewCard .pill.active')].map(b => b.textContent),
    from: document.getElementById('fromSel').value, fromOpts: [...document.getElementById('fromSel').options].map(o => o.value).join(), to: document.getElementById('toLbl').textContent,
    picker: [...document.querySelectorAll('#pitPicker input')].map(i => [i.dataset.id, i.checked]),
    table: [...document.querySelectorAll('#sumTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    head: [...document.querySelectorAll('#sumTable thead th')].map(th => th.textContent), onHead: [...document.querySelectorAll('#sumTable thead th.on')].map(th => th.textContent),
    bars: barChart ? { labels: barChart.data.labels.slice(), data: barChart.data.datasets[0].data.slice() } : null,
    trend: trendChart ? { labels: trendChart.data.labels.slice(), sets: trendChart.data.datasets.map(d => [d.label, d.data.slice(), d.borderDash.length > 0]) } : null,
    stops: [...document.querySelectorAll('#stopTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    shown: ['sumCard', 'barCard', 'trendCard', 'stopCard'].map(id => [id, document.querySelector('#' + id + ' .pitEmpty').style.display === 'block']),
    url: location.pathname + location.search,
  }));
  const near = (a, b) => a != null && Math.abs(a - b) < 1e-6;
  const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(120); };

  // ---- first view ----
  let p = await open(); await ready(p); await everyone(p);
  let s = await state(p);
  t.check('the shared season controls are there, the slider on the last round with results (12)', s.slider.join() === '12,12' && /^Round 12 of \d+/.test(s.label) && await p.$('.f1c-year') !== null && await p.$('.f1c-share') !== null, JSON.stringify([s.slider, s.label]));
  t.check('the cards run: options, picker, time in the box table, bar chart, trend, every stop', await p.$$eval('.wrap > .card', c => c.map(x => x.id).join()) === 'viewCard,pickCard,sumCard,barCard,trendCard,stopCard');
  t.check('opens on the season so far, drivers, Race + Sprint', s.active.join() === 'Drivers,Season so far,Race + Sprint', s.active.join());
  t.check('the saved pit stops of the season are read once, with no OpenF1 or extra Jolpica request for them', p.pitHits.length === 1 && /data\/pit\/2026\.json$/.test(p.pitHits[0]) && p.openf1Hits.length === 0);
  t.check('the status line says how much was timed: 13 of 14 stops have a time, and one over 10 s is left out of the figures', /13 of 14 stops timed \(OpenF1 has no time in the box for 1\); 1 over 10 s left out of the figures\./.test(s.status), s.status);
  t.check('the From round list runs 1 to 12 and shows 1; no “to” text while it is the season', s.fromOpts === '1,2,3,4,5,6,7,8,9,10,11,12' && s.from === '1' && /to round 12/.test(s.to), s.to);
  t.check('the picker lists the drivers who made a stop (6), ranked by the median, each with its median', s.picker.length === 6 && s.picker.map(r => r[0]).join() === 'd0_0,d1_0,d0_1,d2_1,d1_1,d2_0' && s.picker.every(r => r[1]), JSON.stringify(s.picker));
  t.check('the picker rows are the site’s (flag, number, name, code tag)', await p.$$eval('#pitPicker .pickerRow', rs => rs.every(r => r.querySelector('.pickerDot') && r.querySelector('.pickerCodeTag') && r.querySelector('.pickerNum'))));
  t.check('the table has the median column lit, in median order: DA0, DB0, DA1, DC1, DB1, DC0',
    s.head.join() === 'Driver,Fastest ,Average,Median ▲,Stops'.replace('Fastest ', 'Fastest') && s.table.map(r => r[0]).join() === 'DA0,DB0,DA1,DC1,DB1,DC0', s.head.join() + ' / ' + s.table.map(r => r[0]).join());
  const row = code => s.table.find(r => r[0] === code);
  t.check('DA0: fastest 2.2, average 2.30, median 2.3, 3 / 3 stops', row('DA0').slice(1).join() === '2.2,2.30,2.3,3 / 3', row('DA0').join());
  t.check('DC1: three stops (3.1, 2.8 in the Sprint, 2.4): fastest 2.4, average 2.77, median 2.8', row('DC1').slice(1).join() === '2.4,2.77,2.8,3 / 3', row('DC1').join());
  t.check('DB1: one stop has no box time: 1 / 2 used; DC0: the 15.3 s stop is left out: 1 / 2, fastest 3.0', row('DB1').slice(1).join() === '2.8,2.80,2.8,1 / 2' && row('DC0').slice(1).join() === '3.0,3.00,3.0,1 / 2', row('DB1').join() + ' ' + row('DC0').join());
  t.check('the bar chart is the median, fastest first, one bar per picked driver', JSON.stringify(s.bars.labels) === '["DA0","DB0","DA1","DC1","DB1","DC0"]' && s.bars.data.join() === '2.3,2.6,2.7,2.8,2.8,3', JSON.stringify(s.bars));
  t.check('the trend runs over rounds 11 and 12; DA0 is 2.3 and 2.3, DC1 2.95 then 2.4, DC0 has no figure in round 11 (its only stop is long)', s.trend.labels.join() === 'R11,R12' && near(s.trend.sets.find(x => x[0] === 'DA0')[1][1], 2.3) && near(s.trend.sets.find(x => x[0] === 'DC1')[1][0], 2.95) && s.trend.sets.find(x => x[0] === 'DC0')[1][0] === null, JSON.stringify(s.trend.sets));
  t.check('a team’s second driver (the later one in the order) is dashed on the trend', s.trend.sets.filter(x => x[2]).map(x => x[0]).sort().join() === 'DA1,DB1,DC0', JSON.stringify(s.trend.sets.map(x => [x[0], x[2]])));
  t.check('every stop: 14 rows, fastest first, the stop without a time and the long one marked', s.stops.length === 14 && s.stops[0][5] === '2.2' && s.stops[12][5] === '15.3 ✕' && s.stops[13][5] === '–' && s.stops.filter(r => /✕/.test(r[5])).length === 1, JSON.stringify(s.stops.slice(0, 2)) + JSON.stringify(s.stops.slice(-2)));
  t.check('…each with round, driver, team, stop number, lap, box time and pit lane time', s.stops.length && s.stops[0].length === 7 && s.stops[0][1] === 'DA0' && s.stops[0][4] === '30' && s.stops[0][6] === '22.0', JSON.stringify(s.stops[0]));
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  const fetchedBefore = p.apiHits.length + p.pitHits.length + p.openf1Hits.length;

  // ---- one race, a range ----
  await click(p, '[data-span="race"]'); s = await state(p);
  t.check('This race: round 12 only; six stops, nobody has a long or untimed one; the “to” text is gone', s.active.includes('This race') && s.from === '12' && s.to === '' && s.table.length === 6 && s.stops.length === 6 && /^6 of 6 stops timed\.$/.test(s.status), JSON.stringify([s.active, s.from, s.table.length, s.status]));
  t.check('…the trend needs two races: it says so instead', s.trend === null && s.shown.find(x => x[0] === 'trendCard')[1] === true);
  t.check('…the bars are that race’s medians: DA0 2.3, DC1 2.4 … DC0 3', s.bars.labels.join() === 'DA0,DC1,DA1,DB0,DB1,DC0' && s.bars.data.join() === '2.3,2.4,2.5,2.6,2.8,3', JSON.stringify(s.bars));
  await p.selectOption('#fromSel', '11'); await p.waitForTimeout(120); s = await state(p);
  t.check('From round 11: rounds 11 to 12 again (the season so far), and Season so far is not lit while the range is not the whole season', s.table.length === 6 && s.to === 'to round 12 (the slider)' && s.active.every(a => a !== 'This race') && s.stops.length === 14, JSON.stringify([s.active, s.to]));
  await p.evaluate(() => { const r = document.querySelector('.f1c-round'); r.value = 11; r.dispatchEvent(new Event('input')); }); await p.waitForTimeout(150); s = await state(p);
  t.check('moving the slider to round 11 ends the range there: 8 stops (the Race and the Sprint), no Jolpica or OpenF1 request', s.label.startsWith('Round 11 of') && s.stops.length === 8 && s.from === '11' && s.trend === null, JSON.stringify([s.label, s.stops.length, s.from]));
  await p.evaluate(() => { const r = document.querySelector('.f1c-round'); r.value = 12; r.dispatchEvent(new Event('input')); }); await p.waitForTimeout(150);
  await click(p, '[data-span="season"]'); s = await state(p);
  t.check('Season so far: back to rounds 1 to 12', s.from === '1' && s.stops.length === 14);

  // ---- sessions and long stops ----
  await click(p, '[data-kinds="sprint"]'); s = await state(p);
  t.check('Sprint: DC1’s one Sprint stop, and the bars follow', s.table.map(r => r[0]).join() === 'DC1' && s.table[0][1] === '2.8' && s.stops.length === 1 && s.bars.labels.join() === 'DC1' && /^1 of 1 stops timed\.$/.test(s.status), JSON.stringify(s.table));
  await click(p, '[data-kinds="race"]'); s = await state(p);
  t.check('Race: no Sprint stop; DC1 has two stops now (3.1 and 2.4)', s.stops.length === 13 && s.table.find(r => r[0] === 'DC1')[4] === '2 / 2', JSON.stringify(s.table.find(r => r[0] === 'DC1')));
  await click(p, '[data-kinds="both"]');
  await p.check('#longChk'); await p.waitForTimeout(120); s = await state(p);
  t.check('Include long stops: DC0’s 15.3 s stop counts (2 / 2, average 9.15, median 9.2 in the table, the bar at the end), nothing is left out of the status', s.table.find(r => r[0] === 'DC0').slice(1).join() === '3.0,9.15,9.2,2 / 2' && s.table[5][0] === 'DC0' && !/left out/.test(s.status) && /^13 of 14/.test(s.status), JSON.stringify(s.table.find(r => r[0] === 'DC0')) + s.status);
  t.check('…and it is no longer marked in the list of stops', s.stops.filter(r => /✕/.test(r[5])).length === 0);
  await p.uncheck('#longChk'); await p.waitForTimeout(120);

  // ---- the statistic ----
  await p.selectOption('#statSel', 'fastest'); await p.waitForTimeout(120); s = await state(p);
  t.check('Fastest: the table’s Fastest column is lit and sorted (DA0 2.2 first, DC0 3.0 last), the chart and trend are titled for it', s.onHead.join() === 'Fastest ▲' && s.table[0][0] === 'DA0' && s.table[5][0] === 'DC0' && s.bars.data[0] === 2.2 && /Fastest time in the box/.test(await p.textContent('#barTitle')) && /Fastest time in the box by race/.test(await p.textContent('#trendTitle')), s.onHead.join());
  await p.click('#sumTable th[data-stat="mean"]'); await p.waitForTimeout(120); s = await state(p);
  t.check('clicking the Average heading sorts by it (and the statistic menu follows)', s.onHead.join() === 'Average ▲' && await p.$eval('#statSel', e => e.value) === 'mean' && s.table[0][0] === 'DA0');
  await p.selectOption('#statSel', 'median');

  // ---- teams ----
  await click(p, '[data-by="teams"]'); await everyone(p); s = await state(p);
  t.check('Teams: the picker, the table and the bars are teams; three teams made stops', s.picker.length === 3 && s.table.length === 3 && /Formula 1 Team|Scuderia Ferrari/.test(s.table.map(r => r[0]).join()) && await p.$eval('#pickerLabel', e => e.textContent) === 'Teams shown', JSON.stringify(s.table));
  const team = name => s.table.find(r => r[0].includes(name));
  t.check('Mercedes (DA0 and DA1): 5 of 5 stops, fastest 2.2, median 2.4', team('Mercedes').slice(1).join() === '2.2,2.46,2.4,5 / 5', team('Mercedes').join());
  t.check('McLaren (DC0 and DC1): the long stop is out: 4 of 5, fastest 2.4, median 2.9', team('McLaren').slice(1).join() === '2.4,2.83,2.9,4 / 5', team('McLaren').join());
  t.check('the teams’ trend has a line per team with no dashes', s.trend.sets.length === 3 && s.trend.sets.every(x => !x[2]) && s.stops.length === 14);
  const teamUrl = await p.evaluate(() => location.search);
  t.check('the address records the view (by=teams) and no picks while they are the default', /by=teams/.test(teamUrl) && !/[?&]t=/.test(teamUrl), teamUrl);

  // ---- the picker ----
  await click(p, '#presetRow [data-preset="none"]'); s = await state(p);
  t.check('None: no rows, bars or lines; every card says there is nothing to show', s.table.length === 0 && s.bars === null && s.trend === null && s.shown.every(x => x[1]) && /0 of 3 teams/.test(await p.textContent('#pickerSummary')), JSON.stringify(s.shown));
  await p.check('#pitPicker input[data-id="ferrari"]'); await p.waitForTimeout(120); s = await state(p);
  t.check('ticking one team shows it alone', s.table.length === 1 && /Ferrari/.test(s.table[0][0]) && s.picker.filter(r => r[1]).map(r => r[0]).join() === 'ferrari' && /t=ferrari/.test(s.url), JSON.stringify([s.table, s.url]));
  await click(p, '[data-by="drivers"]'); s = await state(p);
  t.check('back on Drivers the drivers’ own picks are kept apart from the teams’ (the default top 5 or fewer)', s.picker.length === 6 && s.picker.some(r => r[1]) && !s.url.includes('d=') || s.url.includes('d='), s.url);
  await click(p, '#presetRow [data-preset="5"]'); s = await state(p);
  t.check('Top 5 picks five drivers', s.picker.filter(r => r[1]).length === 5 && s.table.length === 5);
  await everyone(p);

  // ---- nothing fetched while clicking around ----
  t.check('none of those clicks (range, sessions, long stops, statistic, teams, picks, the slider) fetched anything', p.apiHits.length + p.pitHits.length + p.openf1Hits.length === fetchedBefore, [p.apiHits.length, p.pitHits.length, p.openf1Hits.length, fetchedBefore].join());

  // ---- share link ----
  await click(p, '[data-kinds="race"]'); await p.selectOption('#fromSel', '11'); await p.waitForTimeout(120); await click(p, '[data-by="teams"]'); await p.check('#longChk'); await p.selectOption('#statSel', 'mean');
  await p.waitForTimeout(200);
  const link = await p.evaluate(() => location.pathname + location.search);
  t.check('the address holds the setup: range from 11, teams, Race only, long stops, average', /from=11/.test(link) && /by=teams/.test(link) && /kinds=race/.test(link) && /long=1/.test(link) && /stat=mean/.test(link), link);
  const p2 = await h.openPage('pit' + link.replace(/^\/pit(\.html)?/, '.html'), { snapshots, pit: { 2026: file } }); await ready(p2); s = await state(p2);
  t.check('opening that link gives the same view', s.active.join() === 'Teams,Race' && s.from === '11' && await p2.$eval('#longChk', e => e.checked) && await p2.$eval('#statSel', e => e.value) === 'mean', s.active.join() + ' ' + s.from);
  await p2.done();

  // ---- CSV ----
  await everyone(p);
  t.check('the card exports are there: PNG and CSV on the charts, CSV only on the tables', await p.$$eval('.exportRow', r => r.map(x => x.closest('.card').id + ':' + [...x.querySelectorAll('button')].map(b => b.textContent).join('+')).join(' ')) === 'sumCard:CSV barCard:PNG+CSV trendCard:PNG+CSV stopCard:CSV', '');
  await p.done();

  // ---- empty and failing files ----
  p = await open({ pit: {} }); await ready(p, /No pit stops are saved|Couldn’t/); s = await state(p);
  t.check('a season with no saved file says none are saved yet, and every card says there is nothing to show', /No pit stops are saved for 2026 yet\./.test(s.status) && s.shown.every(x => x[1]) && p.errors.length === 0, s.status);
  await p.done();
  p = await open({ pit: { 2026: 'error' } }); await ready(p, /Couldn’t/);
  t.check('a failing file says so, with a Retry that asks again', /Couldn’t load the saved pit stops/.test(await p.textContent('#pitStatus')) && await p.$('#retry') !== null && p.pitHits.length === 1, '');
  await p.done();
  p = await open({ pit: { 2025: null } }); await ready(p);
  await p.selectOption('.f1c-year', '2025'); await p.waitForFunction(() => /No pit stops are saved for 2025/.test(document.getElementById('pitStatus').textContent), null, { timeout: 10000 });
  t.check('switching season loads that season’s file (a missing one says none are saved)', p.pitHits.some(u => /2025\.json/.test(u)), p.pitHits.join());
  await p.done();

  // ---- themes and phone width ----
  for(const theme of ['light', 'dark']) for(const width of [1000, 390]){
    p = await open({ theme, width }); await ready(p); await everyone(p);
    const r = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, bg: getComputedStyle(document.body).backgroundColor, canvases: [...document.querySelectorAll('canvas')].map(c => c.getBoundingClientRect().width) }));
    t.check(`${theme} ${width}px: no horizontal scroll, the charts fit`, r.scroll <= width && r.canvases.every(w => w <= width), JSON.stringify(r));
    await h.screenshot(p, `pit-${theme}-${width}.png`);
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
