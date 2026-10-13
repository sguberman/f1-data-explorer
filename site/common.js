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

  // issue #10: what the points chart's projection would have said after each round, using only the results
  // available then — the same math as the chart: points so far + (average points over the last 5 rounds
  // the entry took part in) x rounds left in the season (totalRounds). Projected position ranks every
  // entry by that projection (ties: current standings). Returns { ids (latest projected order),
  // pts: {id: [..]}, pos: {id: [..]}, info } with null before an entry's first round.
  function projectionsByRound(seasonRounds, kind, totalRounds){
   const actual = standingsByRound(seasonRounds, kind), M=seasonRounds.length;
   const pts={}, pos={};
   actual.ids.forEach(id=>{ pts[id]=new Array(M).fill(null); pos[id]=new Array(M).fill(null); });
   for(let k=1;k<=M;k++){
     const N=Math.max(totalRounds, k);
     const rows = Object.values(F1Data.cumulative(seasonRounds, k, 'include')[kind]).map(e=>{
       const id = kind==='teams' ? e.teamId : e.driverId;
       const w = Array.from({length:k},(_,ri)=>e.rounds.filter(x=>x.round===ri+1).reduce((s,x)=>s+x.points,0));
       const total = w.reduce((a,b)=>a+b,0);
       const last5 = [...new Set(e.rounds.map(x=>x.round))].sort((a,b)=>a-b).slice(-5);
       const rate = last5.length ? last5.reduce((s,r)=>s+w[r-1],0)/last5.length : 0;
       return {id, proj: total + rate*(N-k), now: actual.pos[id][k-1]};
     });
     rows.sort((a,b)=>b.proj-a.proj || a.now-b.now).forEach((r,i)=>{ pts[r.id][k-1]=r.proj; pos[r.id][k-1]=i+1; });
   }
   const ids = actual.ids.slice().sort((a,b)=>pos[a][M-1]-pos[b][M-1]);
   return { ids, pts, pos, info: actual.info };
  }

  // Teammate dash pattern, given ids in display order: first of each team solid, the next dashed
  // (drivers only) — the points chart's convention.
  function teammateDashes(ids, info, kind){
   const seen={}, dash={};
   ids.forEach(id=>{ const t=info[id].teamId; dash[id] = kind==='drivers' && seen[t] ? [5,3] : []; seen[t]=true; });
   return dash;
  }

  // issue #9: the "Championship position by round" chart on the drivers and constructors pages. Always
  // shows every loaded round (it ignores the as-of-round slider). Each round's position is a flat segment
  // joined to the next round's by an angled line; P1 at the top. Teammates follow the points chart's
  // convention (better-placed driver solid, the other dashed). Returns the new Chart; pass the previous
  // one to replace it. issue #10: with {projected:true, totalRounds} it plots the projected final standings
  // after each round (projectionsByRound) instead of the actual standings.
  function renderPositionChart(canvas, seasonRounds, kind, prevChart, {projected=false, totalRounds=0}={}){
   if(prevChart) prevChart.destroy();
   if(!seasonRounds.length) return null;
   const {ids, pos, info} = projected ? projectionsByRound(seasonRounds, kind, totalRounds) : standingsByRound(seasonRounds, kind);
   const N=seasonRounds.length, n=ids.length, P=F1Theme.chart();
   const ff=getComputedStyle(document.body).fontFamily;
   const label = id => kind==='teams' ? shortTeamName(id, info[id].teamName) : info[id].code;
   const HALF=0.28; // half-width of each round's flat segment, in rounds
   const dash = teammateDashes(ids, info, kind);
   const ds = ids.map(id=>{
     const data=[];
     pos[id].forEach((p,i)=>{ const r=i+1; if(p==null) data.push({x:r,y:null}); else data.push({x:r-HALF,y:p},{x:r+HALF,y:p}); });
     const c=F1Theme.team(teamColor(info[id].teamId));
     return {data, borderColor:c, borderDash:dash[id], borderWidth:2, tension:0, pointRadius:0, spanGaps:false,
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
            title:{display:true, text:projected?'After round':'Round', color:P.text}},
         y:{type:'linear', reverse:true, min:0.5, max:n+0.5, grid:{display:false},
            ticks:{color:P.text, autoSkip:false, callback:v=>'P'+v},
            afterBuildTicks:ax=>{ ax.ticks=Array.from({length:n},(_,i)=>({value:i+1})); }}}}});
  }

  // issue #10: "Projected final points" chart — the projected season total after each round for the given
  // ids (the page's picker selection). End-of-line labels on wide screens; on narrow screens a ranked list
  // is written into legendEl instead (shown by the .endLegend CSS), like the points chart. `proj` is a
  // projectionsByRound() result, so a page can compute it once per season and redraw cheaply.
  function renderProjectedPointsChart(canvas, legendEl, proj, kind, ids, prevChart){
   if(prevChart) prevChart.destroy();
   legendEl.innerHTML='';
   if(!proj || !proj.ids.length) return null;
   const M = proj.pts[proj.ids[0]].length, P=F1Theme.chart(), narrow=isNarrow();
   const ff=getComputedStyle(document.body).fontFamily, font='600 11px '+ff;
   const label = id => kind==='teams' ? shortTeamName(id, proj.info[id].teamName) : proj.info[id].code;
   const shown = ids.filter(id=>proj.pts[id]).sort((a,b)=>proj.pts[b][M-1]-proj.pts[a][M-1]);
   const dash = teammateDashes(shown, proj.info, kind);
   const ds = shown.map(id=>{
     const c=F1Theme.team(teamColor(proj.info[id].teamId)), fin=proj.pts[id][M-1];
     return {data:proj.pts[id].map((v,i)=>({x:i+1, y:v==null?null:Math.round(v)})), borderColor:c, backgroundColor:c,
       borderDash:dash[id], borderWidth:2, pointRadius:2.5, tension:0, spanGaps:false, name:label(id), fin};
   });
   canvas.parentElement.style.height = (narrow?320:380)+'px';
   const mc=document.createElement('canvas').getContext('2d'); mc.font=font;
   const PR = narrow || !ds.length ? 10 : Math.ceil(Math.max(...ds.map(d=>mc.measureText(d.name+' '+Math.round(d.fin)).width)))+12;
   const ends={id:'projEnds',afterDatasetsDraw(ch){
     if(narrow) return;
     const {ctx,chartArea:a,scales:{y}}=ch; ctx.save(); ctx.font=font; ctx.textBaseline='middle';
     const it=ds.map(d=>({d, y:y.getPixelForValue(Math.round(d.fin))})).sort((p,q)=>p.y-q.y);
     for(let i=1;i<it.length;i++) if(it[i].y-it[i-1].y<13) it[i].y=it[i-1].y+13;
     it.forEach(o=>{ ctx.fillStyle=o.d.borderColor; ctx.fillText(o.d.name+' '+Math.round(o.d.fin), a.right+6, o.y); });
     ctx.restore();
   }};
   legendEl.innerHTML = ds.map((d,i)=>`<div class="endLegendRow"><span class="endLegendRank">${i+1}</span>`
     +`<span class="endLegendDot" style="background:${d.borderColor}"></span><span class="endLegendName">${d.name}</span>`
     +`<span class="endLegendPts">${Math.round(d.fin)}</span></div>`).join('');
   return new Chart(canvas, {type:'line', data:{datasets:ds}, plugins:[ends],
     options:{responsive:true, maintainAspectRatio:false, animation:false, parsing:false,
       layout:{padding:{right:PR, top:4}}, plugins:{legend:{display:false}, tooltip:{enabled:false}},
       scales:{
         x:{type:'linear', min:1, max:Math.max(M,2), grid:{color:P.grid},
            ticks:{color:P.text, stepSize:1, autoSkip:false, maxRotation:0, callback:v=>(!narrow||v%2===1)?v:''},
            title:{display:true, text:'After round', color:P.text}},
         y:{grid:{color:P.grid}, ticks:{color:P.text}, title:{display:true, text:'Projected final points', color:P.text}}}}});
  }

  return { TEAM_COLORS, teamColor, SHORT_TEAM_NAMES, shortTeamName, SEASON_META, seasonMeta, YEARS,
    isNarrow, withAlpha, rankedDriverIds, standingsMoves, moveHTML, driverPickerRowHTML, markActivePreset,
    standingsByRound, renderPositionChart, projectionsByRound, renderProjectedPointsChart };
})();
