// #203: site/pit.js — the pure helpers behind the Pit Stops page (run in Node): the saved file's shape, sessions to rounds, stops with their driver and team,
// what is in view (rounds, sessions, long and untimed stops), and the figures per driver or team and per race.
const P = require('../site/pit.js');
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
  // ---- compact: OpenF1's rows to the file's arrays ----
  const rows = [
    { driver_number: 4, lap_number: 30, date: '2025-01-01T10:30:00Z', stop_duration: 2.2, lane_duration: 21.5, pit_duration: 21.5 },
    { driver_number: 4, lap_number: 12, date: '2025-01-01T10:10:00Z', stop_duration: null, lane_duration: 22, pit_duration: 22 },
    { driver_number: 81, lap_number: 12, date: '2025-01-01T10:10:30Z', pit_duration: 24.1 }, // an older row: no lane_duration, no stop_duration (2024 and before)
    { driver_number: null, lap_number: 3 }];
  const c = P.compact(rows, [{ driver_number: 4, name_acronym: 'NOR' }, { driver_number: 81, name_acronym: 'PIA' }, { driver_number: 4, name_acronym: 'NOR' }], { key: 1, meeting: 2, name: 'Race', start: '2025-01-01T10:00:00Z', location: 'X' });
  t.check('compact: stops are [number, lap, box, lane] in lap order, a missing box time null, an old pit_duration used as the lane time, rows without a driver dropped',
    JSON.stringify(c.stops) === '[[4,12,null,22],[81,12,null,24.1],[4,30,2.2,21.5]]', JSON.stringify(c.stops));
  t.check('compact: drivers are [number, code] pairs, each once; the session’s name, start and place are kept', JSON.stringify(c.drivers) === '[[4,"NOR"],[81,"PIA"]]' && c.name === 'Race' && c.meeting === 2 && c.location === 'X' && c.key === 1);
  t.check('compact: nothing at all gives no stops', P.compact([], [], { key: 1 }).stops.length === 0 && P.compact(null, null, { key: 1 }).stops.length === 0);

  // ---- sessions to rounds ----
  const cal = { raceDates: { 11: '2026-07-19', 12: '2026-08-02', 13: '2026-08-30' } };
  t.check('a Race belongs to the round with its date, a Sprint (the day before) to the same round', P.roundOf('2026-07-19T13:00:00+00:00', cal) === 11 && P.roundOf('2026-07-18T11:00:00+00:00', cal) === 11 && P.roundOf('2026-08-02T13:00:00+00:00', cal) === 12);
  t.check('a race that starts late in the evening, a day after its date in UTC, still fits', P.roundOf('2026-08-03T01:00:00+00:00', cal) === 12);
  t.check('a session far from any round, or no calendar, belongs to none', P.roundOf('2026-09-30T13:00:00+00:00', cal) === null && P.roundOf('2026-07-19T13:00:00+00:00', null) === null && P.roundOf('2026-07-19T13:00:00+00:00', {}) === null);

  // ---- stops with their driver and team ----
  const res = (code, id, team) => ({ code, driverId: id, name: 'Driver ' + code, teamId: team, teamName: 'Team ' + team });
  const rounds = [{ round: 11, raceResults: [res('DA0', 'a0', 'alpha'), res('DA1', 'a1', 'alpha'), res('DB0', 'b0', 'beta'), res('DB1', 'b1', 'beta'), res('DC0', 'c0', 'gamma'), res('DC1', 'c1', 'gamma')] },
    { round: 12, raceResults: [res('DA0', 'a0', 'alpha'), res('DA1', 'a1', 'beta'), res('DB0', 'b0', 'beta'), res('DB1', 'b1', 'beta'), res('DC0', 'c0', 'gamma'), res('DC1', 'c1', 'gamma')] }]; // DA1 moved to beta in round 12
  const make = key => fx.SESSIONS.find(s => s.session_key === key);
  const file = { v: 1, year: 2026, sessions: [305, 303, 105, 205].map(k => P.compact(fx.pitFor(k), fx.driversFor(k), { key: k, meeting: make(k).meeting_key, name: make(k).session_name, start: make(k).date_start, location: make(k).location })) };
  const stops = P.stopsOf(file, { raceDates: { 11: '2026-07-19', 12: '2026-08-02', 13: '2026-08-30' } }, rounds);
  t.check('every stop of the rounds that have results: 7 + 1 + 6 (round 13’s race has no results yet)', stops.length === 14 && stops.every(s => s.round === 11 || s.round === 12), stops.length);
  const da0 = stops.filter(s => s.code === 'DA0');
  t.check('stops are numbered per driver and session in lap order', da0.filter(s => s.round === 11).map(s => s.n + ':' + s.lap).join() === '1:12,2:30' && da0.find(s => s.round === 12).n === 1);
  t.check('the team is the driver’s team in that round (DA1 changed team)', stops.find(s => s.code === 'DA1' && s.round === 11).teamId === 'alpha' && stops.find(s => s.code === 'DA1' && s.round === 12).teamId === 'beta');
  t.check('a stop over 10 s is long; a missing box time is not', stops.find(s => s.code === 'DC0' && s.round === 11).long === true && stops.find(s => s.code === 'DB1' && s.round === 11).long === false && stops.find(s => s.code === 'DB1' && s.round === 11).stop === null);
  t.check('a driver the round has no result for is left out', P.stopsOf({ sessions: [{ ...file.sessions[1], drivers: [[63, 'ZZZ']] }] }, cal, rounds).length === 0);
  t.check('no file, or a session no round fits, gives nothing', P.stopsOf(null, cal, rounds).length === 0 && P.stopsOf(file, null, rounds).length === 0);

  // ---- what is in view ----
  let v = P.select(stops, {});
  t.check('everything in view by default: 14 stops; 1 without a box time, 1 long (left out), 12 used', v.inView.length === 14 && v.untimed === 1 && v.long === 1 && v.used.length === 12, JSON.stringify([v.inView.length, v.untimed, v.long, v.used.length]));
  v = P.select(stops, { longs: true });
  t.check('with long stops included the long one is used and nothing is counted as left out', v.used.length === 13 && v.long === 0);
  v = P.select(stops, { from: 12, to: 12 });
  t.check('one round: its 6 stops', v.inView.length === 6 && v.untimed === 0 && v.long === 0);
  v = P.select(stops, { from: 1, to: 11, kinds: new Set(['Sprint']) });
  t.check('one kind of session: the Sprint’s single stop', v.inView.length === 1 && v.inView[0].code === 'DC1' && v.inView[0].kind === 'Sprint');
  t.check('an empty range gives nothing', P.select(stops, { from: 13, to: 14 }).inView.length === 0);

  // ---- figures ----
  const all = P.select(stops, {}), by = (rows, id) => rows.find(r => r.id === id);
  let ag = P.aggregate(all, 'drivers');
  t.check('drivers: everyone with a stop in view is listed (6)', ag.length === 6);
  let d = by(ag, 'a0');
  t.check('DA0: 3 stops of 2.4, 2.2, 2.3 → fastest 2.2, average 2.3, median 2.3, 3 of 3 used', d.n === 3 && d.total === 3 && near(d.fastest, 2.2) && near(d.mean, 2.3) && near(d.median, 2.3) && d.best.lap === 30, JSON.stringify(d));
  d = by(ag, 'b1');
  t.check('DB1: one untimed stop is counted in the total but not in the figures (1 of 2)', d.n === 1 && d.total === 2 && near(d.fastest, 2.8) && near(d.median, 2.8));
  d = by(ag, 'c0');
  t.check('DC0: the 15.3 s stop is left out (1 of 2 used, fastest 3.0) and counted when long stops are included (median of 15.3 and 3.0 is 9.15)', d.n === 1 && d.total === 2 && near(d.fastest, 3.0) && near(by(P.aggregate(P.select(stops, { longs: true }), 'drivers'), 'c0').median, 9.15));
  d = by(ag, 'c1');
  t.check('an odd count takes the middle stop, and the average is not the median (DC1: 3.1, 2.8, 2.4)', near(d.median, 2.8) && near(d.mean, (3.1 + 2.8 + 2.4) / 3) && near(d.fastest, 2.4));
  ag = P.aggregate(all, 'teams');
  const alpha = by(ag, 'alpha'), beta = by(ag, 'beta');
  t.check('teams: alpha has DA0’s 3 stops and DA1’s round 11 stop (4 stops, median 2.35), beta DA1’s round 12 stop and its own drivers’ 4 (5 in all)', ag.length === 3 && alpha.total === 4 && near(alpha.median, 2.35) && near(alpha.fastest, 2.2) && beta.total === 5, JSON.stringify([alpha, beta].map(x => [x.total, x.n, x.median])));
  t.check('a team’s figures cover all its drivers’ used stops: gamma 4 of 5, fastest 2.4', by(ag, 'gamma').n === 4 && by(ag, 'gamma').total === 5 && near(by(ag, 'gamma').fastest, 2.4));
  const none = P.aggregate({ inView: [{ driverId: 'x', teamId: 'y', name: 'X', code: 'XXX', teamName: 'Y', stop: null }], used: [] }, 'drivers')[0];
  t.check('someone with stops but none timed is listed with no figures', none.total === 1 && none.n === 0 && none.fastest === null && none.mean === null && none.median === null && none.best === null);

  // ---- race by race ----
  const pr = P.perRound(all, 'drivers', 'median');
  t.check('per race: the rounds that have a stop, in order', JSON.stringify(pr.rounds) === '[11,12]');
  t.check('per race: DA0’s median is 2.3 in both rounds (2.4 and 2.2, then 2.3); DC1’s 2.95 then 2.4 (Race and Sprint together in round 11)', near(pr.series.a0[0], 2.3) && near(pr.series.a0[1], 2.3) && near(pr.series.c1[0], 2.95) && near(pr.series.c1[1], 2.4), JSON.stringify(pr.series.c1));
  t.check('per race: a round with no used stop is null (DC0’s only round 11 stop is long)', pr.series.c0[0] === null && near(pr.series.c0[1], 3.0));
  t.check('per race: fastest and average work too', near(P.perRound(all, 'drivers', 'fastest').series.a0[0], 2.2) && near(P.perRound(all, 'teams', 'mean').series.alpha[0], (2.4 + 2.2 + 2.9) / 3));

  t.check('fmt: one decimal by default, two on request, a dash for nothing', P.fmt(2.34) === '2.3' && P.fmt(2.345, 2) === '2.35' && P.fmt(null) === '–' && P.fmt(undefined) === '–');
  t.check('median and mean of nothing are null', P.median([]) === null && P.mean([]) === null);
  t.check('box times start in 2025', P.FIRST_YEAR === 2025 && P.LONG === 10);

  // ---- the committed files (site/data/pit/), written by tools/pit-snapshot.mjs ----
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'site', 'data', 'pit');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)) : [];
  const parsed = files.map(f => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]);
  t.check('the saved seasons start in 2025 and each file is versioned with its year', files.length > 0 && parsed.every(([f, j]) => j.v === 1 && f === j.year + '.json' && j.year >= P.FIRST_YEAR), files.join());
  t.check('every saved session is a Race or Sprint of that year, in date order, with [number, code] drivers and [number, lap, box|null, lane|null] stops', parsed.every(([f, j]) => j.sessions.length > 0 &&
    j.sessions.every((x, i, a) => P.KINDS.includes(x.name) && x.start.startsWith(String(j.year)) && (!i || a[i - 1].start <= x.start) && x.drivers.every(d => typeof d[0] === 'number' && /^[A-Z]{3}$/.test(d[1])) &&
      x.stops.every(st => st.length === 4 && typeof st[0] === 'number' && st[1] > 0 && (st[2] === null || st[2] > 0) && (st[3] === null || st[3] > 0)))));
};
