/* F1Common — helpers shared by every chart page (issue #44). These used to be copied into each page's
   inline <script>; keep page-specific logic in the pages and only move something here once it's
   genuinely identical across them. Load after theme.js (uses F1Theme) and before controls.js. */
const F1Common = (() => {
  // Team colors by f1api.dev teamId. Unlisted teams get a stable hashed color instead of breaking.
  const TEAM_COLORS={mercedes:'#00A79D',ferrari:'#DC0000',mclaren:'#FF8000',red_bull:'#1B2A6B',redbull:'#1B2A6B',
   alpine:'#FF1493',haas:'#1A1A1A',williams:'#00A3E0',audi:'#E8534D',sauber:'#E8534D',
   aston_martin:'#229971',astonmartin:'#229971',rb:'#2B4EE6',racing_bulls:'#2B4EE6',visa_rb:'#2B4EE6',cadillac:'#B8860B'};
  function teamColor(teamId){
   if(TEAM_COLORS[teamId]) return TEAM_COLORS[teamId];
   let h=0; for(const ch of teamId) h=(h*31+ch.charCodeAt(0))>>>0;
   return `hsl(${h%360} 55% 45%)`;
  }

  // Short display names by teamId — f1api.dev's own teamName is the full official sponsor-laden version
  // ("Mercedes Formula 1 Team", "Scuderia Ferrari", "Audi Revolut F1 Team"...), too long for a legend.
  const SHORT_TEAM_NAMES={mercedes:'Mercedes',ferrari:'Ferrari',mclaren:'McLaren',red_bull:'Red Bull',redbull:'Red Bull',
   alpine:'Alpine',haas:'Haas',williams:'Williams',audi:'Audi',sauber:'Audi',
   aston_martin:'Aston Martin',astonmartin:'Aston Martin',rb:'Racing Bulls',racing_bulls:'Racing Bulls',visa_rb:'Racing Bulls',cadillac:'Cadillac'};
  function shortTeamName(teamId, fallback){ return SHORT_TEAM_NAMES[teamId] || fallback || teamId; }

  // Approximate season shape — fallback for when f1api.dev's calendar endpoint isn't available, so total
  // rounds/sprints per year are a lookup rather than fetched. Its keys are also the seasons offered in
  // the season dropdown (controls.js), so add a row here to add a season.
  const SEASON_META={2026:{rounds:23,sprints:6},2025:{rounds:24,sprints:6},2024:{rounds:24,sprints:6},
   2023:{rounds:22,sprints:6},2022:{rounds:22,sprints:3},2021:{rounds:22,sprints:3}};
  function seasonMeta(year){ return SEASON_META[year] || {rounds:24,sprints:6}; }
  const YEARS = Object.keys(SEASON_META).map(Number).sort((a,b)=>b-a); // newest first

  // issue #13 (mobile): the site-wide narrow-screen breakpoint, matching the CSS media queries.
  function isNarrow(){ return window.innerWidth<=600; }

  // Adds transparency to a teamColor()/F1Theme.team() color. A hex alpha suffix would break on the
  // `hsl(H S% L%)` hashed fallback, so each format gets its own valid syntax.
  function withAlpha(color, alpha){
   if(color[0]==='#'){
     const n=parseInt(color.slice(1),16);
     return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`;
   }
   const m=color.match(/^hsl\(([^)]*)\)$/);
   if(m) return `hsl(${m[1]} / ${alpha})`;
   return color; // unrecognized format — leave opaque rather than risk an invalid-CSS color
  }

  // Driver ids ordered by total points in an F1Data.cumulative() result, best first.
  function rankedDriverIds(cum){
   return Object.values(cum.drivers)
     .map(d=>({driverId:d.driverId,total:d.rounds.reduce((s,x)=>s+x.points,0)}))
     .sort((a,b)=>b.total-a.total).map(d=>d.driverId);
  }

  // issue #47: places gained (+) or lost (-) in the standings since the previous round, by id. Ranks use
  // the same points ordering as the pickers. Empty at round 1; an entry missing from the previous
  // round's standings (e.g. a new driver) gets no value.
  function standingsMoves(seasonRounds, round, kind){
   if(round<=1) return {};
   const order = r => Object.values(F1Data.cumulative(seasonRounds, r, 'include')[kind])
     .map(e=>({id: kind==='teams' ? e.teamId : e.driverId, total: e.rounds.reduce((s,x)=>s+x.points,0)}))
     .sort((a,b)=>b.total-a.total).map(e=>e.id);
   const prevPos = {};
   order(round-1).forEach((id,i)=>{ prevPos[id]=i; });
   const moves = {};
   order(round).forEach((id,i)=>{ if(id in prevPos) moves[id]=prevPos[id]-i; });
   return moves;
  }
  // The ▲2 / ▼1 cell in a picker row (always rendered, empty when unchanged, so the points column lines up).
  function moveHTML(delta){
   if(!delta) return '<span class="pickerMove"></span>';
   const n=Math.abs(delta), up=delta>0;
   return `<span class="pickerMove ${up?'up':'down'}" title="${up?'Up':'Down'} ${n} place${n===1?'':'s'} since the previous round">${up?'▲':'▼'}${n}</span>`;
  }

  // One driver row in a picker: checkbox, (rank), team-color dot, full name + code tag, (movement), points.
  function driverPickerRowHTML(d, {rank=null, checked=false, points=0, move=0}={}){
   return `<label class="pickerRow">
     <input type="checkbox" data-id="${d.driverId}" ${checked?'checked':''}>
     ${rank!=null?`<span class="pickerRank">${rank}</span>`:''}
     <span class="pickerDot" style="background:${F1Theme.team(teamColor(d.teamId))}"></span>
     <span class="pickerCode${checked?'':' off'}">${d.name}<span class="pickerCodeTag">${d.code}</span></span>
     ${moveHTML(move)}
     <span class="pickerPts">${Math.round(points)}</span>
   </label>`;
  }

  // Highlights the #presetRow button whose id set exactly matches the current selection (none if no
  // match). `sets` maps each button's data-preset value to its list of ids.
  function markActivePreset(sets, selectedIds){
   const cur = new Set(selectedIds||[]);
   let matched=null;
   for(const [key,ids] of Object.entries(sets)){
     if(cur.size===ids.length && ids.every(id=>cur.has(id))){ matched=key; break; }
   }
   document.querySelectorAll('#presetRow button[data-preset]').forEach(b=>b.classList.toggle('active', b.dataset.preset===matched));
  }

  // Labels the shaded area under the knockout line (drivers + constructors charts). Call from a Chart.js
  // plugin's afterDatasetsDraw with ctx's fill style and font already set. issue #45: centered ~78% of the
  // way along the season (round 18 of 23) but kept inside the plot area, so it isn't clipped on narrow
  // screens or placed off-chart in a short season. issue #46: "below", not "eliminated" — the line is
  // drawn from the highest-ranked *selected* entry, so falling under it doesn't always mean eliminated.
  function drawKnockoutLabel(ch, totalRounds){
   const {ctx,chartArea:a,scales:{x,y}}=ch;
   const text='Below the knockout line', w=ctx.measureText(text).width;
   const cx=Math.min(Math.max(x.getPixelForValue(Math.round((totalRounds-1)*18/22)), a.left+w/2+4), a.right-w/2-4);
   ctx.save();ctx.textAlign='center';ctx.fillText(text,cx,y.getPixelForValue(0)-10);ctx.restore();
  }

  return { TEAM_COLORS, teamColor, SHORT_TEAM_NAMES, shortTeamName, SEASON_META, seasonMeta, YEARS,
    isNarrow, withAlpha, rankedDriverIds, standingsMoves, moveHTML, driverPickerRowHTML, markActivePreset, drawKnockoutLabel };
})();
