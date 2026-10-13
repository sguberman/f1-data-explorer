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

  // issue #9: championship position after every round, for every driver ('drivers') or team ('teams').
  // Ranked by points; ties broken by countback of Grand Prix finishes (most wins, then most second
  // places, ...), which is how the real standings separate equal points. Entries that haven't appeared
  // yet have no position (null) for those rounds. Returns { ids (final standings order), pos: {id: [..]},
  // info: {id: {code, teamId, teamName}} }.
  function standingsByRound(seasonRounds, kind){
   const idOf = res => kind==='teams' ? res.teamId : res.driverId;
   const info={}, pos={}, pts={}, finishes={};
   const countback = (a,b) => {
     const A=finishes[a]||[], B=finishes[b]||[];
     for(let i=0;i<Math.max(A.length,B.length);i++){ const d=(B[i]||0)-(A[i]||0); if(d) return d; }
     return 0;
   };
   seasonRounds.forEach((r,ri)=>{
     [...r.raceResults, ...(r.sprintResults||[])].forEach(res=>{
       const id=idOf(res);
       if(!info[id]){ info[id]={code:res.code, teamId:res.teamId, teamName:res.teamName}; pos[id]=new Array(seasonRounds.length).fill(null); }
       pts[id]=(pts[id]||0)+res.points;
     });
     r.raceResults.forEach(res=>{
       if(!res.position) return;
       const f=finishes[idOf(res)]=finishes[idOf(res)]||[];
       f[res.position-1]=(f[res.position-1]||0)+1;
     });
     Object.keys(pts).sort((a,b)=>pts[b]-pts[a] || countback(a,b)).forEach((id,i)=>{ pos[id][ri]=i+1; });
   });
   const last=seasonRounds.length-1;
   const ids=Object.keys(info).sort((a,b)=>pos[a][last]-pos[b][last]);
   return { ids, pos, info };
  }

  // issue #9: the "Championship position by round" chart on the drivers and constructors pages. Always
  // shows every loaded round (it ignores the as-of-round slider). Each round's position is a flat segment
  // joined to the next round's by an angled line; P1 at the top. Teammates follow the points chart's
  // convention (better-placed driver solid, the other dashed). Returns the new Chart; pass the previous
  // one to replace it.
  function renderPositionChart(canvas, seasonRounds, kind, prevChart){
   if(prevChart) prevChart.destroy();
   if(!seasonRounds.length) return null;
   const {ids, pos, info} = standingsByRound(seasonRounds, kind);
   const N=seasonRounds.length, n=ids.length, P=F1Theme.chart();
   const ff=getComputedStyle(document.body).fontFamily;
   const label = id => kind==='teams' ? shortTeamName(id, info[id].teamName) : info[id].code;
   const HALF=0.28; // half-width of each round's flat segment, in rounds
   const leadSeen={};
   const ds = ids.map(id=>{
     const data=[];
     pos[id].forEach((p,i)=>{ const r=i+1; if(p==null) data.push({x:r,y:null}); else data.push({x:r-HALF,y:p},{x:r+HALF,y:p}); });
     const t=info[id].teamId, dash = kind==='drivers' && leadSeen[t] ? [5,3] : [];
     leadSeen[t]=true;
     const c=F1Theme.team(teamColor(t));
     return {data, borderColor:c, borderDash:dash, borderWidth:2, tension:0, pointRadius:0, spanGaps:false,
       label:label(id), fin:pos[id][N-1]};
   });
   canvas.parentElement.style.height = (n*(isNarrow()?20:22)+50)+'px';
   const font='600 11px '+ff;
   const mc=document.createElement('canvas').getContext('2d'); mc.font=font;
   const PR=Math.ceil(Math.max(...ds.map(d=>mc.measureText(d.label).width)))+12;
   const ends={id:'posEnds',afterDatasetsDraw(ch){
     const {ctx,chartArea:a,scales:{y}}=ch; ctx.save(); ctx.font=font; ctx.textBaseline='middle';
     ds.forEach(d=>{ ctx.fillStyle=d.borderColor; ctx.fillText(d.label, a.right+6, y.getPixelForValue(d.fin)); });
     ctx.restore();
   }};
   return new Chart(canvas, {type:'line', data:{datasets:ds}, plugins:[ends],
     options:{responsive:true, maintainAspectRatio:false, animation:false, parsing:false,
       layout:{padding:{right:PR, top:4}}, plugins:{legend:{display:false}, tooltip:{enabled:false}},
       scales:{
         x:{type:'linear', min:0.5, max:N+0.5, grid:{color:P.grid},
            ticks:{color:P.text, autoSkip:false, maxRotation:0, callback:v=>(!isNarrow()||v%2===1)?v:''},
            afterBuildTicks:ax=>{ ax.ticks=Array.from({length:N},(_,i)=>({value:i+1})); },
            title:{display:true, text:'Round', color:P.text}},
         y:{type:'linear', reverse:true, min:0.5, max:n+0.5, grid:{display:false},
            ticks:{color:P.text, autoSkip:false, callback:v=>'P'+v},
            afterBuildTicks:ax=>{ ax.ticks=Array.from({length:n},(_,i)=>({value:i+1})); }}}}});
  }

  return { TEAM_COLORS, teamColor, SHORT_TEAM_NAMES, shortTeamName, SEASON_META, seasonMeta, YEARS,
    isNarrow, withAlpha, rankedDriverIds, standingsMoves, moveHTML, driverPickerRowHTML, markActivePreset, drawKnockoutLabel,
    standingsByRound, renderPositionChart };
})();
