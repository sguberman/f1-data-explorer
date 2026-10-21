// #157: f1api.dev sometimes repeats a driver within a round and leaves another out (2024 round 24 listed Pérez twice and no
// Lawson). tools/snapshot.mjs rebuilds such a round from Jolpica's result for it; and no season file from 2014 on repeats a
// driver any more. Plain Node, no browser.
const fs = require('fs'), path = require('path');
module.exports = async (t, h) => {
  const { repeatedDrivers, hasRepeatedDrivers, repairRepeatedDrivers } = await import('../tools/snapshot.mjs');

  const row = (id, pos, extra = {}) => ({ driverId: id, code: id.toUpperCase(), name: 'N ' + id, teamId: 't_' + id, teamName: 'T ' + id, number: 1, nationality: 'X', teamNationality: 'Y', position: pos, points: 0, session: 'race', ...extra });
  t.check('repeated drivers are found, once each', JSON.stringify(repeatedDrivers([row('a', 1), row('b', 2), row('a', null), row('a', 3)])) === '["a"]' && repeatedDrivers([row('a', 1), row('b', 2)]).length === 0 && repeatedDrivers(null).length === 0);

  // Round 2 repeats x and has no y; Jolpica has x (1st), z (2nd) and y (retired)
  const snap = { year: 2031, rounds: [
    { round: 1, raceName: 'R1', raceResults: [row('x', 1, { points: 25 }), row('y', 2, { points: 18, teamId: 'rb', number: 30 }), row('z', 3, { points: 15 })], sprintResults: null },
    { round: 2, raceName: 'R2', raceResults: [row('x', 1, { points: 25, number: 7 }), row('z', 2, { points: 18 }), row('x', null)], sprintResults: null },
  ] };
  t.check('the season is flagged', hasRepeatedDrivers(snap) && !hasRepeatedDrivers({ rounds: [snap.rounds[0]] }));
  const urls = [];
  const jol = { Results: [{ positionText: '1', points: '25', Driver: { driverId: 'x' } }, { positionText: '2', points: '18', Driver: { driverId: 'z' } }, { positionText: 'R', points: '0', Driver: { driverId: 'y' } }] };
  const fake = async url => { urls.push(url); return /\/2031\/2\/results\.json$/.test(url) ? { ok: true, status: 200, json: async () => ({ MRData: { RaceTable: { Races: [jol] } } }) } : { ok: false, status: 404 }; };
  const out = await repairRepeatedDrivers(snap, fake);
  const r2 = out.snap.rounds[1].raceResults;
  t.check('only the broken round is fetched, from Jolpica, and it is the one repaired', urls.length === 1 && /ergast\/f1\/2031\/2\/results\.json$/.test(urls[0]) && JSON.stringify(out.repaired) === '[2]');
  t.check('its drivers, order, positions and points are Jolpica\'s (not classified = null)', JSON.stringify(r2.map(x => [x.driverId, x.position, x.points])) === JSON.stringify([['x', 1, 25], ['z', 2, 18], ['y', null, 0]]), JSON.stringify(r2.map(x => [x.driverId, x.position, x.points])));
  t.check('a driver already in the round keeps their row\'s details; the missing one gets theirs from another round', r2[0].number === 7 && r2[2].teamId === 'rb' && r2[2].number === 30 && r2[2].code === 'Y' && r2[2].session === 'race');
  t.check('the other round is untouched and nobody is repeated any more', out.snap.rounds[0] === snap.rounds[0] && !hasRepeatedDrivers(out.snap));
  urls.length = 0;
  const clean = await repairRepeatedDrivers({ year: 2031, rounds: [snap.rounds[0]] }, fake);
  t.check('a season without repeats is returned as it is, with no request', urls.length === 0 && clean.repaired.length === 0 && clean.snap.rounds[0] === snap.rounds[0]);
  let err1 = null, err2 = null;
  try { await repairRepeatedDrivers(snap, async () => ({ ok: false, status: 500 })); } catch (e) { err1 = e.message; }
  const lone = { year: 2031, rounds: [snap.rounds[1]] }; // y has no other row this season
  try { await repairRepeatedDrivers(lone, fake); } catch (e) { err2 = e.message; }
  t.check('a failing source, or a driver with no details anywhere, throws (so nothing is overwritten)', /HTTP 500/.test(err1 || '') && /no other row/.test(err2 || ''), `${err1} | ${err2}`);

  // ---- The committed season files ----
  const dir = path.join(__dirname, '..', 'site', 'data'), bad = [];
  const last = Math.max(...fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)));
  for (let y = 2014; y <= last; y++) for (const r of JSON.parse(fs.readFileSync(path.join(dir, `${y}.json`), 'utf8')).rounds) {
    const d1 = repeatedDrivers(r.raceResults), d2 = repeatedDrivers(r.sprintResults);
    if (d1.length || d2.length) bad.push(`${y} R${r.round}: ${[...d1, ...d2].join(',')}`);
  }
  t.check('no season file from 2014 on repeats a driver in a round', bad.length === 0, bad.join('; '));
  const r24 = JSON.parse(fs.readFileSync(path.join(dir, '2024.json'), 'utf8')).rounds[23].raceResults;
  t.check('2024 round 24: Pérez once, Lawson 17th, 20 drivers', r24.length === 20 && r24.filter(x => x.driverId === 'perez').length === 1 && (r24.find(x => x.driverId === 'lawson') || {}).position === 17, JSON.stringify(r24.map(x => x.driverId)));
};
