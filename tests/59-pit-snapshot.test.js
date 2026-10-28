// #203: tools/pit-snapshot.mjs — saved pit stop times (time in the box) from OpenF1 for the Pit Stops page. A fake OpenF1 (lib/openf1-fixture.js) answers; files go to a temporary folder.
const fs = require('fs'), os = require('os'), path = require('path');
const fx = require('./lib/openf1-fixture');

module.exports = async (t, h) => {
  const { runYear, SETTLE_MS } = await import('../tools/pit-snapshot.mjs');
  const now = Date.parse(fx.NOW), noWait = async () => {};
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pit-'));
  // a fake fetch over the fixture; `hook(url)` may answer instead: a status number, or null to carry on
  const fake = (calls, hook = () => null) => async url => {
    calls.push(new URL(url).pathname.replace('/v1', '') + new URL(url).search);
    const status = hook(url);
    if(status === 401) return { ok: false, status, json: async () => ({ detail: 'Live F1 session in progress. Global API access (including past sessions) is restricted to authenticated users until the session ends.' }) };
    if(status) return { ok: false, status, json: async () => ({ detail: 'No results found.' }) };
    const body = fx.answer(url); return { ok: true, status: 200, json: async () => body };
  };
  const read = dir => JSON.parse(fs.readFileSync(path.join(dir, '2026.json'), 'utf8'));
  const keys = dir => read(dir).sessions.map(s => s.key);

  // ---- a first run: every finished Race and Sprint ----
  let dir = tmp(), calls = [];
  let r = await runYear(2026, { fetchImpl: fake(calls), dir, now, wait: noWait, gap: 0 });
  // at the fixed "now" (2026-08-28 17:00): round 11's Sprint and Race and round 12's Race are over; round 13's Race is not; practice and qualifying are not saved
  t.check('saves the finished Sprint and Races in date order: round 11’s Sprint and Race, round 12’s Race; not practice or qualifying, not the Race still to come', keys(dir).join() === '303,305,105', keys(dir).join());
  t.check('…and says so', r.written.length === 3 && r.failed.length === 0 && r.changed && !r.live, JSON.stringify(r));
  const f = read(dir), race = f.sessions.find(s => s.key === 305);
  t.check('the file is versioned with the year, and holds the session’s name, start and place', f.v === 1 && f.year === 2026 && f.generatedAt === now && race.name === 'Race' && race.meeting === 3 && race.start === '2026-07-19T13:00:00+00:00' && race.location === 'Silverstone', JSON.stringify({ ...race, stops: '…', drivers: '…' }));
  t.check('drivers are [number, code] pairs', race.drivers.length === 6 && JSON.stringify(race.drivers[0]) === '[63,"DA0"]', JSON.stringify(race.drivers));
  t.check('stops are [number, lap, time in the box, pit lane time] in lap order, with a missing box time kept as null (not dropped, not 0)', race.stops.length === 7 && JSON.stringify(race.stops[0]) === '[63,12,2.4,22.1]' &&
    race.stops.map(s => s[1]).join() === '12,14,15,16,20,22,30' && JSON.stringify(race.stops.find(s => s[0] === 44)) === '[44,16,null,24.5]', JSON.stringify(race.stops));
  t.check('a long stop is kept as it is (the page decides what to leave out)', race.stops.find(s => s[0] === 1)[2] === 15.3);
  t.check('asks for the sessions once, then the stops and drivers of each saved session', calls[0] === '/sessions?year=2026' && calls.filter(c => /^\/pit/.test(c)).length === 3 && calls.filter(c => /^\/drivers/.test(c)).length === 3 && calls.length === 7, calls.join(' '));

  // ---- later runs fetch nothing twice ----
  calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now, wait: noWait, gap: 0 });
  t.check('a second run asks only for the list; nothing is written again', calls.join() === '/sessions?year=2026' && r.written.length === 0 && !r.changed);
  const raceEnd = Date.parse('2026-08-30T15:00:00Z');
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now: raceEnd + SETTLE_MS - 60e3, wait: noWait, gap: 0 });
  t.check('a race is saved only 20 minutes after it ends (once its data is settled)', r.written.length === 0 && keys(dir).length === 3);
  const before = fs.readFileSync(path.join(dir, '2026.json'), 'utf8');
  r = await runYear(2026, { fetchImpl: fake([]), dir, now: raceEnd + SETTLE_MS + 60e3, wait: noWait, gap: 0 });
  t.check('…and then it is added, in date order, with what was saved before kept as it was', r.written.join() === '205' && keys(dir).join() === '303,305,105,205' &&
    JSON.stringify(read(dir).sessions.slice(0, 3)) === JSON.stringify(JSON.parse(before).sessions), keys(dir).join());

  // ---- a live session: OpenF1 is closed ----
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, () => 401), dir, now, wait: noWait, gap: 0 });
  t.check('while a session is live nothing is saved and the run ends quietly (no error, no file)', r.live === true && r.written.length === 0 && calls.length === 1 && fs.readdirSync(dir).length === 0, JSON.stringify(r));
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, url => /pit\?session_key=105/.test(url) ? 401 : null), dir, now, wait: noWait, gap: 0 });
  t.check('closed part-way: what was fetched before is saved, the run stops, and the next run adds the rest', r.live === true && keys(dir).join() === '303,305' &&
    (await runYear(2026, { fetchImpl: fake([]), dir, now, wait: noWait, gap: 0 })).written.join() === '105' && keys(dir).join() === '303,305,105', keys(dir).join());

  // ---- rate limit, failures, sessions with no stops ----
  dir = tmp(); calls = []; let limited = 2;
  r = await runYear(2026, { fetchImpl: fake(calls, () => limited-- > 0 ? 429 : null), dir, now, wait: noWait, gap: 0 });
  t.check('a 429 is waited out and the request tried again', r.written.length === 3 && r.failed.length === 0 && calls.length > 1 + 3 * 2);
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, url => /pit\?session_key=305/.test(url) ? 500 : null), dir, now, wait: noWait, gap: 0 });
  t.check('a session that fails is skipped (and tried again next run); the others are saved', r.failed.join() === '305' && keys(dir).join() === '303,105', JSON.stringify(r));
  const noStops = url => /pit\?session_key=303/.test(url) ? 404 : null, sprintEnd = Date.parse('2026-07-18T12:00:00Z');
  dir = tmp();
  r = await runYear(2026, { fetchImpl: fake([], noStops), dir, now: sprintEnd + 3600e3, wait: noWait, gap: 0 });
  t.check('OpenF1 answers a session with no stops with a 404 (“No results found”): that is not a failure, but soon after the end it may be too early, so it is not saved yet', r.failed.length === 0 && r.written.length === 0 && !r.changed && !fs.existsSync(path.join(dir, '2026.json')), JSON.stringify(r));
  r = await runYear(2026, { fetchImpl: fake([], noStops), dir, now: sprintEnd + 3 * 24 * 3600e3, wait: noWait, gap: 0 });
  t.check('…and after a day with none it is saved as it is (no stops), so it is not asked for for ever', r.written.join() === '303,305' && read(dir).sessions.find(s => s.key === 303).stops.length === 0 && keys(dir).join() === '303,305', JSON.stringify(r));
  t.check('the pause between requests is kept (OpenF1’s free limit is 3 a second)', await (async () => { const stamps = []; const w = async ms => { stamps.push(ms); };
    await runYear(2026, { fetchImpl: fake([]), dir: tmp(), now, wait: w, gap: 350 }); return stamps.length > 0 && stamps.every(x => x === 350); })());
  t.check('a year with nothing finished writes no file', await (async () => { const d = tmp(); const x = await runYear(2026, { fetchImpl: fake([]), dir: d, now: Date.parse('2026-01-01T00:00:00Z'), wait: noWait, gap: 0 }); return !x.changed && fs.readdirSync(d).length === 0; })());
};
