// #186: tools/pace-snapshot.mjs — saved copies of finished OpenF1 sessions for the Weekend Pace page (OpenF1 closes its API to the public
// while a session is live). A fake OpenF1 (lib/openf1-fixture.js) answers; files go to a temporary folder.
const fs = require('fs'), os = require('os'), path = require('path');
const fx = require('./lib/openf1-fixture');
const O = require('../site/openf1.js');

module.exports = async (t, h) => {
  const { runYear, SETTLE_MS } = await import('../tools/pace-snapshot.mjs');
  const now = Date.parse(fx.NOW), noWait = async () => {};
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pace-'));
  // a fake fetch over the fixture; `hook(url)` may answer instead: a status number, or null to carry on
  const fake = (calls, hook = () => null) => async url => {
    calls.push(new URL(url).pathname.replace('/v1', '') + new URL(url).search);
    const status = hook(url);
    if(status === 401) return { ok: false, status, json: async () => ({ detail: 'Live F1 session in progress. Global API access (including past sessions) is restricted to authenticated users until the session ends.' }) };
    if(status) return { ok: false, status, json: async () => ({}) };
    const body = fx.answer(url); return { ok: true, status: 200, json: async () => body };
  };
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const keys = dir => fs.readdirSync(path.join(dir, '2026')).map(f => +f.replace('.json', '')).sort((a, b) => a - b);

  // ---- a first run: the list, and every finished session ----
  let dir = tmp(), calls = [];
  let r = await runYear(2026, { fetchImpl: fake(calls), dir, now, wait: noWait, gap: 0 });
  // at the fixed "now" (2026-08-28 17:00): rounds 11 and 12 are over, round 13 has had FP1 and FP2 (FP2 ended an hour ago); testing is not a weekend session
  t.check('saves the finished sessions: rounds 11 and 12 complete, FP1 and FP2 of round 13; not testing, not the sessions still to come', keys(dir).join() === '101,102,103,104,105,201,202,301,302,303,304,305', keys(dir).join());
  t.check('…and says so', r.written.length === 12 && r.failed.length === 0 && r.list === 'written' && !r.live, JSON.stringify(r));
  const list = read(path.join(dir, '2026.json'));
  t.check('the sessions list holds the whole calendar (also the sessions to come and testing), the fields the page uses, in date order', list.v === 1 && list.year === 2026 && list.sessions.length === fx.SESSIONS.length &&
    Object.keys(list.sessions[0]).join() === O.SESSION_FIELDS.join() && list.sessions.every((s, i, a) => !i || a[i - 1].date_start <= s.date_start), Object.keys(list.sessions[0]).join());
  const fp2 = read(path.join(dir, '2026', '202.json'));
  t.check('a session file holds laps, stints, drivers as arrays with their field names, and times in ms', fp2.v === 1 && fp2.key === 202 && fp2.laps.length === 66 && fp2.fields.laps[3] === 'lap_duration' && typeof fp2.laps[0][2] === 'number' && fp2.drivers.length === 6 && fp2.stints.length === 12 && fp2.generatedAt === now, Object.keys(fp2).join());
  const quali = read(path.join(dir, '2026', '104.json'));
  t.check('qualifying keeps the start and finish of its parts (and not the flags, notes and red-flag stops) and the classification', quali.raceControl.length === 7 && O.qualiSegments(O.inflate(quali).raceControl, false).map(g => g.label).join() === 'Q1,Q2,Q3' && quali.result.length === 6 && quali.result[0][0] === 1 && quali.result[0][1] === 1);
  t.check('practice has no race control and no classification', fp2.raceControl.length === 0 && fp2.result.length === 0);
  const f = O.inflate(fp2), raw = { laps: fx.lapsFor(202), stints: fx.stintsFor(202), drivers: fx.driversFor(202) };
  t.check('read back, a saved session builds the same model as the API’s answer', JSON.stringify(O.build(f.laps, f.stints, f.drivers)) === JSON.stringify(O.build(raw.laps, raw.stints, raw.drivers)));
  t.check('a saved session is much smaller than the API’s answer', fs.statSync(path.join(dir, '2026', '202.json')).size < JSON.stringify(raw.laps).length / 3);

  // a race saved with its safety car messages (#186); one saved before they were kept is saved again
  const race = read(path.join(dir, '2026', '105.json'));
  t.check('a race keeps its safety car messages with their laps', race.rc === 2 && JSON.stringify(O.neutralLaps(O.inflate(race).raceControl)) === '[[3,4],[9,10]]', JSON.stringify(race.raceControl));
  const raceFile = path.join(dir, '2026', '105.json'), oldRace = { ...race }; delete oldRace.rc; oldRace.raceControl = [];
  fs.writeFileSync(raceFile, JSON.stringify(oldRace)); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now, wait: noWait, gap: 0 });
  t.check('a saved race without them (no rc mark) is saved again, and only that one', r.written.join() === '105' && read(raceFile).rc === 2 && read(raceFile).raceControl.length === 5, JSON.stringify(r));

  // ---- later runs fetch nothing twice ----
  calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now, wait: noWait, gap: 0 });
  t.check('a second run asks only for the list; nothing is written again', calls.join() === '/sessions?year=2026' && r.written.length === 0 && r.list === 'unchanged');
  calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now: now + 3 * 3600e3, wait: noWait, gap: 0 });
  t.check('three hours later FP3 is not over yet either; nothing new', r.written.length === 0);
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now: Date.parse('2026-08-29T11:30:00Z') + SETTLE_MS - 60e3, wait: noWait, gap: 0 });
  t.check('a session is saved only 20 minutes after it ends (once its data is settled)', r.written.length === 0);
  r = await runYear(2026, { fetchImpl: fake(calls), dir, now: Date.parse('2026-08-29T11:30:00Z') + SETTLE_MS + 60e3, wait: noWait, gap: 0 });
  t.check('…and then it is', r.written.join() === '203' && keys(dir).includes(203));

  // ---- a live session: OpenF1 is closed ----
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, () => 401), dir, now, wait: noWait, gap: 0 });
  t.check('while a session is live nothing is saved and the run ends quietly (no error, no files)', r.live === true && r.written.length === 0 && calls.length === 1 && fs.readdirSync(dir).length === 0, JSON.stringify(r));
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, url => /session_key=(103|104|105|20\d|30\d)/.test(url) && !/session_key=201\b/.test(url) ? 401 : null), dir, now, wait: noWait, gap: 0 });
  t.check('closed part-way: what was saved stays, nothing half-written is left, and the run stops', r.live === true && keys(dir).every(k => ![103, 104, 105].includes(k)) && !fs.readdirSync(path.join(dir, '2026')).some(f => /tmp|part/.test(f)), keys(dir).join());

  // ---- rate limit, failures, sessions with no laps yet ----
  dir = tmp(); calls = []; let limited = 2;
  r = await runYear(2026, { fetchImpl: fake(calls, () => limited-- > 0 ? 429 : null), dir, now, wait: noWait, gap: 0 });
  t.check('a 429 is waited out and the request tried again', r.written.length === 12 && r.failed.length === 0 && calls.length > 2 + 1 + 12 * 3);
  dir = tmp(); calls = [];
  r = await runYear(2026, { fetchImpl: fake(calls, url => /laps\?session_key=102\b/.test(url) ? 500 : null), dir, now, wait: noWait, gap: 0 });
  t.check('a session that fails is skipped (and tried again next run); the others are saved', r.failed.join() === '102' && !keys(dir).includes(102) && keys(dir).length === 11, JSON.stringify(r));
  dir = tmp();
  const emptyFake = (calls, empty) => async url => { calls.push(url); const u = new URL(url), key = +u.searchParams.get('session_key'), body = empty.includes(key) && /laps|stints|drivers/.test(u.pathname) ? [] : fx.answer(url); return { ok: true, status: 200, json: async () => body }; };
  r = await runYear(2026, { fetchImpl: emptyFake([], [201]), dir, now, wait: noWait, gap: 0 });
  t.check('a session that ended hours ago with no laps yet is not saved (OpenF1 may not have them yet)', !keys(dir).includes(201) && keys(dir).includes(202));
  r = await runYear(2026, { fetchImpl: emptyFake([], [301]), dir: tmp(), now: now + 40 * 24 * 3600e3, wait: noWait, gap: 0 });
  t.check('…but one with none after a day is saved as it is, so it is not asked for for ever', r.written.includes(301));
  t.check('the pause between requests is kept (OpenF1’s free limit is 3 a second)', await (async () => { const stamps = []; const w = async ms => { stamps.push(ms); };
    await runYear(2026, { fetchImpl: fake([]), dir: tmp(), now: now - 30 * 24 * 3600e3, wait: w, gap: 350 }); return stamps.length > 0 && stamps.every(x => x === 350); })());
};
