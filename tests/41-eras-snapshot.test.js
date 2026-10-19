// #135: tools/eras-snapshot.mjs builds site/data/eras.json (final standings since 1950) from Jolpica. A fake
// Jolpica answers: driver standings for every year, constructor standings from 1958 only (404 before), a
// "not ranked" row, a retry after HTTP 429.
module.exports = async (t, h) => {
  const { buildEras, buildSeason, FIRST_YEAR } = await import('../tools/eras-snapshot.mjs');
  const calls = [];
  const jolpica = ({ failYear = null, flaky = false } = {}) => {
    let limited = flaky;
    return async url => {
      calls.push(url);
      const m = url.match(/\/f1\/(\d{4})\/(driver|constructor)standings\.json\?limit=100$/);
      if(!m) return { ok: false, status: 404, json: async () => ({}) };
      const year = +m[1], kind = m[2];
      if(limited){ limited = false; return { ok: false, status: 429, json: async () => ({}) }; }
      if(year === failYear) return { ok: false, status: 503, json: async () => ({}) };
      if(kind === 'constructor' && year < 1958) return { ok: false, status: 404, json: async () => ({}) };
      const rows = kind === 'driver'
        ? [{ position: '1', positionText: '1', points: '10.5', Driver: { driverId: 'a' + year, givenName: 'Ann', familyName: 'Year' + year }, Constructors: [{ constructorId: 'ferrari', name: 'Ferrari' }] },
           { position: '-', positionText: 'D', points: '0', Driver: { driverId: 'dq', givenName: 'Dan', familyName: 'Disq' }, Constructors: [] }]
        : [{ position: '1', positionText: '1', points: '30', Constructor: { constructorId: 'ferrari', name: 'Ferrari' } }];
      const list = { season: String(year), round: String(year === 1959 ? 4 : 9) };
      list[kind === 'driver' ? 'DriverStandings' : 'ConstructorStandings'] = rows;
      return { ok: true, status: 200, json: async () => ({ MRData: { StandingsTable: { StandingsLists: [list] } } }) };
    };
  };
  const noWait = async () => {};

  const e = await buildEras(null, 1959, jolpica(), { now: 7, wait: noWait });
  t.check('a season per year from 1950 to the current year', Object.keys(e.seasons).join() === Array.from({ length: 10 }, (_, i) => 1950 + i).join() && FIRST_YEAR === 1950);
  t.check('driver rows: id, position, points (fractions kept), team; not-ranked rows left out',
    JSON.stringify(e.seasons[1950].d) === '[["a1950",1,10.5,"ferrari"]]', JSON.stringify(e.seasons[1950].d));
  t.check('no constructor standings before 1958, and no failure for that', e.seasons[1957].t.length === 0 && e.seasons[1958].t.length === 1 && JSON.stringify(e.seasons[1958].t[0]) === '["ferrari",1,30]');
  t.check('names are collected, drivers with a family name for labels', e.drivers.a1950.n === 'Ann Year1950' && e.drivers.a1950.s === 'Year1950' && e.teams.ferrari.n === 'Ferrari' && !e.drivers.dq);
  t.check('the current season is marked partial, with its round', e.partial === 1959 && e.seasons[1959].round === 4 && e.v === 1 && e.generatedAt === 7);
  t.check('a finished current season (its season file says complete) isn\'t partial', (await buildEras(null, 1951, jolpica(), { wait: noWait, inProgress: false })).partial === null);

  // Incremental: only the current season is fetched again.
  calls.length = 0;
  const e2 = await buildEras(e, 1959, jolpica(), { wait: noWait });
  t.check('an update fetches only the current season (2 requests)', calls.length === 2 && calls.every(u => u.includes('/1959/')), calls.join());
  t.check('…and keeps the rest as it was', JSON.stringify(e2.seasons[1950]) === JSON.stringify(e.seasons[1950]));
  calls.length = 0;
  const e3 = await buildEras(e, 1960, jolpica(), { wait: noWait });
  t.check('a new year is added, and the season that was in progress is fetched once more (now final), nothing older',
    Object.keys(e3.seasons).length === 11 && calls.length === 4 && calls.every(u => /\/19(59|60)\//.test(u)) && e3.partial === 1960, calls.join());
  calls.length = 0;
  await buildEras(e, 1959, jolpica(), { wait: noWait, all: true });
  t.check('--all fetches every season again', calls.length === 12, String(calls.length));

  // Politeness and failure.
  calls.length = 0;
  const flaky = await buildSeason(1960, { drivers: {}, teams: {} }, jolpica({ flaky: true }), noWait, noWait);
  t.check('HTTP 429 is retried', flaky.d.length === 1 && calls.length === 3, String(calls.length));
  let err = null;
  try{ await buildEras(null, 1959, jolpica({ failYear: 1955 }), { wait: noWait }); }catch(x){ err = x.message; }
  t.check('Jolpica being down for a season stops the build (nothing is written from a half-built file)', !!err && /1955/.test(err) && /503/.test(err), String(err));
  t.check('the original file object is never changed', JSON.stringify(Object.keys(e.seasons)) === JSON.stringify(Object.keys(e2.seasons)) && e.partial === 1959);
};
