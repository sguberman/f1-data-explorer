// F1OpenF1 (#186): practice, qualifying and sprint lap data from OpenF1 (https://openf1.org), for the Weekend Pace page.
// f1api.dev has no session laps, sectors, speeds or tyres, so this is the one page that talks to another API. It is
// called from the browser (OpenF1 allows it), needs no key for finished sessions, and is cached in localStorage:
// a session that ended more than two hours ago for a day, a session still running (or just over) for five minutes.
// The pure functions (build, entities, stats, bin…) take plain data and are shared with Node (tests); the fetch part
// only runs in a browser. Nothing here fetches except load() and sessions(): the page's toggles and pickers never do.
const F1OpenF1 = (() => {
  const BASE = 'https://api.openf1.org/v1';
  const SLOW = 1.07; // a lap more than 107% of the session's best counts as slow (cool-down, traffic, a spin…)
  const HOUR = 3600e3, DAY = 24 * HOUR;

  // ---- fetch + cache ----
  const KEY = 'f1o:v1:';
  function cacheGet(path, ttl){
    try{
      const o = JSON.parse(localStorage.getItem(KEY + path));
      if(o && Date.now() - o.t < ttl) return o;
    }catch(e){}
    return null;
  }
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
  async function get(path, ttl, fresh){
    const hit = !fresh && cacheGet(path, ttl);
    if(hit) return { data: hit.d, at: hit.t };
    const res = await fetch(BASE + path);
    if(!res.ok) throw new Error('OpenF1 HTTP ' + res.status);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('OpenF1: unexpected answer');
    cachePut(path, data);
    return { data, at: Date.now() };
  }

  // ---- sessions ----
  const SHORT = { 'Practice 1': 'FP1', 'Practice 2': 'FP2', 'Practice 3': 'FP3', 'Qualifying': 'Quali', 'Sprint Qualifying': 'Sprint Quali',
    'Sprint Shootout': 'Sprint Quali' };
  const shortName = n => SHORT[n] || n;
  // The lap-based sessions this page can show; the Race is left out (it is not practice or qualifying pace).
  const KINDS = new Set(['Practice 1', 'Practice 2', 'Practice 3', 'Qualifying', 'Sprint Qualifying', 'Sprint Shootout', 'Sprint']);

  // A year's sessions grouped into weekends, in date order: [{key, label, country, start, sessions:[{key, name, short, start, end}]}].
  function weekends(rows){
    const by = new Map();
    (rows || []).filter(s => KINDS.has(s.session_name) && !s.is_cancelled).forEach(s => {
      if(!by.has(s.meeting_key)) by.set(s.meeting_key, { key: s.meeting_key, label: s.location, country: s.country_name, start: s.date_start, sessions: [] });
      by.get(s.meeting_key).sessions.push({ key: s.session_key, name: s.session_name, short: shortName(s.session_name), start: s.date_start, end: s.date_end });
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
  async function sessions(year, {fresh=false}={}){
    const r = await get('/sessions?year=' + year, 30 * 60e3, fresh);
    return { list: weekends(r.data), at: r.at };
  }

  // ---- one session ----
  // Joins the three lists into {drivers, laps}. Drivers: {num, code, name, team, color}. Laps: {d (driver number), n (lap number),
  // t (lap time, s), s [s1, s2, s3], i1, i2, st (speeds, km/h), out (pit-out lap), inn (in-lap: last lap of a stint
  // that another stint follows), c (compound), age (tyre age on the lap)}; a missing value is null.
  function build(laps, stints, drivers){
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
        inn: !!(st && later && l.lap_number === st.lap_end),
        c: st ? st.compound : null, age: st ? (st.tyre_age_at_start || 0) + (l.lap_number - st.lap_start) : null };
    }).sort((a, b) => (a.d - b.d) || (a.n - b.n));
    // only drivers who set a lap
    const seen = new Set(out.map(l => l.d));
    return { drivers: ds.filter(d => seen.has(d.num)), laps: out };
  }
  async function load(session, {fresh=false, now=Date.now()}={}) {
    const over = now - Date.parse(session.end) > 2 * HOUR;
    const ttl = over ? DAY : 5 * 60e3, q = '?session_key=' + session.key;
    const [l, s, d] = await Promise.all([get('/laps' + q, ttl, fresh), get('/stints' + q, ttl, fresh), get('/drivers' + q, ttl, fresh)]);
    return Object.assign(build(l.data, s.data, d.data), { at: Math.min(l.at, s.at, d.at) });
  }

  // ---- numbers ----
  const min = a => { const v = a.filter(x => x != null); return v.length ? Math.min(...v) : null; };
  const max = a => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
  // The session's best lap time, the line "slow" is measured from.
  const sessionBest = laps => min(laps.map(l => l.t));
  // The laps that show pace: a time, not a pit-out or in lap, and (unless `slow`) within 107% of the session's best.
  function pace(laps, {slow=false, best=sessionBest(laps)}={}){
    return laps.filter(l => l.t != null && !l.out && !l.inn && (slow || best == null || l.t <= best * SLOW));
  }

  // The things compared: each driver, or each team (its drivers' laps together). Sorted fastest best lap first.
  function entities(model, by){
    const best = n => min(model.laps.filter(l => l.d === n).map(l => l.t));
    const rows = by === 'teams'
      ? [...new Set(model.drivers.map(d => d.team))].map(team => {
          const ds = model.drivers.filter(d => d.team === team);
          return { id: team, label: team, color: ds[0].color, nums: ds.map(d => d.num), team, drivers: ds };
        })
      : model.drivers.map(d => ({ id: String(d.num), label: d.code, name: d.name, color: d.color, nums: [d.num], team: d.team, drivers: [d] }));
    rows.forEach(r => { r.best = min(r.nums.map(best)); });
    return rows.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity) || (a.label < b.label ? -1 : 1));
  }
  const lapsOf = (model, e) => model.laps.filter(l => e.nums.includes(l.d));

  // Best lap, best sectors, the ideal lap (the three best sectors added up) and top speeds of a set of laps.
  function stats(laps){
    const sec = [0, 1, 2].map(i => min(laps.map(l => l.s[i])));
    const best = min(laps.map(l => l.t));
    const ideal = sec.every(v => v != null) ? sec[0] + sec[1] + sec[2] : null;
    return { best, sec, ideal, gap: best != null && ideal != null ? best - ideal : null,
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
  const gapText = g => g == null ? '–' : (g >= 0 ? '+' : '−') + Math.abs(g).toFixed(3);

  const api = { BASE, SLOW, weekends, defaultWeekend, defaultSession, sessions, build, load, sessionBest, pace, entities, lapsOf, stats, bin, binWidth, fmt, gapText, shortName };
  return api;
})();
if(typeof module !== 'undefined' && module.exports) module.exports = F1OpenF1; // Node (the tests)
