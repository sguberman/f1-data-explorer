/* F1Data — shared fetch/cache/normalize layer for f1api.dev (https://f1api.dev/docs)
   Design notes:
   - Every completed round is cached permanently in localStorage (results never change once a season moves on).
   - The single most-recently-seen round is cached with a short TTL instead, since post-race penalties can
     still revise points for a day or two — we don't want a stale wrong classification stuck forever.
   - Rounds are discovered by walking round=1,2,3... until the API returns an empty result set, rather than
     depending on a separate calendar endpoint, so this keeps working even if that endpoint's shape differs
     from what's documented.
   - Sprint results are fetched from the separate /sprint/race endpoint — no guessing at race/sprint splits.
   - DNF cause (mechanical vs not): f1api.dev's `retired` field (documented as boolean|null in its own SDK
     types) comes back `null` for every single result we've checked, finishers and DNFs alike — the API
     currently gives no retirement reason at all, just `position` (null/"-"/"NC" for an unclassified result)
     and a `time` field like "DNF (44)". So isMechanical()'s keyword matching below has nothing to match
     against and is effectively dead with live data (issue #36). MANUAL_OVERRIDES is therefore the ONLY
     real source of mechanical-vs-not classification right now, hand-researched per round from real 2026
     race reports (Wikipedia's season recaps, Motorsport/PlanetF1/F1.com/crash.net/pitdebrief articles) —
     not inferred from this site's own data. This needs manual upkeep: add an entry here whenever a new
     DNF's cause gets reported after a future round. A driver with a REAL classified position (even a bad
     one, e.g. lapped many times) who isn't listed here is correctly left uncategorized — only enter a
     driver here when their retirement's actual cause has been found. */
const F1Data = (() => {
  const API = 'https://f1api.dev/api';
  const CACHE_NS = 'f1cache:v1:';
  const FRESH_ROUND_TTL_MS = 60 * 60 * 1000; // 1 hour — only applied to the latest round seen in a load
  const MAX_ROUNDS = 26;

  const MECHANICAL_KEYWORDS = ['engine','gearbox','hydraulic','electrical','electronic','battery','brake',
    'suspension','clutch','fuel','turbo','exhaust','cooling','overheat','oil','mechanical','wheel','sensor',
    'ers','mgu','power unit','wiring','differential','steering','throttle','water leak','vibration'];
  const NON_MECHANICAL_KEYWORDS = ['collision','accident','crash','spun','spin','contact','puncture',
    'disqualified','did not start','withdrew','black flag','illness'];

  // Hand-researched mechanical-vs-not classification for 2026 DNFs (issue #36 — see note above; this is
  // the primary classification source, not a correction layer, since the API gives us nothing to correct).
  // Keyed as "season:round:driverId" -> true (mechanical) or false (not mechanical, e.g. a crash/collision/
  // driver error). A handful of drivers retired with no reported cause found anywhere researched and are
  // deliberately left out (defaults to non-mechanical): 2026 round 5 (Alonso, Lindblad), round 6 (Sainz),
  // round 7 (Bearman, Albon, Bottas, Stroll), round 14 (Sainz).
  const MANUAL_OVERRIDES = {
    // Round 1 — Australia: Piastri crashed on the way to the grid (non-mechanical). Hadjar (power unit),
    // Hulkenberg (DNS, unfixed technical problem), Bottas (fuel system) and the Aston Martins (Alonso,
    // Stroll — car vibration/reliability woes) were all mechanical.
    '2026:1:piastri': false, '2026:1:hadjar': true, '2026:1:hulkenberg': true,
    '2026:1:bottas': true, '2026:1:alonso': true, '2026:1:stroll': true,

    // Round 2 — China: every retirement was mechanical — Norris/Piastri (McLaren electrical/power unit,
    // both DNS), Bortoleto (hydraulics, DNS), Albon (suspension, DNS), Verstappen (late-race mechanical),
    // Stroll (battery), Alonso (same Aston Martin vibration issue as round 1).
    '2026:2:norris': true, '2026:2:piastri': true, '2026:2:bortoleto': true, '2026:2:albon': true,
    '2026:2:max_verstappen': true, '2026:2:alonso': true, '2026:2:stroll': true,

    // Round 3 — Japan: Bearman crashed heavily (non-mechanical). Stroll retired with a suspected water
    // pressure issue (mechanical).
    '2026:3:bearman': false, '2026:3:stroll': true,

    // Round 4 — Miami: Hadjar crashed into the wall at the chicane; Gasly and Lawson collided with each
    // other (all three non-mechanical). Hulkenberg retired with an overheating drivetrain (mechanical).
    '2026:4:hadjar': false, '2026:4:gasly': false, '2026:4:lawson': false, '2026:4:hulkenberg': true,

    // Round 5 — Canada: Russell (power unit), Norris (gearbox) and Pérez (suspension) were mechanical;
    // Albon was taken out by a Piastri collision (non-mechanical).
    '2026:5:russell': true, '2026:5:norris': true, '2026:5:perez': true, '2026:5:albon': false,

    // Round 6 — Monaco: Verstappen, Bottas, Bearman and Norris retired to reliability issues (mechanical);
    // Stroll and Leclerc crashed (non-mechanical).
    '2026:6:max_verstappen': true, '2026:6:bottas': true, '2026:6:bearman': true, '2026:6:norris': true,
    '2026:6:stroll': false, '2026:6:leclerc': false,

    // Round 7 — Barcelona: Alonso (battery) and Antonelli (power unit) were mechanical. Leclerc's late DNF
    // was a brake-by-wire failure plus loss of power steering (mechanical). Hulkenberg's retirement was a
    // freak track-debris incident (a stone triggered his car's emergency shutoff cord) — not a reliability
    // failure, classified non-mechanical.
    '2026:7:alonso': true, '2026:7:antonelli': true, '2026:7:leclerc': true, '2026:7:hulkenberg': false,

    // Round 8 — Austria: Sainz (electrical) and both Cadillacs, Pérez and Bottas (brake overheating), were
    // mechanical. Stroll also retired with brake failure (mechanical).
    '2026:8:sainz': true, '2026:8:perez': true, '2026:8:bottas': true, '2026:8:stroll': true,

    // Round 9 — Britain: Verstappen (rear wing failure) and Hulkenberg (gearbox) were mechanical. Albon and
    // Sainz were both taken out in separate collisions (non-mechanical).
    '2026:9:max_verstappen': true, '2026:9:hulkenberg': true, '2026:9:albon': false, '2026:9:sainz': false,

    // Round 10 — Belgium: Russell retired after an opening-lap collision with Hamilton (non-mechanical).
    // Pérez (rear suspension) and Stroll (gearbox) were mechanical.
    '2026:10:russell': false, '2026:10:perez': true, '2026:10:stroll': true,

    // Round 11 — Hungary: Piastri (gearbox), Pérez (suspected internal/gearbox issue) and Bottas (brake
    // cooling — a recurring Cadillac problem) were all mechanical.
    '2026:11:piastri': true, '2026:11:perez': true, '2026:11:bottas': true,

    // Round 12 — Netherlands: Verstappen crashed on the opening lap (non-mechanical). Ocon (power unit),
    // Bearman (full car shutdown) and Bottas (hydraulics) were mechanical. Stroll retired after picking up
    // early-race damage (non-mechanical, cause of the damage itself unclear).
    '2026:12:max_verstappen': false, '2026:12:ocon': true, '2026:12:bearman': true, '2026:12:bottas': true,
    '2026:12:stroll': false,

    // Round 13 — Italy (Monza): Leclerc crashed (his own mistake, non-mechanical). Alonso retired after
    // kerb-strike/underbody damage (non-mechanical). Stroll retired with a hydraulic issue (mechanical).
    '2026:13:leclerc': false, '2026:13:alonso': false, '2026:13:stroll': true,

    // Round 14 — Spain (Madrid): Hamilton (brakes) and Pérez (cooling system) were mechanical. Stroll also
    // retired with brake failure (mechanical, same "pedal to the floor" issue as round 8).
    '2026:14:hamilton': true, '2026:14:perez': true, '2026:14:stroll': true,

    // Round 15 — Azerbaijan: Norris, Gasly and Colapinto were all taken out in separate collisions
    // (non-mechanical). Albon and Bottas also crashed (non-mechanical). Stroll retired with a water
    // pressure issue (mechanical); Alonso pitted himself over a suspected engine problem (mechanical).
    '2026:15:norris': false, '2026:15:gasly': false, '2026:15:colapinto': false, '2026:15:albon': false,
    '2026:15:bottas': false, '2026:15:stroll': true, '2026:15:alonso': true,

    // Round 16 — Bahrain (Malaysia): Russell retired with a suspected power unit issue (mechanical, even
    // though he was still scored P20 — a mechanical failure shouldn't count as a real finishing position).
    // Albon retired with a Williams technical issue (mechanical); Bottas crashed (non-mechanical).
    '2026:16:russell': true, '2026:16:albon': true, '2026:16:bottas': false
  };

  // Hand corrections for f1api.dev's calendar sprint flag, for rounds where it's missing or wrong
  // (seen in practice: an upcoming round on a live season whose schedule.sprintRace.date hadn't been
  // populated yet). Keyed "year:round" -> true/false.
  const SPRINT_OVERRIDES = {
    '2026:17': true // Singapore — f1api.dev's calendar had no sprintRace.date as of Oct 2026
  };

  function isMechanical(retiredText){
    // r.retired is documented as boolean|null (not text) — we've only ever observed null in practice, but
    // guard against a future true/false value reaching here and crashing on .toLowerCase().
    if(!retiredText || typeof retiredText !== 'string') return false;
    const t = retiredText.toLowerCase();
    if(NON_MECHANICAL_KEYWORDS.some(k=>t.includes(k))) return false;
    return MECHANICAL_KEYWORDS.some(k=>t.includes(k));
  }

  function cacheGet(key){
    try{
      const raw=localStorage.getItem(CACHE_NS+key);
      if(!raw) return undefined;
      const {v,exp}=JSON.parse(raw);
      if(exp && Date.now()>exp){ localStorage.removeItem(CACHE_NS+key); return undefined; }
      return v;
    }catch(e){ return undefined; }
  }
  function cacheSet(key,value,ttlMs){
    try{ localStorage.setItem(CACHE_NS+key, JSON.stringify({v:value, exp: ttlMs?Date.now()+ttlMs:null})); }
    catch(e){ /* storage full or unavailable — fail silently, just refetches next time */ }
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
  // { ok, raceName, results, failed, _fresh, _key } — ok=false covers both "no sprint this round" and
  // "round hasn't happened yet". `failed` marks an actual fetch error (network issue, rate limit, bad
  // JSON) as distinct from a confirmed empty response — callers must NOT permanently cache a failure,
  // since that would silently and permanently lock in "no sprint" for a round that may have had one.
  async function fetchSession(season, round, kind){
    const path = kind==='sprint' ? `${season}/${round}/sprint/race` : `${season}/${round}/race`;
    const cached = cacheGet(path);
    if(cached !== undefined) return { ...cached, failed:false, _fresh:false, _key:path };
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
      ? { ok:true, raceName: race.raceName, results: normalizeResults(resultsArr, season, round, kind) }
      : { ok:false, raceName:null, results:[] };
    return { ...norm, failed, _fresh:true, _key:path };
  }

  function normalizeResults(resultsArr, season, round, kind){
    if(!resultsArr) return [];
    return resultsArr.map(r=>{
      const retiredText = r.retired || null;
      const overrideKey = `${season}:${round}:${r.driver.driverId}`;
      let mechanical = overrideKey in MANUAL_OVERRIDES ? MANUAL_OVERRIDES[overrideKey] : isMechanical(retiredText);
      return {
        driverId: r.driver.driverId,
        code: r.driver.shortName,
        name: r.driver.name+' '+r.driver.surname,
        teamId: r.team.teamId,
        teamName: r.team.teamName,
        position: r.position!=null ? parseInt(r.position,10) : null,
        points: r.points||0,
        retired: retiredText,
        mechanical,
        session: kind
      };
    });
  }

  // Walk rounds (in small parallel batches, for speed) until an empty race result is hit.
  // Returns array of {round, raceName, raceResults:[...], sprintResults:[...]|null}
  const BATCH_SIZE = 5;

  async function loadSeason(year, opts={}){
    const { onProgress } = opts;
    const rounds = [];
    let round = 1;

    while(round <= MAX_ROUNDS){
      const batch = [];
      for(let i=0; i<BATCH_SIZE && round+i<=MAX_ROUNDS; i++) batch.push(round+i);

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
        break; // a genuine network failure — stop here rather than hang, keep whatever loaded so far
      }

      let hitEnd = false, stoppedOnFailure = false;
      for(const {r, raceR, sprintR} of pairs){
        // A failed fetch (network hiccup, rate limit) is NOT the same as a confirmed negative — never
        // cache it, and never conclude the season ended because of one. Just stop collecting for this
        // load; nothing was cached, so the next load retries this round fresh.
        if(raceR.failed){ stoppedOnFailure = true; break; }
        // cache every freshly-fetched, CONFIRMED round permanently, including negative results (no
        // sprint that round, or round hasn't happened yet) so we stop re-asking the same question on
        // every load. A round that hasn't happened yet gets a short TTL — it needs rechecking as the season moves on.
        if(raceR._fresh) cacheSet(raceR._key, {ok:raceR.ok, raceName:raceR.raceName, results:raceR.results}, raceR.ok ? null : FRESH_ROUND_TTL_MS);
        if(!raceR.ok){ hitEnd = true; break; } // confirmed: first un-run round — season data ends here
        if(sprintR._fresh && !sprintR.failed) cacheSet(sprintR._key, {ok:sprintR.ok, raceName:sprintR.raceName, results:sprintR.results}, null);

        rounds.push({
          round: r,
          raceName: raceR.raceName,
          raceResults: raceR.results,
          // If the sprint fetch itself failed, this reads as "no sprint" just for this one render —
          // nothing was cached for it, so the next load retries and self-corrects.
          sprintResults: sprintR.ok ? sprintR.results : null,
          _sprintFailed: sprintR.failed // only used below, to avoid re-stamping a failure as confirmed
        });
        if(onProgress) onProgress(r, rounds.length);
      }
      if(hitEnd || stoppedOnFailure) break;
      round += BATCH_SIZE;
    }

    // Shorten the TTL on just the last round, so post-race penalty corrections get re-checked soon —
    // rewriting the SAME correct value, not a placeholder (that was an earlier bug). If that round's
    // sprint fetch had failed, leave its cache entry alone rather than re-stamping a failure as a
    // confirmed "no sprint" (that was a second instance of the same class of bug).
    if(rounds.length){
      const last = rounds[rounds.length-1];
      cacheSet(`${year}/${last.round}/race`, {ok:true, raceName:last.raceName, results:last.raceResults}, FRESH_ROUND_TTL_MS);
      if(!last._sprintFailed){
        cacheSet(`${year}/${last.round}/sprint/race`,
          {ok: !!last.sprintResults, raceName:last.raceName, results:last.sprintResults||[]}, FRESH_ROUND_TTL_MS);
      }
      delete last._sprintFailed;
    }
    return rounds;
  }

  // Real season schedule from /api/[year] — every round for the year, including ones not yet run,
  // each flagged for whether it has a sprint. This is the authoritative source for "how many rounds
  // and sprints does this season have in total", replacing any static guess. Cached for a day: calendars
  // are effectively static but can occasionally get revised (e.g. a postponed/relocated round).
  const CALENDAR_TTL_MS = 24*60*60*1000;
  async function getCalendar(year){
    const key = `${year}/calendar2`; // bumped from /calendar — invalidates any pre-override cached copy
    const cached = cacheGet(key);
    if(cached !== undefined) return cached;
    let totalRounds=0, sprintRounds=[], raceNames={};
    try{
      const data = await fetchJSON(`${API}/${year}?limit=30`);
      const races = (data && data.races) || [];
      totalRounds = races.length;
      races.forEach(r=>{
        raceNames[r.round] = r.raceName;
        const apiSaysSprint = !!(r.schedule && r.schedule.sprintRace && r.schedule.sprintRace.date);
        const overrideKey = `${year}:${r.round}`;
        const isSprint = overrideKey in SPRINT_OVERRIDES ? SPRINT_OVERRIDES[overrideKey] : apiSaysSprint;
        if(isSprint) sprintRounds.push(r.round);
      });
    }catch(e){ /* leave zeros — callers fall back to their own default when totalRounds is 0 */ }
    const result = { totalRounds, sprintRounds, raceNames };
    cacheSet(key, result, CALENDAR_TTL_MS);
    return result;
  }

  // Build cumulative per-driver and per-team points through a given round (1-indexed, inclusive).
  // mechanicalMode: 'exclude' (drop mechanical DNF rounds from the dataset, as we've been doing) or 'include' (zero them, keep the round)
  function cumulative(seasonRounds, throughRound, mechanicalMode='exclude'){
    const upto = seasonRounds.filter(r=>r.round<=throughRound);
    const drivers = {}, teams = {};
    upto.forEach(r=>{
      const rows = [...r.raceResults, ...(r.sprintResults||[])];
      rows.forEach(res=>{
        if(res.mechanical && mechanicalMode==='exclude') return; // leave this round out entirely for this driver
        const dk = res.driverId;
        if(!drivers[dk]) drivers[dk]={driverId:dk,code:res.code,name:res.name,teamId:res.teamId,teamName:res.teamName,rounds:[]};
        drivers[dk].rounds.push({round:r.round,session:res.session,points:res.points});
        const tk = res.teamId;
        if(!teams[tk]) teams[tk]={teamId:tk,teamName:res.teamName,rounds:[]};
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

  return { loadSeason, cumulative, topTeams, isMechanical, getCalendar };
})();
