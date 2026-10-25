// A fake OpenF1 (#186): the weekends of rounds 11, 12 and 13 of the fake 2026 season in lib/fixture.js (Grand Prix on 2026-07-19, 2026-08-02 and 2026-08-30),
// two drivers in each of three teams, deterministic laps. Their codes (DA0 … DC1) are the fake f1api.dev drivers' codes, so the page
// can match them; OpenF1's team colours are not the site's on purpose. A reserve driver (ZZZ) drives FP1 only and is not in the season.
// Round 11 is a sprint weekend (FP1, Sprint Qualifying, Sprint, Qualifying, Race). The "now" the tests use is 2026-08-28 17:00 UTC: round 12 is over; round 13 has run FP1 and FP2 only.
const NOW = '2026-08-28T17:00:00Z';

const SESSIONS = [];
const add = (meeting, loc, country, key, name, start, end) => SESSIONS.push({ meeting_key: meeting, session_key: key, session_name: name, session_type: /Pract|Day/.test(name) ? 'Practice' : name,
  date_start: start, date_end: end, location: loc, country_name: country, country_code: 'XXX', circuit_key: meeting, circuit_short_name: loc, gmt_offset: '00:00:00', year: 2026, is_cancelled: false });
add(9, 'Sakhir', 'Bahrain', 91, 'Day 1', '2026-02-11T07:00:00+00:00', '2026-02-11T16:00:00+00:00'); // pre-season testing: not a weekend
add(3, 'Silverstone', 'United Kingdom', 301, 'Practice 1', '2026-07-17T11:30:00+00:00', '2026-07-17T12:30:00+00:00'); // round 11
add(3, 'Silverstone', 'United Kingdom', 302, 'Sprint Qualifying', '2026-07-17T15:30:00+00:00', '2026-07-17T16:30:00+00:00'); // round 11 is a sprint weekend
add(3, 'Silverstone', 'United Kingdom', 303, 'Sprint', '2026-07-18T11:00:00+00:00', '2026-07-18T12:00:00+00:00');
add(3, 'Silverstone', 'United Kingdom', 304, 'Qualifying', '2026-07-18T15:00:00+00:00', '2026-07-18T16:00:00+00:00');
add(3, 'Silverstone', 'United Kingdom', 305, 'Race', '2026-07-19T13:00:00+00:00', '2026-07-19T15:00:00+00:00');
add(1, 'Budapest', 'Hungary', 101, 'Practice 1', '2026-07-31T11:30:00+00:00', '2026-07-31T12:30:00+00:00');
add(1, 'Budapest', 'Hungary', 102, 'Practice 2', '2026-07-31T15:00:00+00:00', '2026-07-31T16:00:00+00:00');
add(1, 'Budapest', 'Hungary', 103, 'Practice 3', '2026-08-01T10:30:00+00:00', '2026-08-01T11:30:00+00:00');
add(1, 'Budapest', 'Hungary', 104, 'Qualifying', '2026-08-01T14:00:00+00:00', '2026-08-01T15:00:00+00:00');
add(1, 'Budapest', 'Hungary', 105, 'Race', '2026-08-02T13:00:00+00:00', '2026-08-02T15:00:00+00:00');
add(2, 'Zandvoort', 'Netherlands', 201, 'Practice 1', '2026-08-28T11:30:00+00:00', '2026-08-28T12:30:00+00:00');
add(2, 'Zandvoort', 'Netherlands', 202, 'Practice 2', '2026-08-28T15:00:00+00:00', '2026-08-28T16:00:00+00:00');
add(2, 'Zandvoort', 'Netherlands', 203, 'Practice 3', '2026-08-29T10:30:00+00:00', '2026-08-29T11:30:00+00:00');
add(2, 'Zandvoort', 'Netherlands', 204, 'Qualifying', '2026-08-29T14:00:00+00:00', '2026-08-29T15:00:00+00:00');
add(2, 'Zandvoort', 'Netherlands', 205, 'Race', '2026-08-30T13:00:00+00:00', '2026-08-30T15:00:00+00:00');

// number, acronym, name, OpenF1's team name, OpenF1's team colour
const DRIVERS = [[63, 'DA0', 'Alice Alpha', 'Mercedes', '111111'], [12, 'DA1', 'Bob Alpha', 'Mercedes', '111111'], [16, 'DB0', 'Cara Beta', 'Ferrari', '222222'],
  [44, 'DB1', 'Dan Beta', 'Ferrari', '222222'], [1, 'DC0', 'Eve Gamma', 'McLaren', '333333'], [81, 'DC1', 'Finn Gamma', 'McLaren', '333333']];
const RESERVE = [99, 'ZZZ', 'Zed Reserve', 'Mercedes', '111111'];
const roster = key => key % 100 === 1 ? [...DRIVERS, RESERVE] : DRIVERS;

const driversFor = key => roster(key).map(([n, a, name, team, c]) => ({ meeting_key: 0, session_key: key, driver_number: n, name_acronym: a, full_name: name, broadcast_name: name.toUpperCase(),
  team_name: team, team_colour: c, headshot_url: null }));

// Each driver: lap 1 pit-out, laps 2–5 push on softs, lap 6 in-lap; lap 7 pit-out, laps 8–10 push on mediums, lap 11 a slow cool-down lap
// (no in-lap flag: it is the last lap). Driver 6's lap 4 has no time at all, driver 5's lap 3 has no sector 1. The bests of the three sectors
// come from different laps, so the ideal lap is quicker than the best lap.
const startOf = key => Date.parse(SESSIONS.find(x => x.session_key === key).date_start);
const MIN = 60e3;
// Qualifying runs in three parts, 18, 15 and 12 minutes long with breaks between; a driver's laps 1–4 are in Q1, 5–8 in Q2 and 9–11 in Q3.
const qualiOffset = k => k <= 4 ? (k - 1) * 4 * MIN : k <= 8 ? 25 * MIN + (k - 5) * 4 * MIN : 47 * MIN + (k - 9) * 4 * MIN;
const nameOf = key => SESSIONS.find(x => x.session_key === key).session_name, isQuali = key => /Qualifying/.test(nameOf(key));
const lapsFor = key => {
  const out = [], quali = isQuali(key);
  roster(key).forEach(([n], i) => {
    for(let k = 1; k <= 11; k++){
      const push = (k >= 2 && k <= 5) || (k >= 8 && k <= 10);
      let s1 = 28 + i * 0.05 + (k % 3) * 0.02, s2 = 35 + i * 0.02 + (k % 2) * 0.03, s3 = 27 + i * 0.3 + (k % 4) * 0.02, t = s1 + s2 + s3;
      if(k === 1 || k === 7) t += 9;
      if(k === 6) t += 12;
      if(k === 11) t = t * 1.3;
      const r = x => Math.round(x * 1000) / 1000;
      out.push({ meeting_key: 0, session_key: key, driver_number: n, lap_number: k, date_start: new Date(startOf(key) + (quali ? qualiOffset(k) : (k - 1) * 150e3) + i * 5e3).toISOString(),
        duration_sector_1: r(s1), duration_sector_2: r(s2), duration_sector_3: r(s3), lap_duration: r(t),
        i1_speed: 280 + i, i2_speed: 190 + k, st_speed: 320 - i * 2 + (push ? k % 2 : -20), is_pit_out_lap: k === 1 || k === 7,
        segments_sector_1: [], segments_sector_2: [], segments_sector_3: [] });
    }
  });
  const f = out.find(l => l.driver_number === 81 && l.lap_number === 4); f.lap_duration = null; f.duration_sector_1 = null;
  out.find(l => l.driver_number === 1 && l.lap_number === 3).duration_sector_1 = null;
  return out;
};
const stintsFor = key => roster(key).flatMap(([n]) => [
  { meeting_key: 0, session_key: key, stint_number: 1, driver_number: n, lap_start: 1, lap_end: 6, compound: 'SOFT', tyre_age_at_start: 0 },
  { meeting_key: 0, session_key: key, stint_number: 2, driver_number: n, lap_start: 7, lap_end: 11, compound: 'MEDIUM', tyre_age_at_start: 3 }]);

// Race control: when each qualifying part starts and finishes (and a red flag in Q1 that stops it and restarts it).
const raceControlFor = key => {
  // the Budapest race (105): a virtual safety car over laps 3–4 and the safety car over laps 9–10 (normal lap times, so only the messages mark them)
  if(key === 105){ const t0 = startOf(key), at = m => new Date(t0 + m * MIN).toISOString(), sc = (m, message, lap) => ({ date: at(m), category: 'SafetyCar', message, lap_number: lap, flag: null, session_key: key, meeting_key: 0 });
    return [{ date: at(0), category: 'SessionStatus', message: 'SESSION STARTED', flag: null, session_key: key, meeting_key: 0 }, sc(5, 'VSC DEPLOYED', 3), sc(9, 'VSC ENDING', 4), sc(20, 'SAFETY CAR DEPLOYED', 9), sc(26, 'SAFETY CAR IN THIS LAP', 10)]; }
  if(!isQuali(key)) return [];
  const t0 = startOf(key), at = m => new Date(t0 + m * MIN).toISOString(), row = (m, category, message) => ({ date: at(m), category, message, flag: null, session_key: key, meeting_key: 0 });
  return [row(0, 'SessionStatus', 'SESSION STARTED'), row(0, 'Flag', 'GREEN LIGHT - PIT EXIT OPEN'), row(5, 'SessionStatus', 'SESSION ABORTED'), row(7, 'SessionStatus', 'SESSION STARTED'),
    row(18, 'SessionStatus', 'SESSION FINISHED'), row(20, 'Other', 'FIA STEWARDS: Q1 INCIDENT NOTED'), row(25, 'SessionStatus', 'SESSION STARTED'), row(40, 'SessionStatus', 'SESSION FINISHED'),
    row(47, 'SessionStatus', 'SESSION STARTED'), row(60, 'SessionStatus', 'SESSION FINISHED')];
};

// The classifications (driver numbers, first place first): sessions differ, so a sort by each is visible. In the Sprint 81 did not start.
const ORDERS = { 'Qualifying': [1, 63, 44, 12, 16, 81], 'Sprint Qualifying': [81, 1, 63, 12, 16, 44], 'Sprint': [12, 63, 16, 1, 44, 81], 'Race': [16, 12, 81, 63, 1, 44] };
const resultFor = key => (ORDERS[nameOf(key)] || []).map((n, i) => ({ position: nameOf(key) === 'Sprint' && n === 81 ? null : i + 1, driver_number: n, number_of_laps: 11, dnf: false, dns: nameOf(key) === 'Sprint' && n === 81, dsq: false, session_key: key, meeting_key: 0 }));

// The Races' starting grid (driver numbers, pole first), as /starting_grid gives it (#201); other sessions have none.
const STARTING = [16, 63, 44, 1, 12, 81];
const gridFor = key => nameOf(key) === 'Race' ? STARTING.map((n, i) => ({ position: i + 1, driver_number: n, lap_duration: 90 + i, meeting_key: 0, session_key: key })) : [];

// Answers a request to https://api.openf1.org/v1/…; `empty` lists session keys with no data yet.
function answer(url, { empty = [] } = {}){
  const u = new URL(url), key = +u.searchParams.get('session_key');
  const path = u.pathname.replace(/^\/v1/, '');
  if(path === '/sessions') return SESSIONS;
  if(empty.includes(key)) return [];
  if(path === '/race_control') return raceControlFor(key);
  if(path === '/session_result') return resultFor(key);
  if(path === '/laps') return lapsFor(key);
  if(path === '/stints') return stintsFor(key);
  if(path === '/drivers') return driversFor(key);
  if(path === '/starting_grid') return gridFor(key);
  return null;
}
module.exports = { STARTING, gridFor, NOW, SESSIONS, DRIVERS, RESERVE, raceControlFor, resultFor, ORDERS, answer, lapsFor, stintsFor, driversFor };
