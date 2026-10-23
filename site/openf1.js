// F1OpenF1 (#186): practice, qualifying and sprint lap data from OpenF1 (https://openf1.org), for the Weekend Pace page.
// f1api.dev has no session laps, sectors, speeds or tyres, so this is the one page that talks to another API. It is
// called from the browser (OpenF1 allows it) and needs no key, except that OpenF1 closes its API to everyone without an
// account (even for past sessions) while an F1 session is live. So a finished session is read from a saved copy
// (site/data/pace/, written by tools/pace-snapshot.mjs after each session) before the API is asked, the API is asked no faster
// than OpenF1's free limit (3 a second), and what it answers is cached in localStorage: a session that ended more than two
// hours ago for a day, a session still running (or just over) for five minutes; an old cached answer is used when the API is closed.
// The pure functions (build, entities, stats, bin…) take plain data and are shared with Node (tests); the fetch part
// only runs in a browser. Nothing here fetches except load() and sessions(): the page's toggles and pickers never do.
const F1OpenF1 = (() => {
  const BASE = 'https://api.openf1.org/v1';
  const SLOW = 1.07; // a lap more than 107% of the session's best counts as slow (cool-down, traffic, a spin…)
  const HOUR = 3600e3, DAY = 24 * HOUR;

  // ---- fetch (rate limited), cache and saved copies ----
  const KEY = 'f1o:v1:';
  // OpenF1 allows 3 requests a second without an account: 350 ms between requests (tests set window.F1O_SPACING to 0).
  const spacing = () => typeof globalThis.F1O_SPACING === 'number' ? globalThis.F1O_SPACING : 350;
  // A limiter: the function it returns resolves once at least `gap` ms have passed since the previous caller was let through, in order.
  function makeLimiter(gap, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms))){
    let next = 0;
    return async () => { const at = Math.max(now(), next); next = at + (typeof gap === 'function' ? gap() : gap); const wait = at - now(); if(wait > 0) await sleep(wait); };
  }
  const slot = makeLimiter(spacing);
  const live = { seenAt: 0 }; // when OpenF1 last said that a live session had closed its API
  const LIVE = /Live F1 session/i;
  // One request: rate limited, up to two retries after a 429. A failure carries .status and .live (the "session in progress" 401).
  async function net(path){
    await slot();
    let res = await fetch(BASE + path);
    for(let attempt = 1; res.status === 429 && attempt <= 2; attempt++){ // too many requests: wait, and try again (twice at most)
      const after = res.headers && res.headers.get ? +res.headers.get('retry-after') : 0;
      await new Promise(r => setTimeout(r, Math.min(5, after || 1.2 * attempt) * (spacing() ? 1000 : 1)));
      await slot(); res = await fetch(BASE + path);
    }
    if(!res.ok){
      let closed = false;
      if(res.status === 401){ try{ closed = LIVE.test((await res.json()).detail || ''); }catch(e){} }
      const err = new Error('OpenF1 HTTP ' + res.status); err.status = res.status; err.live = closed; if(closed) live.seenAt = Date.now();
      throw err;
    }
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('OpenF1: unexpected answer');
    return data;
  }
  function cacheAny(path){ try{ const o = JSON.parse(localStorage.getItem(KEY + path)); return o && o.d ? o : null; }catch(e){ return null; } }
  function cacheGet(path, ttl){ const o = cacheAny(path); return o && Date.now() - o.t < ttl ? o : null; }
  function cachePut(path, data){
    const put = () => localStorage.setItem(KEY + path, JSON.stringify({ t: Date.now(), d: data }));
    try{ put(); }catch(e){
      // storage full: drop this page's older entries, oldest first, and try once more
      try{
        const keys = Object.keys(localStorage).filter(k => k.startsWith(KEY))
          .map(k => { let t = 0; try{ t = JSON.parse(localStorage.getItem(k)).t; }catch(_){} return [k, t]; }).sort((a, b) => a[1] - b[1]);
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(([k]) => localStorage.removeItem(k));
        put();
      }catch(_){}
    }
  }
  // Cache, then the API; with `stale`, an older cached answer when the API can't be had (closed for a live session, or down).
  // source: 'cache' | 'api' | 'stale'.
  async function get(path, ttl, fresh, stale = true){
    const hit = !fresh && cacheGet(path, ttl);
    if(hit) return { data: hit.d, at: hit.t, source: 'cache' };
    try{
      const data = await net(path); cachePut(path, data);
      return { data, at: Date.now(), source: 'api' };
    }catch(e){
      const old = stale && cacheAny(path);
      if(old) return { data: old.d, at: old.t, source: 'stale', blocked: !!e.live };
      throw e;
    }
  }

  // Race control's safety car messages: the laps from a deployment to its end are not racing laps.
  const SC_START = [/^SAFETY CAR DEPLOYED/, /^VSC DEPLOYED/], SC_END = [/^SAFETY CAR IN THIS LAP/, /^VSC ENDING/];
  // The lap ranges under the safety car or a virtual one, [[from, to]] (lap numbers, both included), from race control rows. A deployment
  // with no end message counts for its own lap only.
  function neutralLaps(rows){
    const ev = (rows || []).filter(r => r.category === 'SafetyCar' && r.lap_number != null).sort((a, b) => a.date < b.date ? -1 : 1);
    const out = []; let from = null;
    ev.forEach(r => {
      if(SC_START.some(re => re.test(r.message || ''))){ if(from == null) from = r.lap_number; else if(r.lap_number > from) { out.push([from, r.lap_number]); from = r.lap_number; } }
      else if(SC_END.some(re => re.test(r.message || '')) && from != null){ out.push([from, Math.max(from, r.lap_number)]); from = null; }
    });
    if(from != null) out.push([from, from]);
    return out;
  }

  // ---- saved copies of finished sessions (data/pace/…, written by tools/pace-snapshot.mjs) ----
  const LAP_FIELDS = ['driver_number', 'lap_number', 'date_start', 'lap_duration', 'duration_sector_1', 'duration_sector_2', 'duration_sector_3', 'i1_speed', 'i2_speed', 'st_speed', 'is_pit_out_lap'];
  const STINT_FIELDS = ['driver_number', 'stint_number', 'lap_start', 'lap_end', 'compound', 'tyre_age_at_start'];
  const DRIVER_FIELDS = ['driver_number', 'name_acronym', 'full_name', 'broadcast_name', 'team_name', 'team_colour'];
  const SESSION_FIELDS = ['meeting_key', 'session_key', 'session_name', 'date_start', 'date_end', 'location', 'country_name', 'year', 'is_cancelled'];
  const val = v => v === undefined ? null : v;
  // What a saved session file holds: only the fields the page uses, as arrays (the field names are in the file), times in ms.
  // raw: {laps, stints, drivers, raceControl, result} as OpenF1 answers them.
  function compact(raw, meta, now = Date.now()){
    const rows = (list, fields) => (list || []).map(r => fields.map(f => val(r[f])));
    return { v: 1, rc: 2, key: meta.key, year: meta.year, name: meta.name, generatedAt: now,
      fields: { laps: LAP_FIELDS, stints: STINT_FIELDS, drivers: DRIVER_FIELDS },
      laps: (raw.laps || []).map(l => LAP_FIELDS.map(f => f === 'date_start' ? (l.date_start ? Date.parse(l.date_start) : null) : f === 'is_pit_out_lap' ? (l.is_pit_out_lap ? 1 : 0) : val(l[f]))),
      stints: rows(raw.stints, STINT_FIELDS), drivers: rows(raw.drivers, DRIVER_FIELDS),
      raceControl: (raw.raceControl || []).filter(r => (r.category === 'SessionStatus' && /^SESSION (STARTED|FINISHED)$/.test(r.message || '')) || (r.category === 'SafetyCar' && SC_START.concat(SC_END).some(re => re.test(r.message || ''))))
        .map(r => r.category === 'SafetyCar' ? [Date.parse(r.date), r.message, r.lap_number] : [Date.parse(r.date), r.message]),
      result: (raw.result || []).map(r => [r.driver_number, val(r.position), r.dns ? 1 : 0, r.dsq ? 1 : 0, r.dnf ? 1 : 0]) };
  }
  // The other way: OpenF1-shaped rows again, so the same code reads a saved copy and an answer from the API.
  function inflate(snap){
    const obj = (fields, row) => Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    const f = snap.fields || {};
    return {
      laps: (snap.laps || []).map(r => { const o = obj(f.laps || LAP_FIELDS, r); o.date_start = o.date_start != null ? new Date(o.date_start).toISOString() : null; o.is_pit_out_lap = !!o.is_pit_out_lap; return o; }),
      stints: (snap.stints || []).map(r => obj(f.stints || STINT_FIELDS, r)), drivers: (snap.drivers || []).map(r => obj(f.drivers || DRIVER_FIELDS, r)),
      raceControl: (snap.raceControl || []).map(r => r.length > 2 ? { date: new Date(r[0]).toISOString(), category: 'SafetyCar', message: r[1], lap_number: r[2] } : { date: new Date(r[0]).toISOString(), category: 'SessionStatus', message: r[1] }),
      result: (snap.result || []).map(r => ({ driver_number: r[0], position: r[1], dns: !!r[2], dsq: !!r[3], dnf: !!r[4] })) };
  }
  // The saved files are fetched from the site itself (same origin: no OpenF1 request, no limit). A missing file is not remembered:
  // the next look may find it (the workflow writes it a little after the session ends).
  const saved = new Map();
  async function savedFile(url){
    if(saved.has(url)) return saved.get(url);
    let j = null;
    try{ const r = await fetch(url); if(r.ok){ const x = await r.json(); if(x && x.v === 1) j = x; } }catch(e){}
    if(j) saved.set(url, j);
    return j;
  }
  const savedSession = s => savedFile(`data/pace/${s.year}/${s.key}.json`);
  const hasSaved = async s => !!(await savedSession(s));

  // ---- sessions ----
  const SHORT = { 'Practice 1': 'FP1', 'Practice 2': 'FP2', 'Practice 3': 'FP3', 'Qualifying': 'Quali', 'Sprint Qualifying': 'Sprint Quali',
    'Sprint Shootout': 'Sprint Quali' };
  const shortName = n => SHORT[n] || n;
  // The lap-based sessions this page can show: practice, qualifying, sprint and the Grand Prix itself (pre-season testing has none of these names).
  const KINDS = new Set(['Practice 1', 'Practice 2', 'Practice 3', 'Qualifying', 'Sprint Qualifying', 'Sprint Shootout', 'Sprint', 'Race']);
  const isQualifying = name => /Qualifying|Shootout/.test(name || '');
  // The sessions whose race control messages are used: the qualifying parts, and the safety car in the sprint and the Grand Prix.
  const hasRaceControl = name => isQualifying(name) || name === 'Sprint' || name === 'Race';

  // The classified sessions the page can sort by: kind -> OpenF1 session names.
  const RESULT_KINDS = { gp: ['Race'], sprint: ['Sprint'], quali: ['Qualifying'], sprintquali: ['Sprint Qualifying', 'Sprint Shootout'] };
  const resultKind = name => Object.keys(RESULT_KINDS).find(k => RESULT_KINDS[k].includes(name)) || null;
  // A classification (OpenF1's /session_result rows) as {driver number: finishing position}; null for no position, did not start or disqualified.
  function resultOrder(rows){
    const m = {};
    (rows || []).forEach(r => { m[r.driver_number] = r.position != null && !r.dns && !r.dsq ? r.position : null; });
    return m;
  }
  // The classifications of a weekend's sessions that have finished: {gp, sprint, quali, sprintquali} -> resultOrder. A session that
  // has not finished, or whose classification can't be had, is left out.
  async function results(weekend, {fresh=false, now=Date.now()}={}){
    const out = {};
    await Promise.all(weekend.sessions.filter(s => resultKind(s.name) && Date.parse(s.end) <= now).map(async s => {
      try{
        const snap = fresh ? null : await savedSession(s); // a saved copy first
        const rows = snap ? inflate(snap).result : (await get('/session_result?session_key=' + s.key, now - Date.parse(s.end) > 2 * HOUR ? DAY : 5 * 60e3, fresh)).data, m = resultOrder(rows);
        if(Object.keys(m).length) out[resultKind(s.name)] = m;
      }catch(e){}
    }));
    return out;
  }

  // A year's sessions grouped into weekends, in date order: [{key, label, country, start, sessions:[{key, name, short, start, end}]}].
  function weekends(rows){
    const by = new Map();
    (rows || []).filter(s => KINDS.has(s.session_name) && !s.is_cancelled).forEach(s => {
      if(!by.has(s.meeting_key)) by.set(s.meeting_key, { key: s.meeting_key, label: s.location, country: s.country_name, start: s.date_start, sessions: [] });
      by.get(s.meeting_key).sessions.push({ key: s.session_key, name: s.session_name, short: shortName(s.session_name), start: s.date_start, end: s.date_end, year: s.year || new Date(s.date_start).getUTCFullYear() });
    });
    const out = [...by.values()];
    out.forEach(w => { w.sessions.sort((a, b) => a.start < b.start ? -1 : 1); w.start = w.sessions[0].start; });
    return out.sort((a, b) => a.start < b.start ? -1 : 1);
  }
  // The weekend to open first: the latest one that has started (so the current weekend on race week), else the first.
  function defaultWeekend(list, now){
    const started = list.filter(w => Date.parse(w.start) <= now);
    return started.length ? started[started.length - 1] : list[0] || null;
  }
  // The session to open first within a weekend: the latest one that has started and finished its first lap data, else the first.
  function defaultSession(w, now){
    const started = w.sessions.filter(s => Date.parse(s.start) <= now);
    return started.length ? started[started.length - 1] : w.sessions[0];
  }
  // The weekend of a championship round: the one whose first session starts within six days before the Grand Prix's date (the calendar's
  // raceDates, 'YYYY-MM-DD') or the day after it, the closest if several. Without a date, the round's place in the list. null when none fits.
  function weekendForRound(list, calendar, round){
    const date = calendar && calendar.raceDates && calendar.raceDates[round];
    if(!date) return list[round - 1] || null;
    const race = Date.parse(date + 'T12:00:00Z'), DAY_MS = 864e5;
    const near = list.map(w => ({ w, d: race - Date.parse(w.start) })).filter(x => x.d >= -DAY_MS && x.d <= 6 * DAY_MS).sort((a, b) => Math.abs(a.d - 3 * DAY_MS) - Math.abs(b.d - 3 * DAY_MS));
    return near.length ? near[0].w : null;
  }
  // The year's sessions: the cache, then OpenF1, then the saved list (data/pace/{year}.json) when OpenF1 can't be had (closed for a live
  // session), then an older cached answer. {list, at, source: 'cache'|'api'|'saved'|'stale', blocked: OpenF1 said a live session had closed it}.
  async function sessions(year, {fresh=false}={}){
    const path = '/sessions?year=' + year;
    let r;
    // a finished year's list is final: the saved one, without asking OpenF1
    const past = !fresh && year < new Date().getUTCFullYear() ? await savedFile(`data/pace/${year}.json`) : null;
    if(past) r = { data: past.sessions, at: past.generatedAt, source: 'saved', blocked: false };
    else try{ r = await get(path, 30 * 60e3, fresh, false); }
    catch(e){
      const file = await savedFile(`data/pace/${year}.json`), old = cacheAny(path);
      if(file) r = { data: file.sessions, at: file.generatedAt, source: 'saved', blocked: !!e.live };
      else if(old) r = { data: old.d, at: old.t, source: 'stale', blocked: !!e.live };
      else throw e;
    }
    return { list: weekends(r.data), rows: r.data, at: r.at, source: r.source, blocked: !!r.blocked };
  }
  // OpenF1 stays closed for a while after a session ends: it was still closed 26 minutes after Austin FP1's scheduled end and open again 46
  // minutes after it (2026-10-23), so the closed window is taken to run until 45 minutes after the end.
  const CLOSED_AFTER = 45 * 60e3;
  // When OpenF1 should reopen (ms) while a session is on or has just ended, for "closed until about …"; null when none is.
  function liveUntil(list, now = Date.now()){
    const ends = (list || []).flatMap(w => w.sessions).filter(x => Date.parse(x.start) <= now && now <= Date.parse(x.end) + CLOSED_AFTER).map(x => Date.parse(x.end) + CLOSED_AFTER);
    return ends.length ? Math.max(...ends) : null;
  }

  // ---- one session ----
  // Joins the three lists into {drivers, laps}. Drivers: {num, code, name, team, color}. Laps: {d (driver number), n (lap number),
  // t (lap time, s), s [s1, s2, s3], i1, i2, st (speeds, km/h), out (pit-out lap), inn (in-lap: last lap of a stint
  // that another stint follows), sn (stint number: a new one after each pit stop), sc (under the safety car or a virtual one: `neutral` is neutralLaps()'s ranges), c (compound), age (tyre age on the lap), at (when the lap started, ms)}; a missing value is null.
  function build(laps, stints, drivers, neutral){
    const ds = (drivers || []).map(d => ({ num: d.driver_number, code: d.name_acronym, name: d.full_name || d.broadcast_name || d.name_acronym,
      team: d.team_name || '', color: '#' + (d.team_colour || '888888').replace('#', '') }));
    const byNum = new Map(); (stints || []).forEach(s => { if(!byNum.has(s.driver_number)) byNum.set(s.driver_number, []); byNum.get(s.driver_number).push(s); });
    const num = v => typeof v === 'number' && isFinite(v) ? v : null;
    const out = (laps || []).map(l => {
      const mine = byNum.get(l.driver_number) || [];
      const st = mine.find(s => l.lap_number >= s.lap_start && l.lap_number <= s.lap_end);
      const later = st && mine.some(s => s.stint_number > st.stint_number);
      return { d: l.driver_number, n: l.lap_number, t: num(l.lap_duration),
        s: [num(l.duration_sector_1), num(l.duration_sector_2), num(l.duration_sector_3)],
        i1: num(l.i1_speed), i2: num(l.i2_speed), st: num(l.st_speed), out: !!l.is_pit_out_lap,
        inn: !!(st && later && l.lap_number === st.lap_end), sn: st ? st.stint_number : null, sc: (neutral || []).some(g => l.lap_number >= g[0] && l.lap_number <= g[1]),
        c: st ? st.compound : null, age: st ? (st.tyre_age_at_start || 0) + (l.lap_number - st.lap_start) : null,
        at: l.date_start ? Date.parse(l.date_start) : null };
    }).sort((a, b) => (a.d - b.d) || (a.n - b.n));
    // only drivers who set a lap
    const seen = new Set(out.map(l => l.d));
    return { drivers: ds.filter(d => seen.has(d.num)), laps: out };
  }
  // Qualifying (and sprint qualifying) is run in three parts. OpenF1's race control messages say when each starts and finishes
  // ("SESSION STARTED" / "SESSION FINISHED"); the parts come back as [{label: 'Q1', from, to}] in ms. A restart while a part is
  // open is ignored; a part still open (the session is live) runs to the last message.
  function qualiSegments(rows, sprint){
    const ev = (rows || []).filter(r => r.category === 'SessionStatus' && /^SESSION (STARTED|FINISHED)$/.test(r.message || '')).sort((a, b) => a.date < b.date ? -1 : 1);
    const out = []; let open = null;
    ev.forEach(r => {
      const t = Date.parse(r.date);
      if(r.message === 'SESSION STARTED' && !open) open = t;
      else if(r.message === 'SESSION FINISHED' && open != null){ out.push({ from: open, to: t }); open = null; }
    });
    if(open != null && ev.length) out.push({ from: open, to: Date.parse(ev[ev.length - 1].date) });
    return out.map((g, i) => ({ label: (sprint ? 'SQ' : 'Q') + (i + 1), from: g.from, to: g.to }));
  }
  // A session's laps, stints, drivers (and race control for qualifying): a saved copy of a finished session if there is one, otherwise the
  // cache / OpenF1. The model's source: 'saved' | 'cache' | 'api' | 'stale' (an older cached answer, because OpenF1 is closed or down).
  async function load(session, {fresh=false, now=Date.now()}={}) {
    const quali = isQualifying(session.name), sprint = /Sprint/.test(session.name);
    const snap = fresh ? null : await savedSession(session);
    if(snap){
      const f = inflate(snap);
      return Object.assign(build(f.laps, f.stints, f.drivers, neutralLaps(f.raceControl)), { at: snap.generatedAt, source: 'saved', blocked: false, segments: quali ? qualiSegments(f.raceControl, sprint) : [] });
    }
    const over = now - Date.parse(session.end) > 2 * HOUR;
    const ttl = over ? DAY : 5 * 60e3, q = '?session_key=' + session.key;
    const none = { data: [], at: Infinity, source: 'api' };
    const [l, s, d, rc] = await Promise.all([get('/laps' + q, ttl, fresh), get('/stints' + q, ttl, fresh), get('/drivers' + q, ttl, fresh),
      hasRaceControl(session.name) ? get('/race_control' + q, ttl, fresh).catch(() => none) : Promise.resolve(none)]);
    const parts = [l, s, d];
    const source = parts.some(x => x.source === 'stale') ? 'stale' : parts.every(x => x.source === 'cache') ? 'cache' : 'api';
    return Object.assign(build(l.data, s.data, d.data, neutralLaps(rc.data)), { at: Math.min(l.at, s.at, d.at), source, blocked: parts.some(x => x.blocked), segments: quali ? qualiSegments(rc.data, sprint) : [] });
  }

  // ---- numbers ----
  const min = a => { const v = a.filter(x => x != null); return v.length ? Math.min(...v) : null; };
  const max = a => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
  // The session's best lap time, the line "slow" is measured from.
  const sessionBest = laps => min(laps.map(l => l.t));
  // The laps that show pace: a time, not a pit-out or in lap, and (unless `slow`) within 107% of the session's best and not under a safety car.
  function pace(laps, {slow=false, best=sessionBest(laps)}={}){
    return laps.filter(l => l.t != null && !l.out && !l.inn && (slow || (!l.sc && (best == null || l.t <= best * SLOW))));
  }

  // The things compared: each driver, or each team (its drivers' laps together). Sorted fastest best lap first.
  // The page may give each driver an `id` (the site's driver id), a `teamId` and `teamLabel` (the site's team) and a `color`;
  // without them OpenF1's own driver number, team name and colour are used.
  function entities(model, by){
    const best = n => min(model.laps.filter(l => l.d === n).map(l => l.t));
    const teamOf = d => d.teamId != null ? d.teamId : d.team;
    const rows = by === 'teams'
      ? [...new Set(model.drivers.map(teamOf))].map(id => {
          const ds = model.drivers.filter(d => teamOf(d) === id);
          return { id, label: ds[0].teamLabel || ds[0].team, color: ds[0].color, nums: ds.map(d => d.num), team: ds[0].team, drivers: ds };
        })
      : model.drivers.map(d => ({ id: d.id != null ? d.id : String(d.num), label: d.code, name: d.name, color: d.color, nums: [d.num], team: d.team, teamId: teamOf(d), drivers: [d] }));
    rows.forEach(r => { r.best = min(r.nums.map(best)); });
    return rows.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity) || (a.label < b.label ? -1 : 1));
  }
  const lapsOf = (model, e) => model.laps.filter(l => e.nums.includes(l.d));

  // Best lap, best sectors, the ideal lap (the three best sectors added up) and top speeds of a set of laps.
  function stats(laps){
    const sec = [0, 1, 2].map(i => min(laps.map(l => l.s[i])));
    const best = min(laps.map(l => l.t));
    const ideal = sec.every(v => v != null) ? sec[0] + sec[1] + sec[2] : null;
    // the gap is never negative: a best lap that is its own ideal lap can differ by a thousandth from the sectors added up
    return { best, sec, ideal, gap: best != null && ideal != null ? Math.max(0, Math.round((best - ideal) * 1000) / 1000) : null,
      st: max(laps.map(l => l.st)), i1: max(laps.map(l => l.i1)), i2: max(laps.map(l => l.i2)), n: laps.filter(l => l.t != null).length };
  }

  // A histogram of lap times in bins `width` seconds wide from `lo`: counts[i] = laps in [lo + i*width, lo + (i+1)*width).
  function bin(times, lo, width, n){
    const counts = new Array(n).fill(0);
    times.forEach(t => { const i = Math.min(n - 1, Math.max(0, Math.floor((t - lo) / width + 1e-9))); counts[i]++; });
    return counts;
  }
  // A bin width that gives about 24 bins over the range, in tenths of a second (never finer than 0.1 s).
  function binWidth(lo, hi){ return Math.max(0.1, Math.ceil((hi - lo) / 24 * 10) / 10); }

  // 1:23.456 for a lap, 23.456 for a sector.
  function fmt(t, digits = 3){
    if(t == null) return '–';
    const m = Math.floor(t / 60), s = (t - m * 60).toFixed(digits).padStart(digits + 3, '0');
    return m ? m + ':' + s : (t - m * 60).toFixed(digits);
  }
  // OpenF1 gives speeds in whole km/h; "mph" is the same speed to the nearest 0.1 mph.
  const speedIn = (kmh, unit) => kmh == null ? null : unit === 'mph' ? Math.round(kmh * 0.621371 * 10) / 10 : kmh;
  const gapText = g => g == null ? '–' : (g >= 0 ? '+' : '−') + Math.abs(g).toFixed(3);

  const api = { BASE, SLOW, weekends, weekendForRound, defaultWeekend, defaultSession, sessions, build, load, hasSaved, liveUntil, live, compact, inflate, makeLimiter, SESSION_FIELDS, KINDS, qualiSegments, neutralLaps, isQualifying, hasRaceControl, results, resultOrder, resultKind, RESULT_KINDS, sessionBest, pace, entities, lapsOf, stats, bin, binWidth, fmt, gapText, speedIn, shortName };
  return api;
})();
if(typeof module !== 'undefined' && module.exports) module.exports = F1OpenF1; // Node (the tests)
