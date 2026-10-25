// #199: all results come from Jolpica (the Ergast API's successor). The snapshot tool pages through a season's results and
// sprints, the pages' live path asks round by round, and both must give the same rows. Plain Node, no browser.
module.exports = async (t, h) => {
  const { buildSnapshot, loadF1Data } = await import('../tools/snapshot.mjs');
  const { api, COMPLETED, TOTAL, SPRINTS, CITIES } = require('./lib/fixture');
  const urls = [];
  const fakeFetch = async url => { urls.push(url); const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const snap = await buildSnapshot(2026, fakeFetch, 0);
  const sprintRounds = SPRINTS.filter(r => r <= COMPLETED);

  t.check('the snapshot has every run round, the calendar every round', snap.rounds.length === COMPLETED && snap.calendar.totalRounds === TOTAL && !snap.complete);
  t.check('…and the sprints on the sprint rounds only', JSON.stringify(snap.rounds.filter(r => r.sprintResults).map(r => r.round)) === JSON.stringify(sprintRounds)
    && JSON.stringify(snap.calendar.sprintRounds) === JSON.stringify(SPRINTS));
  t.check('requests: the season\'s results and sprints in pages of 100 and the calendar, all from Jolpica', urls.every(u => u.startsWith('https://api.jolpi.ca/ergast/f1/2026'))
    && urls.some(u => /2026\/results\.json\?limit=100&offset=100$/.test(u)) && urls.some(u => /2026\/sprint\.json\?limit=100/.test(u)) && urls.some(u => /2026\.json\?limit=30$/.test(u)), urls.join(' '));
  const row = snap.rounds[0].raceResults[0];
  t.check('a row has the driver\'s name, code, number, team and nationalities', row.name === row.name.trim() && /^Driver\d+ Team\d$/.test(row.name) && /^D[A-K]\d$/.test(row.code)
    && Number.isInteger(row.number) && !!row.teamName && !!row.teamNationality && !!row.nationality && row.session === 'race', JSON.stringify(row));
  const nc = snap.rounds.flatMap(r => r.raceResults).filter(q => q.position === null);
  t.check('letters in positionText (R, D, N) are not classified (position null, no points); numbers are classified', nc.length > 0 && nc.every(q => q.points === 0));
  t.check('the round\'s country comes from its circuit', snap.rounds.every(r => r.country && r.country.length > 1));
  t.check('the calendar has dates, times (none for round 22 if unknown), countries and cities (none for round 22)', Object.keys(snap.calendar.raceDates).length === TOTAL
    && !snap.calendar.raceTimes[22] && !!snap.calendar.raceTimes[1] && !snap.calendar.cities[22] && snap.calendar.cities[1] === CITIES[0] && Object.keys(snap.calendar.countries).length === TOTAL);

  // The pages' own way (round by round, no season file) gives the same rounds.
  const live = await loadF1Data(fakeFetch).loadSeason(2026, { live: true });
  t.check('loading round by round gives the snapshot\'s rounds exactly', !live.failed && JSON.stringify(live.rounds) === JSON.stringify(snap.rounds));
  // A year Jolpica has nothing for: a clean 404 is "no such season", not a failure.
  const none = await loadF1Data(fakeFetch).loadSeason(1999, { live: true });
  t.check('a season with no data loads empty, not failed', none.rounds.length === 0 && !none.failed);
  let err = null;
  try { await buildSnapshot(1999, fakeFetch, 0); } catch (e) { err = e.message; }
  t.check('the snapshot tool throws on a source that fails (so no file is overwritten)', /HTTP 404/.test(err || ''), err);
};
