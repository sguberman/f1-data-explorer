/* F1Data — shared fetch/cache/normalize layer for f1api.dev (https://f1api.dev/docs)
   Design notes:
   - Every completed round is cached permanently in localStorage (results never change once a season moves on).
   - The single most-recently-seen round is cached with a short TTL instead, since post-race penalties can
     still revise points for a day or two — we don't want a stale wrong classification stuck forever.
   - Rounds are discovered by walking round=1,2,3... until the API returns an empty result set, rather than
     depending on a separate calendar endpoint, so this keeps working even if that endpoint's shape differs
     from what's documented.
   - Sprint results are fetched from the separate /sprint/race endpoint — no guessing at race/sprint splits.
   - DNF cause (mechanical vs not) is inferred from the API's `retired` text via keyword matching. This is a
     best-effort classifier, not a certainty — see MANUAL_OVERRIDES below to hand-correct specific rounds,
     the same way we did by hand via web search before this existed. */
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

  // Hand corrections for specific rounds where the keyword guess is known to be wrong.
  // Keyed as "season:round:driverId" -> true (treat as mechanical) or false (treat as not).
  const MANUAL_OVERRIDES = {};

  function isMechanical(retiredText){
    if(!retiredText) return false;
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

  async function fetchJSON(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP '+res.status+' for '+url);
    return res.json();
  }

  async function fetchSession(season, round, kind){
    // kind: 'race' or 'sprint'
    const path = kind==='sprint' ? `${season}/${round}/sprint/race` : `${season}/${round}/race`;
    const key = `${path}`;
    const cached = cacheGet(key);
    if(cached !== undefined) return cached;
    let race = null;
    try{
      const data = await fetchJSON(`${API}/${path}`);
      race = data && data.races ? data.races : null;
    }catch(e){ race = null; }
    const hasResults = race && Array.isArray(race.results) && race.results.length>0;
    return { race: hasResults ? race : null, _fresh: true, _key: key };
  }

  function normalizeResults(race, season, round, kind){
    if(!race) return [];
    return race.results.map(r=>{
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

  // Walk rounds until an empty race result is hit. Returns array of {round, raceName, race:[...], sprint:[...]|null}
  async function loadSeason(year, opts={}){
    const { onProgress } = opts;
    const rounds = [];
    for(let round=1; round<=MAX_ROUNDS; round++){
      const { race, _fresh, _key } = await fetchSession(year, round, 'race');
      if(!race) break; // first un-run round — season data ends here
      // cache: permanent for everything except we'll overwrite the *last* round with a short TTL below
      if(_fresh) cacheSet(_key, { race, results: normalizeResults(race, year, round, 'race') }, null);

      const sprintResult = await fetchSession(year, round, 'sprint');
      let sprintNorm = null;
      if(sprintResult.race){
        sprintNorm = normalizeResults(sprintResult.race, year, round, 'sprint');
        if(sprintResult._fresh) cacheSet(sprintResult._key, { race: sprintResult.race, results: sprintNorm }, null);
      }

      rounds.push({
        round,
        raceName: race.raceName,
        raceResults: normalizeResults(race, year, round, 'race'),
        sprintResults: sprintNorm
      });
      if(onProgress) onProgress(round, rounds.length);
    }
    // re-stamp the last round's cache entries with a short TTL so post-race penalty corrections get re-fetched soon
    if(rounds.length){
      const last = rounds[rounds.length-1];
      cacheSet(`${year}/${last.round}/race`, { race:true, results:last.raceResults }, FRESH_ROUND_TTL_MS);
      if(last.sprintResults) cacheSet(`${year}/${last.round}/sprint/race`, { race:true, results:last.sprintResults }, FRESH_ROUND_TTL_MS);
    }
    return rounds;
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

  return { loadSeason, cumulative, topTeams, isMechanical };
})();
