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
  t.check('the tooltip points at the link', await e.evaluate(() => { const cb = chart.options.plugins.tooltip.callbacks; return /Open 1988/.test(cb.footer([{ raw: { x: 1988 } }])); }));
  await e.done();
};
