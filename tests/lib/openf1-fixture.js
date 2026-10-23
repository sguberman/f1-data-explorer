// A fake OpenF1 (#186): two weekends in 2026 (Singapore, Austin), six drivers in three teams, deterministic laps.
// The "now" the tests use is 2026-10-24 01:00 UTC: Singapore is over; Austin has run FP1 and FP2 only.
const NOW = '2026-10-24T01:00:00Z';

const SESSIONS = [];
const add = (meeting, loc, country, key, name, start, end) => SESSIONS.push({ meeting_key: meeting, session_key: key, session_name: name, session_type: /Pract/.test(name) ? 'Practice' : name,
  date_start: start, date_end: end, location: loc, country_name: country, country_code: 'XXX', circuit_key: meeting, circuit_short_name: loc, gmt_offset: '00:00:00', year: 2026, is_cancelled: false });
add(1, 'Marina Bay', 'Singapore', 101, 'Practice 1', '2026-10-09T08:30:00+00:00', '2026-10-09T09:30:00+00:00');
add(1, 'Marina Bay', 'Singapore', 102, 'Practice 2', '2026-10-09T12:00:00+00:00', '2026-10-09T13:00:00+00:00');
add(1, 'Marina Bay', 'Singapore', 103, 'Practice 3', '2026-10-10T08:30:00+00:00', '2026-10-10T09:30:00+00:00');
add(1, 'Marina Bay', 'Singapore', 104, 'Qualifying', '2026-10-10T13:00:00+00:00', '2026-10-10T14:00:00+00:00');
add(1, 'Marina Bay', 'Singapore', 105, 'Race', '2026-10-11T12:00:00+00:00', '2026-10-11T14:00:00+00:00');
add(2, 'Austin', 'United States', 201, 'Practice 1', '2026-10-23T17:30:00+00:00', '2026-10-23T18:30:00+00:00');
add(2, 'Austin', 'United States', 202, 'Practice 2', '2026-10-23T21:00:00+00:00', '2026-10-23T22:00:00+00:00');
add(2, 'Austin', 'United States', 203, 'Practice 3', '2026-10-24T17:30:00+00:00', '2026-10-24T18:30:00+00:00');
add(2, 'Austin', 'United States', 204, 'Qualifying', '2026-10-24T21:00:00+00:00', '2026-10-24T22:00:00+00:00');
add(2, 'Austin', 'United States', 205, 'Race', '2026-10-25T20:00:00+00:00', '2026-10-25T22:00:00+00:00');

// number, acronym, name, team, colour
const DRIVERS = [[1, 'AAA', 'Alice Alpha', 'Alpha', 'FF0000'], [2, 'BBB', 'Bob Alpha', 'Alpha', 'FF0000'], [3, 'CCC', 'Cara Beta', 'Beta', '0000FF'],
  [4, 'DDD', 'Dan Beta', 'Beta', '0000FF'], [5, 'EEE', 'Eve Gamma', 'Gamma', '00AA00'], [6, 'FFF', 'Finn Gamma', 'Gamma', '00AA00']];

const driversFor = key => DRIVERS.map(([n, a, name, team, c]) => ({ meeting_key: 0, session_key: key, driver_number: n, name_acronym: a, full_name: name, broadcast_name: name.toUpperCase(),
  team_name: team, team_colour: c, headshot_url: null }));

// Each driver: lap 1 pit-out, laps 2–5 push on softs, lap 6 in-lap; lap 7 pit-out, laps 8–10 push on mediums, lap 11 a slow cool-down lap
// (no in-lap flag: it is the last lap). Driver 6's lap 4 has no time at all, driver 5's lap 3 has no sector 1. The bests of the three sectors
// come from different laps, so the ideal lap is quicker than the best lap.
const lapsFor = key => {
  const out = [];
  DRIVERS.forEach(([n], i) => {
    for(let k = 1; k <= 11; k++){
      const push = (k >= 2 && k <= 5) || (k >= 8 && k <= 10);
      let s1 = 28 + i * 0.05 + (k % 3) * 0.02, s2 = 35 + i * 0.02 + (k % 2) * 0.03, s3 = 27 + i * 0.3 + (k % 4) * 0.02, t = s1 + s2 + s3;
      if(k === 1 || k === 7) t += 9;
      if(k === 6) t += 12;
      if(k === 11) t = t * 1.3;
      const r = x => Math.round(x * 1000) / 1000;
      out.push({ meeting_key: 0, session_key: key, driver_number: n, lap_number: k, date_start: '2026-10-23T17:40:00+00:00',
        duration_sector_1: r(s1), duration_sector_2: r(s2), duration_sector_3: r(s3), lap_duration: r(t),
        i1_speed: 280 + i, i2_speed: 190 + k, st_speed: 320 - i * 2 + (push ? k % 2 : -20), is_pit_out_lap: k === 1 || k === 7,
        segments_sector_1: [], segments_sector_2: [], segments_sector_3: [] });
    }
  });
  const f = out.find(l => l.driver_number === 6 && l.lap_number === 4); f.lap_duration = null; f.duration_sector_1 = null;
  out.find(l => l.driver_number === 5 && l.lap_number === 3).duration_sector_1 = null;
  return out;
};
const stintsFor = key => DRIVERS.flatMap(([n]) => [
  { meeting_key: 0, session_key: key, stint_number: 1, driver_number: n, lap_start: 1, lap_end: 6, compound: 'SOFT', tyre_age_at_start: 0 },
  { meeting_key: 0, session_key: key, stint_number: 2, driver_number: n, lap_start: 7, lap_end: 11, compound: 'MEDIUM', tyre_age_at_start: 3 }]);

// Answers a request to https://api.openf1.org/v1/…; `empty` lists session keys with no data yet.
function answer(url, { empty = [] } = {}){
  const u = new URL(url), key = +u.searchParams.get('session_key');
  const path = u.pathname.replace(/^\/v1/, '');
  if(path === '/sessions') return SESSIONS;
  if(empty.includes(key)) return [];
  if(path === '/laps') return lapsFor(key);
  if(path === '/stints') return stintsFor(key);
  if(path === '/drivers') return driversFor(key);
  return null;
}
module.exports = { NOW, SESSIONS, DRIVERS, answer, lapsFor, stintsFor, driversFor };
