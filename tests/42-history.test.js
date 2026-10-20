// #141: the 1950–2020 back-fill. tools/history-snapshot.mjs builds site/data/{year}.json from Jolpica (a fake one
// here); F1Common.scoring() gives each season's points scale; the season dropdown groups every season by rule era;
// and the Eras page links a season to the other pages.
module.exports = async (t, h) => {
  const { buildHistory, FIRST_YEAR, LAST_YEAR } = await import('../tools/history-snapshot.mjs');

  // ---- the generator, against a fake Jolpica ----
  const calls = [];
  const res = (race, key, rows, extra = {}) => ({ ...race, [key]: rows, ...extra });
  const mk = (id, given, family, extra = {}) => ({ driverId: id, givenName: given, familyName: family, nationality: 'British', ...extra });
  const C = { constructorId: 'lotus', name: 'Lotus', nationality: 'British' };
  const circuit = { Location: { locality: 'Silverstone', country: 'UK' } };
  const RACES = [
    { round: '1', raceName: 'British Grand Prix', date: '1967-07-15', time: '13:00:00Z', Circuit: circuit, Results: [
      { positionText: '1', points: '9', Driver: mk('clark', 'Jim', 'Clark'), Constructor: C },
      { positionText: '2', points: '4.5', Driver: mk('hill', 'Graham', 'Hill'), Constructor: C },                    // a shared drive: half points
      { positionText: '3', points: '4.5', Driver: mk('hulme', 'Denny', 'Hulme', { code: 'HUL', permanentNumber: '7' }), Constructor: C },
      { positionText: 'R', points: '0', Driver: mk('hall', 'Peter', 'Hall'), Constructor: C },                    // retired: not classified
      { positionText: 'R', points: '0', Driver: mk('hallb', 'Bob', 'Hall'), Constructor: C } ] },                 // same first three letters as the one above
    { round: '2', raceName: 'Belgian Grand Prix', date: '1967-06-18', Circuit: { Location: { locality: 'Spa', country: 'Belgium' } }, Results: [
      { positionText: '1', points: '9', Driver: mk('clark', 'Jim', 'Clark'), Constructor: C } ] },
  ];
  let limited = true;
  const jolpica = ({ fail = false } = {}) => async url => {
    calls.push(url);
    const m = url.match(/\/f1\/(\d{4})(\/results)?\.json\?limit=100&offset=(\d+)$/);
    if(!m) return { ok: false, status: 404, json: async () => ({}) };
    if(limited){ limited = false; return { ok: false, status: 429, json: async () => ({}) }; } // one rate limit, then fine
    if(fail) return { ok: false, status: 503, json: async () => ({}) };
    const withResults = !!m[2];
    const races = RACES.map(r => withResults ? r : { ...r, Results: undefined });
    return { ok: true, status: 200, json: async () => ({ MRData: { limit: '100', offset: m[3], total: String(withResults ? 6 : 2), RaceTable: { season: m[1], Races: races } } }) };
  };
  const noWait = async () => {};
  const snap = await buildHistory(1967, jolpica(), { now: 5, wait: noWait });
  t.check('years: 1950 to 2020, the season files before f1api.dev\'s', FIRST_YEAR === 1950 && LAST_YEAR === 2020);
  t.check('a season file in the pages\' shape: v, year, complete, calendar, rounds, one race session per round',
    snap.v === 1 && snap.year === 1967 && snap.generatedAt === 5 && snap.complete === true && snap.rounds.length === 2
    && snap.rounds.every(r => r.sprintResults === null && r.raceResults.every(x => x.session === 'race')), JSON.stringify(snap).slice(0, 300));
  const r1 = snap.rounds[0].raceResults;
  t.check('classified = a numeric positionText; R etc. are not classified (null)', r1.map(x => x.position).join() === '1,2,3,,', r1.map(x => x.position).join());
  t.check('points are Jolpica\'s as awarded (a shared drive keeps its half points)', r1.map(x => x.points).join() === '9,4.5,4.5,0,0');
  t.check('codes: the given one, else the surname\'s first three letters, a clash gets the first name\'s initial',
    r1[0].code === 'CLA' && r1[2].code === 'HUL' && r1[3].code === 'HAL' && r1[4].code === 'BHA', r1.map(x => x.code).join());
  t.check('name, team, nationality and number come through (number null when unknown)',
    r1[0].name === 'Jim Clark' && r1[0].teamId === 'lotus' && r1[0].teamName === 'Lotus' && r1[0].teamNationality === 'British' && r1[0].nationality === 'British' && r1[0].number === null && r1[2].number === 7);
  t.check('a driver keeps one code in every round', snap.rounds[1].raceResults[0].code === 'CLA');
  t.check('the calendar: rounds, no sprints, names, dates, the UTC time when known, countries and cities',
    snap.calendar.totalRounds === 2 && snap.calendar.sprintRounds.length === 0 && snap.calendar.raceNames[2] === 'Belgian Grand Prix'
    && snap.calendar.raceDates[1] === '1967-07-15' && snap.calendar.raceTimes[1] === '13:00:00Z' && !snap.calendar.raceTimes[2]
    && snap.calendar.countries[1] === 'UK' && snap.calendar.cities[2] === 'Spa', JSON.stringify(snap.calendar));
  t.check('politeness: it retried after HTTP 429', calls.filter(u => u.includes('/1967/results.json')).length >= 2);
  let failed = false;
  try{ await buildHistory(1967, jolpica({ fail: true }), { wait: noWait }); }catch(e){ failed = /HTTP 503/.test(e.message); }
  t.check('a failed fetch throws (so the old file is kept)', failed);

  // ---- scoring by season ----
  const p = await h.openPage('drivers'); await h.loaded(p);
  const S = await p.evaluate(() => {
    const sc = F1Common.scoring, mw = F1Common.maxWeekendPoints;
    return { y1950: sc(1950), y1960: sc(1960), y1988: sc(1988), y1995: sc(1995), y2003: sc(2003), y2015: sc(2015), y2019: sc(2019), y2021: sc(2021), y2025: sc(2025),
      d1988: mw(1988, 'drivers'), t1988: mw(1988, 'teams'), d2024: mw(2024, 'drivers'), t2024: mw(2024, 'teams'), d2026: mw(2026, 'drivers') };
  });
  const j = a => a.join('-');
  t.check('scoring: 1950s 8-6-4-3-2 (+1 fastest lap to 1958), 1960 8-6-4-3-2-1', j(S.y1950.gp) === '8-6-4-3-2' && S.y1950.fl === 1 && j(S.y1960.gp) === '8-6-4-3-2-1' && S.y1960.fl === 0);
  t.check('scoring: 1961–90 9-6-4-3-2-1, 1991–2002 10-6-4-3-2-1, 2003–09 10-8-6-5-4-3-2-1',
    j(S.y1988.gp) === '9-6-4-3-2-1' && j(S.y1995.gp) === '10-6-4-3-2-1' && j(S.y2003.gp) === '10-8-6-5-4-3-2-1');
  t.check('scoring: 2010 on 25-18-15-12-10-8-6-4-2-1 (+1 fastest lap 2019–24), sprints 3-2-1 in 2021 and 8-1 from 2022, none before',
    j(S.y2015.gp) === '25-18-15-12-10-8-6-4-2-1' && S.y2015.fl === 0 && S.y2019.fl === 1 && S.y2025.fl === 0 && j(S.y2021.sprint) === '3-2-1' && j(S.y2025.sprint) === '8-7-6-5-4-3-2-1' && S.y1988.sprint.length === 0);
  t.check('most a weekend can pay: 1988 9 (teams 15); 2024 26 + sprint 8 (teams 44 and 15); 2026 25 (unchanged)',
    S.d1988.gp === 9 && S.d1988.sprint === 0 && S.t1988.gp === 15 && S.d2024.gp === 26 && S.d2024.sprint === 8 && S.t2024.gp === 44 && S.t2024.sprint === 15 && S.d2026.gp === 25);

  // ---- the season dropdown, grouped by rule era ----
  const dd = await p.evaluate(() => ({
    groups: [...document.querySelectorAll('.f1c-year optgroup')].map(g => [g.label, [...g.querySelectorAll('option')].map(o => +o.value)]),
    years: F1Common.YEARS, all: [...document.querySelectorAll('.f1c-year option')].map(o => +o.value) }));
  t.check('the dropdown has a group per rule era (newest first), as on the Eras page', dd.groups.length === 10 && dd.groups[0][0] === 'Current era · 2026–' && dd.groups[1][0] === 'Ground effect returns · 2022–2025' && dd.groups[9][0] === 'Front-engined cars · 1950–1960', JSON.stringify(dd.groups.map(g => g[0])));
  t.check('…each season is in the era it belongs to (1988 in the turbo era, 2021 in the turbo-hybrid era)',
    dd.groups.find(g => /^Turbo era/.test(g[0]))[1].includes(1988) && dd.groups.find(g => /^Turbo-hybrid/.test(g[0]))[1].includes(2021));
  t.check('…every season from 1950 to 2026 is offered once, newest first', dd.years[0] === 2026 && dd.years[dd.years.length - 1] === 1950 && dd.years.length === 77 && JSON.stringify(dd.all) === JSON.stringify(dd.years), String(dd.years.length));
  await p.done();

  // ---- the Eras page: a link to open the season under the pointer ----
  const ERAS = { v: 1, generatedAt: 0, partial: null, drivers: { a: { n: 'Ann Able', s: 'Able' } }, teams: { ferrari: { n: 'Ferrari' } },
    seasons: { 1988: { round: 16, d: [['a', 1, 90, 'ferrari']], t: [['ferrari', 1, 100]] }, 1989: { round: 16, d: [['a', 2, 80, 'ferrari']], t: [['ferrari', 2, 90]] } } };
  const e = await h.openPage('eras', { eras: ERAS }); await e.waitForSelector('#erasPicker input'); await e.waitForTimeout(200);
  t.check('nothing to open until a season is touched', await e.$eval('#erasOpen', el => el.hidden));
  const at = year => e.evaluate(y => { const r = chart.canvas.getBoundingClientRect(), a = chart.chartArea; return { x: r.left + chart.scales.x.getPixelForValue(y), y: r.top + (a.top + a.bottom) / 2 }; }, year);
  let pt = await at(1989); await e.mouse.move(pt.x, pt.y); await e.waitForTimeout(100);
  const links = () => e.$$eval('#erasOpen a', as => as.map(a => [a.textContent, a.getAttribute('href')]));
  let L = await links();
  t.check('hovering 1989 offers it: the constructors\' championship (the default view) first, then the other pages, all for 1989 (no round: the end of the season)',
    L[0][1] === 'constructors.html?season=1989' && L.map(x => x[1]).join() === 'constructors.html?season=1989,position.html?season=1989,whatif.html?season=1989,simulator.html?season=1989', JSON.stringify(L));
  pt = await at(1988); await e.mouse.move(pt.x, pt.y); await e.waitForTimeout(100);
  t.check('…and follows the pointer to 1988', (await links())[0][1] === 'constructors.html?season=1988');
  await e.selectOption('#viewSel', 'drivers'); await e.waitForTimeout(150);
  t.check('the Drivers view links the drivers\' championship', (await links())[0][1] === 'drivers.html?season=1988' && /Drivers/.test((await links())[0][0]), JSON.stringify(await links()));
  t.check('the tooltip says where to click', await e.evaluate(() => { const cb = chart.options.plugins.tooltip.callbacks; return /Click 1988 on the axis to open it/.test(cb.footer([{ raw: { x: 1988 } }])); }));

  // clicking a year on the axis goes straight to the season's championship page (the Drivers view here)
  const axisAt = year => e.evaluate(y => { const r = chart.canvas.getBoundingClientRect(), a = chart.chartArea; return { x: r.left + chart.scales.x.getPixelForValue(y), y: r.top + a.bottom + 12 }; }, year);
  pt = await axisAt(1989); await e.mouse.move(pt.x, pt.y); await e.waitForTimeout(80);
  t.check('over the axis the cursor is a pointer', await e.$eval('#erasCanvas', c => c.style.cursor) === 'pointer');
  await Promise.all([e.waitForURL(/drivers\.html\?season=1989$/), e.mouse.click(pt.x, pt.y)]);
  t.check('clicking 1989 on the axis opens drivers.html?season=1989 (the Drivers view)', /\/drivers\.html\?season=1989$/.test(e.url()), e.url());
  await e.done();

  // clicking inside the plot — on a line or in empty space — locks that year for the links under the chart
  const e2 = await h.openPage('eras', { eras: ERAS }); await e2.waitForSelector('#erasPicker input'); await e2.waitForTimeout(200);
  const plotAt = (year, dy = 0) => e2.evaluate(([y, d]) => { const r = chart.canvas.getBoundingClientRect(), a = chart.chartArea; return { x: r.left + chart.scales.x.getPixelForValue(y), y: r.top + a.bottom - 6 + d }; }, [year, dy]);
  const links2 = () => e2.$$eval('#erasOpen a', as => as.map(a => a.getAttribute('href')));
  pt = await plotAt(1988); await e2.mouse.click(pt.x, pt.y); await e2.waitForTimeout(80);   // near the bottom of the plot: empty space
  t.check('a click in empty space inside the plot locks that year: the links are 1988\'s and the page didn\'t navigate',
    (await links2())[0] === 'constructors.html?season=1988' && e2.url().endsWith('/eras.html') && await e2.evaluate(() => lockedYear) === 1988 && /locked/.test(await e2.$eval('#erasOpen', el => el.textContent)));
  pt = await plotAt(1989); await e2.mouse.move(pt.x, pt.y); await e2.waitForTimeout(80);
  t.check('…and hovering another year no longer changes them', (await links2())[0] === 'constructors.html?season=1988');
  const px = await e2.evaluate(() => { const c = chart.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height); return !!d; });
  t.check('the locked year is highlighted (the plugin is on the chart)', px && await e2.evaluate(() => chart.config.plugins.some(p => p.id === 'lockedSeason')));
  const onLine = await e2.evaluate(() => { const r = chart.canvas.getBoundingClientRect(), d = chart.data.datasets[0], k = d._e.seasons[1989]; return { x: r.left + chart.scales.x.getPixelForValue(1989), y: r.top + chart.scales.y.getPixelForValue(k.pos) }; });
  await e2.mouse.click(onLine.x, onLine.y); await e2.waitForTimeout(80);
  t.check('a click on a line locks its year (1989) and lights the line', (await links2())[0] === 'constructors.html?season=1989' && await e2.evaluate(() => lockedYear === 1989 && lit() !== null));
  await e2.keyboard.press('Escape'); await e2.waitForTimeout(50);   // first Escape lets go of the lit line
  t.check('Escape first lets go of the lit line, the lock stays', await e2.evaluate(() => lit() === null && lockedYear === 1989));
  await e2.keyboard.press('Escape'); await e2.waitForTimeout(50);
  t.check('the next Escape releases the locked year', await e2.evaluate(() => lockedYear === null));
  pt = await plotAt(1988); await e2.mouse.click(pt.x, pt.y); await e2.waitForTimeout(60);
  await e2.click('#erasOpen .erasUnlock'); await e2.waitForTimeout(60);
  t.check('the × next to the links also releases it, and hovering works again', await e2.evaluate(() => lockedYear === null));
  pt = await plotAt(1989); await e2.mouse.move(pt.x, pt.y); await e2.waitForTimeout(80);
  t.check('…the links follow the pointer again', (await links2())[0] === 'constructors.html?season=1989');
  await e2.done();


  // ---- #141: counting rules (best-N results, best-placed car only) ----
  const F1Counting = require('../site/counting.js');
  const row = (driverId, teamId, points, position) => ({ driverId, code: driverId.toUpperCase().slice(0, 3), name: driverId, teamId, teamName: teamId, nationality: 'British', teamNationality: 'British', number: null, position, points, session: 'race' });
  const season = [[['a', 'x', 9, 1], ['b', 'x', 6, 2], ['c', 'y', 4, 3]], [['a', 'x', 4, 3], ['b', 'x', 9, 1], ['c', 'y', 6, 2]], [['a', 'x', 6, 2], ['b', 'x', 0, null], ['c', 'y', 9, 1]]]
    .map((rows, i) => ({ round: i + 1, raceName: 'GP ' + (i + 1), country: null, raceResults: rows.map(r => row(...r)), sprintResults: null }));
  t.check('increments: best 2 of 3 — a running total that never falls and ends on the best-2 sum',
    JSON.stringify(F1Counting.increments([9, 4, 6], [1, 2, 3], [[3, 2]])) === '[9,4,2]' && JSON.stringify(F1Counting.increments([4, 9, 6], [1, 2, 3], [[3, 2]])) === '[4,9,2]');
  t.check('increments: two segments (best 1 of the first 2, best 1 of the last 2)', JSON.stringify(F1Counting.increments([3, 5, 2, 1], [1, 2, 3, 4], [[2, 1], [4, 1]])) === '[3,2,2,0]');
  t.check('a season with no rule comes back untouched', F1Counting.apply(2005, season) === season);
  // 1966: best 5 of 9 — use a 3-round fake with the rule swapped in
  const saved = F1Counting.DRIVERS[1961]; F1Counting.DRIVERS[1961] = [[3, 2]];
  const savedT = F1Counting.TEAMS[1961]; F1Counting.TEAMS[1961] = { bestCar: true, rule: [[3, 2]] };
  const cnt = F1Counting.apply(1961, season);
  const sumBy = (rounds, key, f) => { const o = {}; rounds.forEach(r => r.raceResults.forEach(x => { o[x[key]] = (o[x[key]] || 0) + f(x); })); return o; };
  const dTot = sumBy(cnt, 'driverId', x => x.points), tTot = sumBy(cnt, 'teamId', x => x.teamPoints);
  t.check('drivers: totals are the best 2 results (a 15, b 15, c 15), the dropped result adds 0 and keeps `awarded`',
    dTot.a === 15 && dTot.b === 15 && dTot.c === 15 && cnt[2].raceResults[0].awarded === 6 && cnt[2].raceResults[0].points === 2 && cnt[1].raceResults[0].awarded === 4 && cnt[1].raceResults[0].points === 4, JSON.stringify(dTot));
  t.check('teams: only the best-placed car scores for the team (the other row is 0), then the best 2 rounds count',
    tTot.x === 18 && tTot.y === 15 && cnt[0].raceResults[1].teamPoints === 0 && cnt[0].raceResults[0].teamPoints === 9 && cnt[2].raceResults[1].teamPoints === 0, JSON.stringify(tTot));
  t.check('applying it again changes nothing', JSON.stringify(F1Counting.apply(1961, cnt)) === JSON.stringify(cnt));
  if(saved) F1Counting.DRIVERS[1961] = saved; else delete F1Counting.DRIVERS[1961];
  if(savedT) F1Counting.TEAMS[1961] = savedT; else delete F1Counting.TEAMS[1961];
  t.check('1958–59 teams score by finishing position alone (no fastest-lap point for teams)', (() => {
    const fl = [[['a', 'x', 9, 1], ['b', 'x', 0.5, 6]]].map((rows, i) => ({ round: 1, raceName: 'GP', country: null, raceResults: rows.map(r => row(...r)), sprintResults: null }));
    return F1Counting.apply(1959, fl)[0].raceResults[0].teamPoints === 8; })());
  t.check('the notes say what counted', /only a driver's best 6 results counted/.test(F1Counting.note(1958, 'drivers')) && /best-placed car/.test(F1Counting.note(1960, 'teams'))
    && /best 4 from the first 7 rounds and best 4 from rounds 8–15/.test(F1Counting.note(1979, 'drivers')) && /15-point penalty/.test(F1Counting.note(2020, 'teams'))
    && F1Counting.note(2005, 'drivers') === '' && F1Counting.note(1985, 'teams') === '' && /scores a new result as awarded/.test(F1Counting.asAwardedNote(1979)) && F1Counting.asAwardedNote(2005) === '', F1Counting.note(1979, 'drivers'));

  // The real back-filled files against Jolpica's official final standings (site/data/eras.json): every driver's counted
  // total and every team's. The few that differ are listed (shared drives in 1955–56; Maserati 1958), so a wrong rule can't hide.
  const fs = require('fs'), path = require('path');
  const dataDir = path.join(__dirname, '..', 'site', 'data'), official = JSON.parse(fs.readFileSync(path.join(dataDir, 'eras.json'))).seasons;
  const known = new Set(['1955 d trintignant', '1955 d farina', '1956 d fangio', '1958 t maserati']), diffs = [];
  let compared = 0;
  for(let y = FIRST_YEAR; y <= LAST_YEAR; y++){
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, y + '.json')));
    const dt = sumBy(d.rounds, 'driverId', x => x.points), tt = sumBy(d.rounds, 'teamId', x => x.teamPoints !== undefined ? x.teamPoints : x.points);
    official[y].d.forEach(([id, , pts]) => { compared++; if(Math.abs((dt[id] || 0) - pts) > 1e-6) diffs.push(`${y} d ${id}`); });
    (official[y].t || []).forEach(([id, , pts]) => { compared++; if(Math.abs((tt[id] || 0) - pts) > 1e-6) diffs.push(`${y} t ${id}`); });
  }
  t.check(`all ${compared} official driver and team totals 1950–2020 are reproduced, except the known ones`, compared > 2000 && diffs.length === known.size && diffs.every(x => known.has(x)), diffs.join(', '));
  t.check('every season file is complete, in the pages\' shape, and 71 of them', Array.from({ length: 71 }, (_, i) => JSON.parse(fs.readFileSync(path.join(dataDir, (1950 + i) + '.json')))).every(d => d.v === 1 && d.complete && d.rounds.length === d.calendar.totalRounds));

  // ---- the pages: contributions where only the best car scored; round results; notes ----
  const cp = await h.openPage('constructors', { snapshots: { 1960: JSON.parse(fs.readFileSync(path.join(dataDir, '1960.json'))) } });
  await cp.goto('http://site.test/constructors.html?season=1960'); await h.loaded(cp);
  const contrib = await cp.evaluate(() => {
    const last = currentSeasonRounds.length, c = contributions(currentSeasonRounds, last, ['cooper-climax']);
    const t = c[0]; return { total: t.total, sum: t.drivers.reduce((s, d) => s + d.points, 0), zero: t.drivers.filter(d => d.points === 0).length, n: t.drivers.length,
      note: document.getElementById('countNote').textContent, hidden: document.getElementById('countNote').hidden };
  });
  t.check('constructors 1960: the driver contributions add up to the team total (Cooper: the official 48), and a driver who never scored for the team contributes 0',
    Math.abs(contrib.total - contrib.sum) < 1e-9 && contrib.total === 48, JSON.stringify(contrib));
  t.check('…with the note about the best-placed car', !contrib.hidden && /best-placed car/.test(contrib.note) && /best 6/.test(contrib.note), contrib.note);
  await cp.done();
  const dp = await h.openPage('drivers', { snapshots: { 1988: JSON.parse(fs.readFileSync(path.join(dataDir, '1988.json'))) } });
  await dp.goto('http://site.test/drivers.html?season=1988'); await h.loaded(dp);
  const d88 = await dp.evaluate(() => ({ note: document.getElementById('countNote').textContent, last: F1Common.standingsOrder(currentSeasonRounds, 16, 'drivers').slice(0, 2),
    senna: currentSeasonRounds.flatMap(r => r.raceResults).filter(x => x.driverId === 'senna').reduce((s, x) => s + x.points, 0) }));
  t.check('drivers 1988: the note says best 11 counted, and the standings put Senna (90 counted, 94 scored) ahead of Prost (87 counted, 105 scored)',
    /best 11 results counted/.test(d88.note) && d88.senna === 90 && d88.last.join() === 'senna,prost', JSON.stringify(d88));
  await dp.done();
  const wp = await h.openPage('whatif', { snapshots: { 1988: JSON.parse(fs.readFileSync(path.join(dataDir, '1988.json'))) } });
  await wp.goto('http://site.test/whatif.html?season=1988'); await h.loaded(wp);
  t.check('what-if 1988: says it scores as awarded', /scores a new result as awarded/.test(await wp.$eval('#countNote', e => e.textContent)));
  await wp.done();
};
