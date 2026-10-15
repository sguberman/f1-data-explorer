/* F1Common — helpers shared by every chart page (issue #44). These used to be copied into each page's
   inline <script>; keep page-specific logic in the pages and only move something here once it's
   genuinely identical across them. Load after theme.js (uses F1Theme) and before controls.js. */
const F1Common = (() => {
  // Team colors by f1api.dev teamId. Unlisted teams get a stable hashed color instead of breaking.
  const TEAM_COLORS={mercedes:'#00A79D',ferrari:'#DC0000',mclaren:'#FF8000',red_bull:'#1B2A6B',redbull:'#1B2A6B',
   alpine:'#FF1493',haas:'#1A1A1A',williams:'#00A3E0',audi:'#E8534D',sauber:'#E8534D',
   aston_martin:'#229971',astonmartin:'#229971',rb:'#2B4EE6',racing_bulls:'#2B4EE6',visa_rb:'#2B4EE6',cadillac:'#B8860B'};
  // #72: teams that only raced in earlier seasons get that season's real colour (F1's official team colour,
  // via FastF1's per-season table), darkened where needed to read on the light background; theme.js lightens
  // them for dark mode. Every other team keeps its one colour above for all seasons.
  const SEASON_TEAM_COLORS={
   alfa:{2021:'#900000',2022:'#B12039',2023:'#C92D4B'},          // Alfa Romeo
   alphatauri:{2021:'#2B4562',2022:'#4E7C9B',2023:'#5E8FAA'},    // AlphaTauri
   sauber:{2024:'#399E39',2025:'#399E39'}};                      // Kick Sauber (neon green #52E252)
  let season=null; // the season being shown, set by F1Controls when a season loads
  function setSeason(year){ season=year; }
  function teamColor(teamId){
   const bySeason=SEASON_TEAM_COLORS[teamId];
   if(bySeason) return bySeason[season] || Object.values(bySeason).pop();
   if(TEAM_COLORS[teamId]) return TEAM_COLORS[teamId];
   let h=0; for(const ch of teamId) h=(h*31+ch.charCodeAt(0))>>>0;
   return `hsl(${h%360} 55% 45%)`;
  }

  // Short display names by teamId — f1api.dev's own teamName is the full official sponsor-laden version
  // ("Mercedes Formula 1 Team", "Scuderia Ferrari", "Audi Revolut F1 Team"...), too long for a legend.
  const SHORT_TEAM_NAMES={mercedes:'Mercedes',ferrari:'Ferrari',mclaren:'McLaren',red_bull:'Red Bull',redbull:'Red Bull',
   alpine:'Alpine',haas:'Haas',williams:'Williams',audi:'Audi',sauber:'Sauber',alfa:'Alfa Romeo',alphatauri:'AlphaTauri',
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

  // ---- #18: national flags and driver numbers ----
  // f1api.dev gives nationalities and circuit countries as names; it isn't consistent about country name vs
  // demonym, so both map to the flag file in site/flags/ (ISO 3166 code). Unknown names get no flag.
  const FLAG_CODES={};
  [['ae','united arab emirates uae abu dhabi emirati'],['ar','argentina argentine argentinian'],['at','austria austrian'],
   ['au','australia australian'],['az','azerbaijan azerbaijani azeri baku'],['be','belgium belgian'],['bh','bahrain bahraini'],
   ['br','brazil brazilian'],['ca','canada canadian'],['ch','switzerland swiss'],['cn','china chinese'],['de','germany german'],
   ['dk','denmark danish dane'],['es','spain spanish spaniard'],['fi','finland finnish finn'],['fr','france french'],
   ['gb','great britain united kingdom uk england british english scottish welsh britain'],['hu','hungary hungarian'],
   ['in','india indian'],['it','italy italian'],['jp','japan japanese'],['mc','monaco monegasque monégasque'],
   ['mx','mexico mexican'],['nl','netherlands dutch holland'],['nz','new zealand new zealander kiwi'],['pl','poland polish'],
   ['pt','portugal portuguese'],['qa','qatar qatari'],['ru','russia russian'],['sa','saudi arabia saudi'],
   ['sg','singapore singaporean'],['th','thailand thai'],['tr','turkey türkiye turkish'],['us','united states usa us american america']
  ].forEach(([code,names])=>{
    FLAG_CODES[code]=code;
    // multi-word names first ("united states", "saudi arabia"), then each single word
    ['united arab emirates','abu dhabi','great britain','united kingdom','new zealand','new zealander','saudi arabia','united states']
      .filter(n=>names.includes(n)).forEach(n=>{ FLAG_CODES[n]=code; });
    names.split(' ').forEach(n=>{ if(!['united','great','new','saudi','arab','emirates','abu','dhabi','zealand','zealander','kingdom','states','arabia'].includes(n)) FLAG_CODES[n]=code; });
  });
  function flagCode(name){
    if(!name) return null;
    const k=String(name).trim().toLowerCase();
    return FLAG_CODES[k] || null;
  }
  const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  // A small flag <img> for HTML (pickers, legends, lists, round label); '' when the name is unknown.
  function flagHTML(name){
    const c=flagCode(name);
    return c ? `<img class="flag" src="flags/${c}.svg" alt="" title="${escAttr(name)}" width="16" height="12">` : '';
  }
  // Canvas labels: flags are drawn as images, loaded once. A flag that finishes loading after a chart
  // was drawn redraws every chart, so it appears without waiting for the next interaction.
  const FLAG_W=16, FLAG_H=12, FLAG_GAP=5, FLAG_ROOM=FLAG_W+FLAG_GAP, flagImgs={};
  let redrawQueued=false;
  function flagImage(code){
    if(!flagImgs[code]){
      const img=new Image();
      img.onload=()=>{ if(redrawQueued || typeof Chart==='undefined') return; redrawQueued=true;
        requestAnimationFrame(()=>{ redrawQueued=false; Object.values(Chart.instances).forEach(c=>c.draw()); }); };
      img.src=`flags/${code}.svg`;
      flagImgs[code]=img;
    }
    return flagImgs[code];
  }
  // Space to leave for flags in a group of canvas labels: FLAG_ROOM if any of them has a flag (so labels
  // without one still line up with the rest), else 0.
  function flagSpace(names){ return names.some(flagCode) ? FLAG_ROOM : 0; }
  // Draws the flag (if the name has one) with its left edge at x, vertically centred on cy.
  function drawFlag(ctx, name, x, cy){
    const c=flagCode(name); if(!c) return;
    const img=flagImage(c);
    if(img.complete && img.naturalWidth){
      ctx.save();
      ctx.drawImage(img, x, Math.round(cy-FLAG_H/2), FLAG_W, FLAG_H);
      ctx.strokeStyle='rgba(128,128,128,.35)'; ctx.lineWidth=1;
      ctx.strokeRect(x+0.5, Math.round(cy-FLAG_H/2)+0.5, FLAG_W-1, FLAG_H-1);
      ctx.restore();
    }
  }
  // Nationality / number lookups by id for the loaded season (people() is filled by controls.js on load),
  // so charts can find a flag from just a driver or team id.
  const people={drivers:{}, teams:{}};
  function indexPeople(seasonRounds){
    people.drivers={}; people.teams={};
    seasonRounds.forEach(r=>[...r.raceResults, ...(r.sprintResults||[])].forEach(res=>{
      // the latest round wins, so a mid-season change (rare) shows the current value
      people.drivers[res.driverId]={nationality:res.nationality||null, number:res.number!=null?res.number:null};
      people.teams[res.teamId]={nationality:res.teamNationality||null};
    }));
  }
  const nationalityOf = (kind, id) => ((kind==='teams' ? people.teams : people.drivers)[id] || {}).nationality || null;
  const numberOf = id => (people.drivers[id] || {}).number ?? null;
  // Ridge charts (position page, simulator): a flag left of each row's label. rowId(i) gives the driver id
  // drawn on y-axis row i (row 0 = bottom). The chart's y scale needs afterFit: s=>{ s.width+=FLAG_ROOM; }.
  function ridgeFlags(rowId){
    return {
      id:'ridgeFlags',
      afterDraw(chart){
        const ys=chart.scales.y, ctx=chart.ctx;
        ctx.save();
        const f=ys.options.ticks.font; ctx.font=`${f.weight||''} ${f.size||Chart.defaults.font.size}px ${f.family||Chart.defaults.font.family}`;
        // place each flag just left of where Chart.js actually drew that tick's (right-aligned) label
        ys.getLabelItems(chart.chartArea).forEach((item,i)=>{
          const t=ys.ticks[i]; if(!t) return;
          const id=rowId(Math.round(t.value)); if(!id) return;
          const w=ctx.measureText(String(item.label||'')).width, [tx,ty]=item.options.translation;
          drawFlag(ctx, nationalityOf('drivers', id), tx-w-FLAG_GAP-FLAG_W, ty);
        });
        ctx.restore();
      }
    };
  }

  // #30: "most common" (mode) markers on a ridgeline chart. Each ridge dataset can carry _modes (category
  // indexes of its most common value, every one if tied) and _modeLabels ({index: text}, e.g. the points
  // total, or the real position when it falls in a grouped bucket like "11+/DNF"). Each mode is a small
  // triangle just above the curve, with its label (if any) above that.
  function ridgeMarkers(){
    return {
      id:'ridgeMarkers',
      afterDatasetsDraw(chart){
        const {ctx, chartArea:area, scales:{x}}=chart, ring=F1Theme.chart().pointRing;
        const ff=getComputedStyle(document.body).fontFamily;
        chart.data.datasets.forEach((ds,di)=>{
          if(ds._baseline || !(ds._modes||[]).length) return;
          const pts=chart.getDatasetMeta(di).data;
          ctx.save();
          ds._modes.forEach(i=>{
            const px=x.getPixelForValue(i), top=pts[i].y-3;
            ctx.fillStyle=ds.borderColor; ctx.strokeStyle=ring; ctx.lineWidth=1.5;
            ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px-5, top-8); ctx.lineTo(px+5, top-8); ctx.closePath();
            ctx.fill(); ctx.stroke();
            const text=(ds._modeLabels||{})[i];
            if(text){
              ctx.font='600 10.5px '+ff; ctx.textBaseline='bottom';
              const w=ctx.measureText(text).width;
              // keep the label inside the plot: centred, or pulled in at either edge
              ctx.textAlign = px+w/2>area.right+4 ? 'right' : px-w/2<area.left-4 ? 'left' : 'center';
              const tx = ctx.textAlign==='right' ? px+5 : ctx.textAlign==='left' ? px-5 : px;
              ctx.lineWidth=3; ctx.strokeText(text, tx, top-10); ctx.fillText(text, tx, top-10);
            }
          });
          ctx.restore();
        });
      }
    };
  }
  // The key under a ridgeline chart for the markers above.
  function ridgeKeyHTML(text){
    return `<span class="ridgeKeyItem"><i class="ridgeKeyMode"></i>${text||'most common'}</span>`;
  }

  // #20: everyone's standings order through `round`, the same ranking as the championship-position
  // chart (points, ties broken by countback of Grand Prix finishes). Pickers, ▲/▼ arrows and presets use it.
  function standingsOrder(seasonRounds, round, kind){
   const upto=seasonRounds.filter(r=>r.round<=round);
   return upto.length ? standingsByRound(upto, kind).ids : [];
  }
  function standingsRank(seasonRounds, round, kind){
   const rank={}; standingsOrder(seasonRounds, round, kind).forEach((id,i)=>{ rank[id]=i; }); return rank;
  }

  // issue #47: places gained (+) or lost (-) in the standings since the previous round, by id. Ranks use
  // the same ordering as the pickers (standingsOrder, #20). Empty at round 1; an entry missing from the
  // previous round's standings (e.g. a new driver) gets no value.
  function standingsMoves(seasonRounds, round, kind){
   if(round<=1) return {};
   const order = r => standingsOrder(seasonRounds, r, kind);
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

  // One driver row in a picker: checkbox, (rank), team-color dot, flag + number + full name + code tag (#18),
  // (movement), points.
  function driverPickerRowHTML(d, {rank=null, checked=false, points=0, move=0}={}){
   const num=numberOf(d.driverId);
   return `<label class="pickerRow">
     <input type="checkbox" data-id="${d.driverId}" ${checked?'checked':''}>
     ${rank!=null?`<span class="pickerRank">${rank}</span>`:''}
     <span class="pickerDot" style="background:${F1Theme.team(teamColor(d.teamId))}"></span>
     <span class="pickerCode${checked?'':' off'}">${flagHTML(nationalityOf('drivers', d.driverId))}<span class="pickerNum">${num!=null?num:''}</span>${d.name}<span class="pickerCodeTag">${d.code}</span></span>
     ${moveHTML(move)}
     <span class="pickerPts">${Math.round(points)}</span>
   </label>`;
  }

  // A team heading in the driver pickers' "by team" view. Just the name: team flags are kept for constructor
  // views only (#70).
  function pickerTeamLabelHTML(teamId, teamName){
   return `<div class="pickerTeamLabel">${teamName||teamId}</div>`;
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
     const rows = Object.values(F1Data.cumulative(seasonRounds, k)[kind]).map(e=>{
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
       label:label(id), nat:nationalityOf(kind, id), fin:pos[id][N-1], _vals:pos[id]}; // _vals: for CSV export (#33)
   });
   canvas.parentElement.style.height = (n*(isNarrow()?20:22)+50)+'px';
   const font='600 11px '+ff;
   const mc=document.createElement('canvas').getContext('2d'); mc.font=font;
   const fw=flagSpace(ds.map(d=>d.nat));
   const PR=Math.ceil(Math.max(...ds.map(d=>mc.measureText(d.label).width)))+fw+12;
   const ends={id:'posEnds',afterDatasetsDraw(ch){
     const {ctx,chartArea:a,scales:{y}}=ch; ctx.save(); ctx.font=font; ctx.textBaseline='middle';
     ds.forEach(d=>{ const cy=y.getPixelForValue(d.fin); drawFlag(ctx, d.nat, a.right+6, cy); ctx.fillStyle=d.borderColor; ctx.fillText(d.label, a.right+6+fw, cy); });
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
       borderDash:dash[id], borderWidth:2, pointRadius:2.5, tension:0, spanGaps:false, name:label(id), nat:nationalityOf(kind, id), fin};
   });
   canvas.parentElement.style.height = (narrow?320:380)+'px';
   const mc=document.createElement('canvas').getContext('2d'); mc.font=font;
   const fw=flagSpace(ds.map(d=>d.nat));
   const PR = narrow || !ds.length ? 10 : Math.ceil(Math.max(...ds.map(d=>mc.measureText(d.name+' '+Math.round(d.fin)).width)))+fw+12;
   const ends={id:'projEnds',afterDatasetsDraw(ch){
     if(narrow) return;
     const {ctx,chartArea:a,scales:{y}}=ch; ctx.save(); ctx.font=font; ctx.textBaseline='middle';
     const it=ds.map(d=>({d, y:y.getPixelForValue(Math.round(d.fin))})).sort((p,q)=>p.y-q.y);
     for(let i=1;i<it.length;i++) if(it[i].y-it[i-1].y<13) it[i].y=it[i-1].y+13;
     it.forEach(o=>{ drawFlag(ctx, o.d.nat, a.right+6, o.y); ctx.fillStyle=o.d.borderColor; ctx.fillText(o.d.name+' '+Math.round(o.d.fin), a.right+6+fw, o.y); });
     ctx.restore();
   }};
   legendEl.innerHTML = ds.map((d,i)=>`<div class="endLegendRow"><span class="endLegendRank">${i+1}</span>`
     +`<span class="endLegendDot" style="background:${d.borderColor}"></span><span class="endLegendName">${flagHTML(d.nat)}${d.name}</span>`
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

  // ---- #85 (version A): title clinch calculator for the championship pages ----
  // The most one entry can score in a weekend, by season: a Grand Prix win (plus the fastest-lap point,
  // 2019–2024) and a sprint win (3-2-1 sprints in 2021). Teams: both cars first and second. This is the
  // season's real maximum, so "clinched" is only said when it's certain (the knockout line keeps its 25/8).
  function maxWeekendPoints(year, kind){
   const fl = year>=2019 && year<=2024 ? 1 : 0, sp = year===2021 ? [3,2,1] : [8,7,6,5,4,3,2,1];
   return kind==='teams' ? {gp:25+18+fl, sprint:sp[0]+sp[1]} : {gp:25+fl, sprint:sp[0], fl, gpPts:[25,18,15,12,10,8,6,4,2,1], spPts:sp};
  }
  // The title race as of `round`, for the whole field (not just the picked entries). Pure: no DOM, no fetch.
  // opts: {year, calendar} (calendar = F1Data.getCalendar's result, or null to estimate from SEASON_META).
  // Returns {state, ...}:
  //   'none'     no results yet
  //   'decided'  {champion, clinched (round), over (season finished), tieWith (level on points, ahead on countback)}
  //   'next'     {next, final, lead:[{id, conds:[{id, need}], example}], ...} — someone can clinch at the next race:
  //              `need` = the fewest points they must outscore that rival by (≤ 0: may lose up to -need to them)
  //   'later'    {earliest, leader, second, gap} — the first round the title could be decided at all
  // Margins are strict: one point fewer could leave them level on points, which countback would decide.
  function titleRace(seasonRounds, round, kind, {year, calendar=null}={}){
   const rounds = seasonRounds.filter(r=>r.round<=round).sort((a,b)=>a.round-b.round);
   if(!rounds.length) return {state:'none'};
   const L = round, cal = calendar && calendar.totalRounds>0 ? calendar : null, meta = seasonMeta(year);
   const loadedMax = Math.max(...seasonRounds.map(r=>r.round));
   const N = cal ? Math.max(cal.totalRounds, L) : Math.max(meta.rounds, L);
   const W = maxWeekendPoints(year, kind);
   // Sprint weekends: the calendar's; without it, the loaded rounds' plus the season's estimated remaining sprints
   // placed straight after them (the most points still available at every round, so "clinched" stays safe).
   const isSprint = {};
   if(cal) (cal.sprintRounds||[]).forEach(r=>{ isSprint[r]=true; });
   else {
     seasonRounds.forEach(r=>{ if(r.sprintResults && r.sprintResults.length) isSprint[r.round]=true; });
     let left = Math.max(0, meta.sprints - Object.keys(isSprint).length);
     for(let r=loadedMax+1; r<=N && left>0; r++, left--) isSprint[r]=true;
   }
   const per = r => W.gp + (isSprint[r] ? W.sprint : 0);    // most one entry can score in round r
   const left = k => { let s=0; for(let r=k+1;r<=N;r++) s+=per(r); return s; }; // still available after round k
   const idOf = res => kind==='teams' ? res.teamId : res.driverId;
   // Points and Grand Prix finishes (countback) after each round.
   const pts={}, fin={}, after=[];
   rounds.forEach(r=>{
     [...r.raceResults, ...(r.sprintResults||[])].forEach(res=>{ const id=idOf(res); pts[id]=(pts[id]||0)+res.points; });
     r.raceResults.forEach(res=>{ if(res.position>=1){ const f=fin[idOf(res)]=fin[idOf(res)]||[]; f[res.position-1]=(f[res.position-1]||0)+1; } });
     after.push({round:r.round, pts:{...pts}, fin:Object.fromEntries(Object.entries(fin).map(([k,v])=>[k,v.slice()]))});
   });
   const order = k => standingsOrder(seasonRounds, k, kind);
   // Is `a` certain to stay ahead of `x` after round k? Only a lead bigger than the points left, or equal to it when
   // even then countback is already settled: x would have to win every Grand Prix left (teams: finish 1-2) while a
   // scores nothing, so a must be ahead on wins..10th places with x's extra results added.
   function safe(snap, a, x, k){
     const d=(snap.pts[a]||0)-(snap.pts[x]||0), M=left(k);
     if(d>M) return true;
     if(d<M) return false;
     if(M===0) return true; // season over and level: the standings order already applied countback
     const g = Math.max(0, N-k), A=(snap.fin[a]||[]).slice(), X=(snap.fin[x]||[]).slice();
     X[0]=(X[0]||0)+g; if(kind==='teams') X[1]=(X[1]||0)+g;
     for(let i=0;i<10;i++){ const diff=(A[i]||0)-(X[i]||0); if(diff) return diff>0; }
     return false;
   }
   const clinchedAt = k => { const snap=after.find(s=>s.round===k); if(!snap) return null;
     if(k>=N) return order(k)[0]; // the last round: the standings leader is champion
     const ids=order(k), a=ids[0]; return ids.slice(1).every(x=>safe(snap,a,x,k)) ? a : null; };
   for(const s of after){
     const champ = clinchedAt(s.round);
     if(champ){
       const ids=order(L), sec=ids[1], snap=after[after.length-1];
       const tieWith = s.round>=N && sec && snap.pts[champ]===snap.pts[sec] ? sec : null;
       return {state:'decided', champion:champ, clinched:s.round, over:L>=N, total:N, final:s.round>=N, tieWith, left:N-s.round};
     }
   }
   // Not decided yet. Who could clinch at the next race, and on what terms?
   const snap = after[after.length-1], ids = order(L), n = L+1, Mn = left(n), maxNext = per(n);
   const P = id => snap.pts[id]||0;
   const alive = ids.filter(id => P(id) + left(L) >= P(ids[0]));
   const lead = [];
   alive.forEach(c=>{
     const conds = ids.filter(x=>x!==c).map(x=>({id:x, need: Mn - (P(c)-P(x)) + 1})).filter(o=>o.need > -maxNext);
     if(conds.every(o=>o.need<=maxNext)) lead.push({id:c, conds, example: kind==='drivers' ? positionExample(conds, isSprint[n]) : null});
   });
   const base = {leader:ids[0], second:ids[1]||null, gap: ids[1] ? P(ids[0])-P(ids[1]) : null, total:N, sprintNext:!!isSprint[n]};
   if(lead.length) return {state:'next', next:n, final:n>=N, lead, ...base};
   // Earliest round anyone could clinch: they score the most possible from the next race on, everyone else nothing.
   // A tie on points counts as possible here, so the round given is never later than the real earliest.
   let earliest=N;
   for(let r=n, S=0; r<=N; r++){
     S+=per(r);
     if(alive.some(c=>ids.every(x=>x===c || P(c)-P(x)+S >= left(r)))){ earliest=r; break; }
   }
   return {state:'later', earliest, ...base};

   // Drivers: a finishing-position example for the clinch — a win (both races on a sprint weekend) with each rival no
   // higher than the place that keeps the margin. Rivals are assumed to get the fastest-lap point where there is one.
   function positionExample(conds, sprint){
     const mine = W.gpPts[0] + (sprint ? W.spPts[0] : 0);
     const theirs = q => W.gpPts[q-1] + (sprint ? (W.spPts[q-1]||0) : 0) + W.fl; // rival in place q in both
     const out=[];
     for(const o of conds){
       const allow = mine - o.need;              // most the rival may score
       if(allow < 0) return null;                // a win isn't enough on its own
       if(theirs(2) <= allow) continue;          // even second place is fine
       if(sprint){ out.push({id:o.id, maxPts:allow}); continue; }
       let q=2; while(q<=10 && W.gpPts[q-1] + W.fl > allow) q++;
       out.push({id:o.id, place: q<=10 ? q : null}); // null: outside the points
     }
     return {sprint:!!sprint, rivals:out};
   }
  }

  // #85: the "Title race" line under the points chart (both championship pages), written into `el`.
  function renderTitleRace(el, seasonRounds, round, kind, {year, calendar=null}={}){
   const tr = titleRace(seasonRounds, round, kind, {year, calendar});
   el.dataset.state = tr.state;
   if(tr.state==='none'){ el.hidden=true; el.innerHTML=''; return tr; }
   el.hidden=false;
   const info = standingsByRound(seasonRounds.filter(r=>r.round<=round), kind).info;
   const nm = id => { const i=info[id]||{}; const label = kind==='teams' ? shortTeamName(id, i.teamName) : (i.code||id);
     return `<span class="trName">${flagHTML(nationalityOf(kind, id))}${label}</span>`; };
   const names = calendar && calendar.raceNames || {};
   const raceName = r => { const n=names[r] || (seasonRounds.find(x=>x.round===r)||{}).raceName;
     const s = n ? String(n).replace(/ Grand Prix.*/i,'').replace(String(year),'').trim() : '';
     return s && !/^Round \d+$/i.test(s) ? s : ''; };
   const raceOf = r => raceName(r) ? ` (${raceName(r)} GP)` : ''; // "Austrian GP", not just "Austrian"
   const pl = (n, w) => `${n} ${w}${n===1?'':'s'}`;
   const list = a => a.length>1 ? a.slice(0,-1).join(', ')+' and '+a[a.length-1] : a[0]||'';
   // " by outscoring NOR by 12 or more and PIA by 3 or more, unless LEC outscores VER by 5 or more"
   const terms = (c, conds) => {
     const pos = conds.filter(o=>o.need>0), zero = conds.filter(o=>o.need===0), neg = conds.filter(o=>o.need<0);
     const by=[];
     if(pos.length) by.push('outscoring '+list(pos.map(o=>`${nm(o.id)} by ${o.need} or more`)));
     if(zero.length) by.push('scoring at least as many points as '+list(zero.map(o=>nm(o.id))));
     const unless = neg.map(o=>`${nm(o.id)} outscores ${nm(c)} by ${1-o.need} or more`).join(', or ');
     return (by.length ? ' by '+list(by) : '') + (unless ? (by.length ? ', unless ' : ' unless ')+unless : '');
   };
   let main='', note='';
   if(tr.state==='decided'){
     const where = tr.final ? `in the final round${raceOf(tr.clinched)}` : `in round ${tr.clinched}${raceOf(tr.clinched)}`;
     main = tr.over ? `<b>${nm(tr.champion)} is the ${year} champion</b>: clinched ${where}`
                    : `<b>${nm(tr.champion)} is champion</b>: clinched ${where}`;
     if(!tr.over && tr.left>0) main += `, with ${pl(tr.left,'round')} to spare`;
     main += tr.tieWith ? `, level on points with ${nm(tr.tieWith)} and ahead on countback.` : '.';
   } else if(tr.state==='next'){
     const at = `in round ${tr.next}${raceOf(tr.next)}${tr.final?', the final round,':''}`;
     const [first, ...others] = tr.lead;
     main = `<b>${nm(first.id)} clinches the title ${at}</b>${terms(first.id, first.conds)}.`;
     const ex = first.example;
     if(ex){
       const what = ex.sprint ? 'Winning the sprint and the Grand Prix' : 'A win';
       if(!ex.rivals.length) main += ` ${what} would do it, whatever the others do.`;
       else main += ` For example, ${ex.sprint?'winning both':'a win'} with ${list(ex.rivals.map(r => ex.sprint
         ? `${nm(r.id)} on ${pl(r.maxPts,'point')} or fewer for the weekend`
         : r.place ? `${nm(r.id)} P${r.place} or lower` : `${nm(r.id)} outside the points`))}.`;
     }
     others.slice(0,2).forEach(o=>{ main += ` ${nm(o.id)} can also clinch it there${terms(o.id, o.conds)}.`; });
     if(others.length>2) main += ` ${others.length-2} more can still clinch it there.`;
     note = 'One point less could leave them level on points, which would go to countback.';
   } else {
     const gap = tr.gap==null ? '' : tr.gap>0 ? `${nm(tr.leader)} leads ${nm(tr.second)} by ${pl(tr.gap,'point')}. ` : `${nm(tr.leader)} leads ${nm(tr.second)} on countback. `;
     main = gap + (tr.earliest>=tr.total
       ? `<b>The title can't be decided before the final round</b> (round ${tr.earliest}${raceName(tr.earliest) ? ', '+raceName(tr.earliest)+' GP' : ''}).`
       : `<b>The title can't be decided before round ${tr.earliest}${raceOf(tr.earliest)}</b> at the earliest.`);
   }
   const who = kind==='teams' ? 'Every team' : 'Every driver';
   el.innerHTML = `<div class="trMain"><span class="trLabel">Title race</span> <span class="trText">${main}</span></div>`
     + `<div class="trNote"><span class="trSub">${who}, after round ${round}.</span>${note ? ' <span class="trTie">'+note+'</span>' : ''}</div>`;
   return tr;
  }

  return { TEAM_COLORS, SEASON_TEAM_COLORS, setSeason, maxWeekendPoints, titleRace, renderTitleRace, teamColor, SHORT_TEAM_NAMES, shortTeamName, SEASON_META, seasonMeta, YEARS,
    isNarrow, withAlpha, standingsMoves, moveHTML, driverPickerRowHTML, markActivePreset,
    flagCode, flagHTML, flagSpace, FLAG_ROOM, drawFlag, indexPeople, nationalityOf, numberOf, ridgeFlags, ridgeMarkers, ridgeKeyHTML, standingsOrder, standingsRank, pickerTeamLabelHTML,
    standingsByRound, renderPositionChart, projectionsByRound, renderProjectedPointsChart };
})();
