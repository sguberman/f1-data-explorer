/* F1Data — shared fetch/cache/normalize layer for f1api.dev (https://f1api.dev/docs)
   Design notes:
   - Every completed round is cached permanently in localStorage (results never change once a season moves on).
   - The single most-recently-seen round is cached with a short TTL instead, since post-race penalties can
     still revise points for a day or two — we don't want a stale wrong classification stuck forever.
   - Rounds are discovered by walking round=1,2,3... until the API returns an empty result set, rather than
     depending on a separate calendar endpoint, so this keeps working even if that endpoint's shape differs
     from what's documented.
   - Sprint results are fetched from the separate /sprint/race endpoint — no guessing at race/sprint splits.
   - Results carry only what f1api.dev gives: a classified `position` (null when not classified, "NC") and
     points. Retirement causes aren't tracked (#46): f1api.dev gives none, and a retired driver who was
     still classified simply has a position like anyone else. */
const F1Data = (() => {
  const API = 'https://f1api.dev/api';
  const CACHE_NS = 'f1cache:v2:'; // v2 (#18): results now keep driver number/nationality, team nationality and circuit country
  try{ // drop the old v1 entries, which lack those fields
    for(let i=localStorage.length-1;i>=0;i--){ const k=localStorage.key(i); if(k && k.startsWith('f1cache:v1:')) localStorage.removeItem(k); }
  }catch(e){ /* storage unavailable */ }
  const FRESH_ROUND_TTL_MS = 60 * 60 * 1000; // 1 hour — only applied to the latest round seen in a load
  const MAX_ROUNDS = 26;
  const CHECK_TTL_MS = 24 * 60 * 60 * 1000; // #60: how long a check for new rounds is reused, site-wide

  // Hand corrections for f1api.dev's calendar sprint flag, for rounds where it's missing or wrong
  // (seen in practice: an upcoming round on a live season whose schedule.sprintRace.date hadn't been
  // populated yet). Keyed "year:round" -> true/false.
  const SPRINT_OVERRIDES = {
    '2026:17': true // Singapore — f1api.dev's calendar had no sprintRace.date as of Oct 2026
  };

  // Each entry is {v: value, exp: expiry ms or null, t: when it was fetched from f1api.dev}. `t` (issue #49)
  // is missing on entries cached before it existed — those read as "fetch time unknown".
  function cacheGetEntry(key){
    try{
      const raw=localStorage.getItem(CACHE_NS+key);
      if(!raw) return undefined;
      const {v,exp,t}=JSON.parse(raw);
      if(exp && Date.now()>exp){ localStorage.removeItem(CACHE_NS+key); return undefined; }
      return {v, t: t||null};
    }catch(e){ return undefined; }
  }
  function cacheGet(key){
    const entry=cacheGetEntry(key);
    return entry ? entry.v : undefined;
  }
  // `fetchedAt` defaults to now; pass the original fetch time when re-stamping an already-cached value.
  function cacheSet(key,value,ttlMs,fetchedAt){
    const t = fetchedAt===undefined ? Date.now() : fetchedAt;
    try{ localStorage.setItem(CACHE_NS+key, JSON.stringify({v:value, exp: ttlMs?Date.now()+ttlMs:null, t})); }
    catch(e){ /* storage full or unavailable — fail silently, just refetches next time */ }
  }
  // issue #23: drop every cached f1api.dev response (all seasons). Leaves other localStorage keys — the
  // theme and the selected season — alone, since they don't start with CACHE_NS.
  function clearCache(){
    try{
      const keys=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.startsWith(CACHE_NS)) keys.push(k); }
      keys.forEach(k=>localStorage.removeItem(k));
    }catch(e){ /* storage unavailable — nothing to clear */ }
  }

  async function fetchJSON(url, attempt=0){
    let res;
    try{
      res = await fetch(url);
    }catch(e){
      // network-level failure (offline, DNS, CORS) — always transient, worth one retry
      if(attempt===0){ await new Promise(r=>setTimeout(r,300)); return fetchJSON(url,1); }
      throw e;
    }
    if(res.status===404){
      // A clean 404 is the API's deliberate "this doesn't exist" signal (e.g. no sprint this round) —
      // not a transient failure, so no point retrying it. Thrown as a distinct, recognizable error so
      // callers can tell "confirmed not found" apart from a genuine fetch problem.
      const err = new Error('HTTP 404 for '+url);
      err.notFound = true;
      throw err;
    }
    if(!res.ok){
      if(attempt===0){ await new Promise(r=>setTimeout(r,300)); return fetchJSON(url,1); } // one retry — batched requests can trip transient rate limits
      throw new Error('HTTP '+res.status+' for '+url);
    }
    return await res.json();
  }

  // Always resolves to the SAME normalized shape whether it came from cache or the network:
  // { ok, raceName, results, failed, _fresh, _key, _t } — _t is when the data was fetched (null if unknown);
  // ok=false covers both "no sprint this round" and
  // "round hasn't happened yet". `failed` marks an actual fetch error (network issue, rate limit, bad
  // JSON) as distinct from a confirmed empty response — callers must NOT permanently cache a failure,
  // since that would silently and permanently lock in "no sprint" for a round that may have had one.
  async function fetchSession(season, round, kind){
    const path = kind==='sprint' ? `${season}/${round}/sprint/race` : `${season}/${round}/race`;
    const cached = cacheGetEntry(path);
    if(cached !== undefined) return { ...cached.v, failed:false, _fresh:false, _key:path, _t:cached.t };
    let race = null, failed = false;
    try{
      const data = await fetchJSON(`${API}/${path}`);
      race = data && data.races ? data.races : null;
    }catch(e){
      race = null;
      // A 404 is a confirmed "not found" (e.g. no sprint this round), not a fetch failure — leave
      // `failed` false so the caller caches this as a real negative result instead of refusing to
      // cache it and re-checking (and re-404ing) on every single future load.
      if(!(e && e.notFound)) failed = true;
    }
    // f1api.dev uses a DIFFERENT key for sprint results than race results — "sprintRaceResults" vs
    // "results". Using the wrong key silently finds nothing, every time, for every sprint round.
    const resultsArr = race ? (kind==='sprint' ? race.sprintRaceResults : race.results) : null;
    const hasResults = Array.isArray(resultsArr) && resultsArr.length>0;
    const norm = hasResults
      ? { ok:true, raceName: race.raceName, country: circuitCountry(race), results: normalizeResults(resultsArr, kind) }
      : { ok:false, raceName:null, country:null, results:[] };
    return { ...norm, failed, _fresh:true, _key:path, _t:Date.now() };
  }

  // #18: the circuit's country, for the round's flag. f1api.dev sends `circuit` as an object or a one-item array.
  function circuitCountry(race){
    const c = Array.isArray(race.circuit) ? race.circuit[0] : race.circuit;
    return (c && c.country) || null;
  }

  function normalizeResults(resultsArr, kind){
    if(!resultsArr) return [];
    return resultsArr.map(r=>{
      return {
        driverId: r.driver.driverId,
        code: r.driver.shortName,
        name: r.driver.name+' '+r.driver.surname,
        teamId: r.team.teamId,
        teamName: r.team.teamName,
        number: Number.isFinite(parseInt(r.driver.number,10)) ? parseInt(r.driver.number,10) : null, // #18
        nationality: r.driver.nationality || null,
        teamNationality: r.team.nationality || r.team.teamNationality || null,
        // a classified finishing position, or null when not classified (f1api.dev sends null, "-" or "NC")
        position: Number.isFinite(parseInt(r.position,10)) && parseInt(r.position,10)>=1 ? parseInt(r.position,10) : null,
        points: r.points||0,
        session: kind
      };
    });
  }

  // Walk rounds (in small parallel batches, for speed) until an empty race result is hit.
  // Resolves to { rounds, failed, fetchedAt }:
  // - rounds: array of {round, raceName, raceResults:[...], sprintResults:[...]|null}
  // - failed (issue #48): true if any fetch failed, so some results may be missing — the load stops at
  //   the first failed round, and a failed sprint fetch reads as "no sprint" for that round.
  // - fetchedAt (issue #49): latest time any data used by this load was fetched from f1api.dev
  //   (ms timestamp), or null if unknown.
  const BATCH_SIZE = 5;

  // #13: each season is also published as one file, site/data/{year}.json, written by a scheduled GitHub
  // workflow (tools/snapshot.mjs): {v, year, generatedAt, complete, calendar, rounds}. One request loads a
  // whole season; a complete season then needs nothing from f1api.dev, and an in-progress one only asks it
  // about rounds after the snapshot. If the file is missing or broken, the season loads live as before.
  const snapshots = {}; // year -> snapshot loaded this page view (its calendar is reused by getCalendar)
  async function fetchSnapshot(year, fresh){
    try{
      const res = await fetch(`data/${year}.json`, fresh ? {cache:'reload'} : {});
      if(!res.ok) return null;
      const snap = await res.json();
      if(!snap || snap.v!==1 || snap.year!==year || !Array.isArray(snap.rounds)) return null;
      snapshots[year] = snap;
      return snap;
    }catch(e){ return null; }
  }

  // opts: onProgress(round, count); live: true skips the snapshot (the snapshot tool itself uses this);
  // fresh: true asks the browser to re-download the snapshot (Refresh data).
  async function loadSeason(year, opts={}){
    const { onProgress } = opts;
    const rounds = [];
    let round = 1, failed = false, fetchedAt = null;
    const noteFetch = t => { if(t && (fetchedAt===null || t>fetchedAt)) fetchedAt = t; };
    const snap = opts.live ? null : await fetchSnapshot(year, opts.fresh);
    if(snap){
      snap.rounds.forEach(r=>rounds.push(r));
      noteFetch(snap.generatedAt);
      if(onProgress && rounds.length) onProgress(rounds[rounds.length-1].round, rounds.length);
      if(snap.complete) return { rounds, failed, fetchedAt, fromSnapshot:true };
      round = rounds.length ? rounds[rounds.length-1].round + 1 : 1; // only newer rounds come from f1api.dev
    }
    const firstLive = round;
    // #60: f1api.dev is asked about rounds newer than the snapshot at most once a day per season, across the
    // whole site; until then every page and season switch reuses what that check found. Refresh data clears it.
    if(!opts.live){
      const entry = cacheGetEntry(`${year}/checked`), recent = entry && entry.v;
      if(recent && Array.isArray(recent.rounds) && recent.firstLive <= firstLive){
        recent.rounds.filter(r=>r.round>=firstLive).forEach(r=>rounds.push(r));
        noteFetch(entry.t);
        if(onProgress && rounds.length) onProgress(rounds[rounds.length-1].round, rounds.length);
        return { rounds, failed, fetchedAt, fromSnapshot: !!snap };
      }
    }
    // after a snapshot, usually nothing (or one race) is newer: check a round at a time, not five
    const batchSize = snap ? 1 : BATCH_SIZE;

    while(round <= MAX_ROUNDS){
      const batch = [];
      for(let i=0; i<batchSize && round+i<=MAX_ROUNDS; i++) batch.push(round+i);

      let pairs;
      try{
        pairs = await Promise.all(batch.map(async r=>{
          const [raceR, sprintR] = await Promise.all([
            fetchSession(year, r, 'race'),
            fetchSession(year, r, 'sprint')
          ]);
          return { r, raceR, sprintR };
        }));
      }catch(e){
        console.warn('F1Data: batch fetch failed, stopping load at round', round, e);
        failed = true;
        break; // a genuine network failure — stop here rather than hang, keep whatever loaded so far
      }

      let hitEnd = false, stoppedOnFailure = false;
      for(const {r, raceR, sprintR} of pairs){
        // A failed fetch (network hiccup, rate limit) is NOT the same as a confirmed negative — never
        // cache it, and never conclude the season ended because of one. Just stop collecting for this
        // load; nothing was cached, so the next load retries this round fresh.
        if(raceR.failed){ stoppedOnFailure = true; failed = true; break; }
        noteFetch(raceR._t);
        // cache every freshly-fetched, CONFIRMED round permanently, including negative results (no
        // sprint that round, or round hasn't happened yet) so we stop re-asking the same question on
        // every load. A round that hasn't happened yet gets a short TTL — it needs rechecking as the season moves on.
        if(raceR._fresh) cacheSet(raceR._key, {ok:raceR.ok, raceName:raceR.raceName, country:raceR.country, results:raceR.results}, raceR.ok ? null : FRESH_ROUND_TTL_MS);
        if(!raceR.ok){ hitEnd = true; break; } // confirmed: first un-run round — season data ends here
        if(sprintR.failed) failed = true; else noteFetch(sprintR._t);
        if(sprintR._fresh && !sprintR.failed) cacheSet(sprintR._key, {ok:sprintR.ok, raceName:sprintR.raceName, results:sprintR.results}, null);

        rounds.push({
          round: r,
          raceName: raceR.raceName,
          country: raceR.country || null,
          raceResults: raceR.results,
          // If the sprint fetch itself failed, this reads as "no sprint" just for this one render —
          // nothing was cached for it, so the next load retries and self-corrects.
          sprintResults: sprintR.ok ? sprintR.results : null,
          _sprintFailed: sprintR.failed, // only used below, to avoid re-stamping a failure as confirmed
          _raceT: raceR._t, _sprintT: sprintR._t // original fetch times, kept when re-stamping below
        });
        if(onProgress) onProgress(r, rounds.length);
      }
      if(hitEnd || stoppedOnFailure) break;
      round += batchSize;
    }

    // Shorten the TTL on just the last round, so post-race penalty corrections get re-checked soon —
    // rewriting the SAME correct value, not a placeholder (that was an earlier bug). If that round's
    // sprint fetch had failed, leave its cache entry alone rather than re-stamping a failure as a
    // confirmed "no sprint" (that was a second instance of the same class of bug).
    if(rounds.length && rounds[rounds.length-1].round >= firstLive){
      const last = rounds[rounds.length-1];
      cacheSet(`${year}/${last.round}/race`, {ok:true, raceName:last.raceName, country:last.country, results:last.raceResults}, FRESH_ROUND_TTL_MS, last._raceT);
      if(!last._sprintFailed){
        cacheSet(`${year}/${last.round}/sprint/race`,
          {ok: !!last.sprintResults, raceName:last.raceName, results:last.sprintResults||[]}, FRESH_ROUND_TTL_MS, last._sprintT);
      }
    }
    rounds.forEach(r=>{ delete r._sprintFailed; delete r._raceT; delete r._sprintT; });
    // #60: remember a clean check for a day (a failed one isn't kept, so the next load or Retry checks again)
    if(!failed && !opts.live)
      cacheSet(`${year}/checked`, { firstLive, rounds: rounds.filter(r=>r.round>=firstLive) }, CHECK_TTL_MS, fetchedAt);
    return { rounds, failed, fetchedAt, fromSnapshot: !!snap };
  }

  // Real season schedule from /api/[year] — every round for the year, including ones not yet run,
  // each flagged for whether it has a sprint. This is the authoritative source for "how many rounds
  // and sprints does this season have in total", replacing any static guess. Cached for a day: calendars
  // are effectively static but can occasionally get revised (e.g. a postponed/relocated round).
  // Shape: {totalRounds, sprintRounds, raceNames, raceDates, raceTimes, countries}. #89 added the last three
  // (round -> 'YYYY-MM-DD' Grand Prix date, round -> 'HH:MM:SSZ' start time in UTC when known, round -> circuit
  // country), for the homepage's next race. Season files made before #89 lack them; callers must cope.
  const CALENDAR_TTL_MS = 24*60*60*1000;
  // f1api.dev's schedule.race: {date:'2026-10-25', time:'20:00:00Z'}; either can be null. Times without a zone
  // are UTC (as in Ergast/Jolpica).
  function raceDate(d){ return typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; }
  function raceTime(t){
    const m = typeof t==='string' && t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
    if(!m || +m[1]>23 || +m[2]>59) return null;
    const zone = !m[4] || /z/i.test(m[4]) ? 'Z' : m[4].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
    return `${m[1].padStart(2,'0')}:${m[2]}:${m[3]||'00'}${zone}`;
  }
  // opts.dates (#89): the caller needs race dates. A season file made before #89 has none, so then the file's
  // calendar is skipped; with no file loaded yet, the season file is fetched for its calendar (one request the
  // browser caches, and the pages need the same file) before falling back to f1api.dev.
  async function getCalendar(year, opts={}){
    const usable = c => c && c.totalRounds && (!opts.dates || c.raceDates);
    // #13: a snapshot loaded for this season carries the calendar — no request needed
    let snap = snapshots[year];
    if(snap && usable(snap.calendar)) return snap.calendar;
    const key = `${year}/calendar3`; // bumped from /calendar2 (#89: race dates, times and countries)
    const cached = cacheGet(key);
    if(cached !== undefined && usable(cached)) return cached;
    if(opts.dates && !snap){
      snap = await fetchSnapshot(year);
      if(snap && usable(snap.calendar)){ cacheSet(key, snap.calendar, CALENDAR_TTL_MS); return snap.calendar; }
    }
    let totalRounds=0, sprintRounds=[], raceNames={}, raceDates={}, raceTimes={}, countries={}, failed=false;
    try{
      const data = await fetchJSON(`${API}/${year}?limit=30`);
      const races = (data && data.races) || [];
      totalRounds = races.length;
      races.forEach(r=>{
        raceNames[r.round] = r.raceName;
        const race = (r.schedule && r.schedule.race) || {};
        const date = raceDate(race.date), time = date && raceTime(race.time);
        if(date) raceDates[r.round] = date;
        if(time) raceTimes[r.round] = time;
        const country = circuitCountry(r);
        if(country) countries[r.round] = country;
        const apiSaysSprint = !!(r.schedule && r.schedule.sprintRace && r.schedule.sprintRace.date);
        const overrideKey = `${year}:${r.round}`;
        const isSprint = overrideKey in SPRINT_OVERRIDES ? SPRINT_OVERRIDES[overrideKey] : apiSaysSprint;
        if(isSprint) sprintRounds.push(r.round);
      });
    }catch(e){ failed = true; /* leave zeros — callers fall back to their own default when totalRounds is 0 */ }
    const result = { totalRounds, sprintRounds, raceNames, raceDates, raceTimes, countries };
    if(!failed) cacheSet(key, result, CALENDAR_TTL_MS); // a failed fetch isn't kept (#22), so the next load retries
    return result;
  }

  // Build cumulative per-driver and per-team points through a given round (1-indexed, inclusive).
  function cumulative(seasonRounds, throughRound){
    const upto = seasonRounds.filter(r=>r.round<=throughRound);
    const drivers = {}, teams = {};
    upto.forEach(r=>{
      const rows = [...r.raceResults, ...(r.sprintResults||[])];
      rows.forEach(res=>{
        const dk = res.driverId;
        if(!drivers[dk]) drivers[dk]={driverId:dk,code:res.code,name:res.name,teamId:res.teamId,teamName:res.teamName,number:res.number,nationality:res.nationality,rounds:[]};
        drivers[dk].rounds.push({round:r.round,session:res.session,points:res.points});
        const tk = res.teamId;
        if(!teams[tk]) teams[tk]={teamId:tk,teamName:res.teamName,nationality:res.teamNationality,rounds:[]};
        teams[tk].rounds.push({round:r.round,session:res.session,points:res.points});
      });
    });
    return { drivers, teams, roundsLoaded: upto.length };
  }

  function topTeams(cum, n=4){
    return Object.values(cum.teams)
      .map(t=>({teamId:t.teamId,teamName:t.teamName,total:t.rounds.reduce((s,r)=>s+r.points,0)}))
      .sort((a,b)=>b.total-a.total).slice(0,n).map(t=>t.teamId);
  }

  return { loadSeason, cumulative, topTeams, getCalendar, clearCache };
})();
