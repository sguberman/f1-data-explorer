// F1RaceModel (#133): the simulator's race model (#117) for a single race, used by What-If's "Simulated" preset.
// Each run draws a finishing order place by place, weighting the drivers not yet placed by how often they finished
// at that place or better in the data window (plus a bonus for finishes just behind it, and a small floor), after
// drivers retire at their blended DNF rate. The result is one summary per driver over all the runs.
// #153: it also holds the Simulator's season engine (planSeason, simulateSeason, ...), moved here from simulator.html
// so one copy serves the page, What-If and Node (the backtest). Nothing here reads page state: the random generator
// and the points tables come in as arguments.
const F1RaceModel = (()=>{
 const NEAR_BONUS=0.5, NEAR_DECAY=0.5, WEIGHT_FLOOR=0.01, DNF_PRIOR_RACES=4;
 function placeWeight(res, place){
   let w=WEIGHT_FLOOR;
   for(const f of res){ if(f==null) continue; w += f<=place ? 1 : NEAR_BONUS*Math.pow(NEAR_DECAY, f-place-1); }
   return w;
 }
 // The window's DNF share blended with DNF_PRIOR_RACES races at the grid's DNF rate.
 function dnfRate(res, gridRate){ const k=res.filter(f=>f==null).length; return (k + DNF_PRIOR_RACES*gridRate)/(res.length + DNF_PRIOR_RACES); }
 // drivers: [{results}] (each Grand Prix start in the window: classified position or null for a DNF).
 // Returns per driver {meanPoints, medianPos (DNF counts as last), pClassified}.
 function simulate(drivers, {pts, gridRate, runs, rand}){
   const n=drivers.length, W=new Float64Array(n*n), rate=new Float64Array(n);
   drivers.forEach((d,i)=>{ rate[i]=dnfRate(d.results, gridRate); for(let s=0;s<n;s++) W[i*n+s]=placeWeight(d.results, s+1); });
   const sum=new Float64Array(n), cls=new Float64Array(n), counts=new Int32Array(n*(n+1)), alive=new Int16Array(n), wts=new Float64Array(n);
   for(let r=0;r<runs;r++){
     let len=0;
     for(let i=0;i<n;i++){ if(rand()<rate[i]) counts[i*(n+1)+n]++; else alive[len++]=i; }
     for(let s=0;s<len;s++){
       let total=0;
       for(let x=s;x<len;x++){ const w=W[alive[x]*n+s]; wts[x]=w; total+=w; }
       let t=rand()*total, pick=len-1;
       for(let x=s;x<len;x++){ if((t-=wts[x])<=0){ pick=x; break; } }
       const i=alive[pick]; alive[pick]=alive[s]; alive[s]=i;
       if(s<pts.length) sum[i]+=pts[s];
       counts[i*(n+1)+s]++; cls[i]++;
     }
   }
   return drivers.map((d,i)=>{
     let acc=0, med=n;
     for(let p=0;p<=n;p++){ acc+=counts[i*(n+1)+p]; if(acc*2>=runs){ med=p; break; } }
     return { meanPoints:sum[i]/runs, medianPos:med+1, pClassified:cls[i]/runs };
   });
 }

 // ---- Season engine (#39, #42, #14, #11, #86), moved from simulator.html (#153) ----
 // The points still available after each remaining round, the same arithmetic as the knockout line on the drivers'
 // page: the most a rival can gain on the leader, a win in every Grand Prix (25) and sprint (8) left while the leader
 // scores nothing. endRound[e] = the round number when event e is the last of its round (its Grand Prix and sprint
 // are both done), else 0; roomAfter[e] = points still available after that round; room0 = before any of them.
 function decidedContext(events, startRound, ptsGP, ptsSprint){
   const E=events.length, endRound=new Int16Array(E), roomAfter=new Float64Array(E);
   let room=0;
   for(const ev of events) room += ev.type==='gp' ? ptsGP[0] : (ptsSprint[0]||0);
   const room0=room;
   for(let e=0;e<E;e++){
     room -= events[e].type==='gp' ? ptsGP[0] : (ptsSprint[0]||0);
     if(e===E-1 || events[e+1].round!==events[e].round) endRound[e]=events[e].round;
     roomAfter[e]=room;
   }
   return { endRound, roomAfter, room0, startRound, lastRound: E ? events[E-1].round : startRound };
 }
 // True when the leader's margin over every rival is more than the points still available. A lead equal to them
 // isn't enough: a rival could still draw level, and a tie goes to countback (counted conservatively, #86).
 function titleSettled(totals, n, room){
   let a=-Infinity, b=-Infinity;
   for(let i=0;i<n;i++){ const v=totals[i]; if(v>a){ b=a; a=v; } else if(v>b) b=v; }
   return a-b>room;
 }
 // The round after which a season's title is decided, given the points after each event (constructed sequences in
 // tests; the engine does the same check inline in simulateSeason). Not settled before the final round = the final round.
 function decidedRoundFor(dec, startTotals, eventPoints){
   const n=startTotals.length, totals=startTotals.slice();
   if(titleSettled(totals, n, dec.room0)) return dec.startRound;
   for(let e=0;e<eventPoints.length;e++){
     for(let i=0;i<n;i++) totals[i]+=eventPoints[e][i]||0;
     if(dec.endRound[e] && titleSettled(totals, n, dec.roomAfter[e])) return dec.endRound[e];
   }
   return dec.lastRound;
 }
 // Chooses k of the first len entries of buf at random (partial Fisher-Yates); they end up in buf[0..k-1].
 function pickInPlace(buf, len, k, rand){
   k=Math.max(0,Math.min(k,len));
   for(let i=0;i<k;i++){ const j=i+Math.floor(rand()*(len-i)); const t=buf[i]; buf[i]=buf[j]; buf[j]=t; }
   return k;
 }
 // One simulated season's fixed outcomes: winnerOf[e] (roster index or null) and out[i] = events driver i
 // doesn't finish. Order matters: forced wins first, then collisions (both drivers out of the same GP,
 // never one either of them wins), then exact DNFs, then everyone on auto retires at their own rate in
 // the events still open to them (never in a race they're set to win).
 // #56: typed arrays and no per-call closures or copies — this runs once per simulated season.
 // winnerOf[e] = roster index or -1; out[i][e] = 1 if driver i doesn't finish event e.
 function planSeason(ctx, rand){
   const {n,E,gpIdx,scratch}=ctx;
   const winnerOf=new Int16Array(E).fill(-1), out=new Array(n);
   for(let i=0;i<n;i++) out[i]=new Uint8Array(E);
   if(ctx.winDrivers.length){
     const order=ctx.winDrivers.slice();
     for(let i=order.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); const t=order[i]; order[i]=order[j]; order[j]=t; }
     for(const i of order){
       let len=0; for(const e of gpIdx) if(winnerOf[e]<0) scratch[len++]=e;
       const k=pickInPlace(scratch, len, ctx.wins[i], rand);
       for(let x=0;x<k;x++) winnerOf[scratch[x]]=i;
     }
   }
   for(const c of ctx.cols){
     const A=out[c.a], B=out[c.b];
     let len=0; for(const e of gpIdx) if(winnerOf[e]!==c.a && winnerOf[e]!==c.b && !A[e] && !B[e]) scratch[len++]=e;
     const k=pickInPlace(scratch, len, c.n, rand);
     for(let x=0;x<k;x++){ A[scratch[x]]=1; B[scratch[x]]=1; }
   }
   for(let i=0;i<n;i++){
     const O=out[i];
     if(ctx.dnfs[i]!=null){
       let len=0; for(let e=0;e<E;e++) if(winnerOf[e]!==i && !O[e]) scratch[len++]=e;
       const k=pickInPlace(scratch, len, ctx.dnfs[i], rand);
       for(let x=0;x<k;x++) O[scratch[x]]=1;
     }else{
       const p=ctx.dnfRate[i];
       if(p>0) for(let e=0;e<E;e++) if(winnerOf[e]!==i && !O[e] && rand()<p) O[e]=1;
     }
   }
   return {winnerOf, out};
 }
 // One whole simulated season: points totals per roster index (and, for tests, each event's order), and the round
 // the title was decided (#86: checked at the end of each round from the points already drawn; no extra random draws,
 // so a seeded run gives exactly the results it gave before).
 // #117: only drivers who raced in the latest round take part (ctx.active); every classified place is drawn, and each
 // Grand Prix place is added to fin (finishes by position, for countback) — the sprint counts for points only.
 function simulateSeason(ctx, rand, ptsGP, ptsSprint, keepOrders){
   const plan=planSeason(ctx, rand), totals=ctx.nowPts.slice(), orders=keepOrders?[]:null, alive=ctx.alive, dec=ctx.dec;
   const n=ctx.n, fin=ctx.fin0.slice(), active=ctx.active;
   let decided=ctx.decidedNow;
   for(let e=0;e<ctx.E;e++){
     const gp=ctx.isGp[e], w=plan.winnerOf[e], pts = gp ? ptsGP : ptsSprint;
     let len=0; for(let i=0;i<n;i++) if(active[i] && !plan.out[i][e] && i!==w) alive[len++]=i;
     // A driver with a set number of wins wins exactly those GPs: they're never drawn for P1 elsewhere.
     let order;
     if(gp && w>=0){ totals[w]+=pts[0]; fin[w*n]++; order=sampleOrder(ctx, rand, alive, len, 1, null, totals, pts, fin); if(orders) order.unshift(w); }
     else order=sampleOrder(ctx, rand, alive, len, 0, gp ? ctx.forcedWinner : null, totals, pts, gp ? fin : null);
     if(orders) orders.push(order);
     if(!decided && dec.endRound[e] && titleSettled(totals, n, dec.roomAfter[e])) decided=dec.endRound[e];
   }
   return {totals, plan, orders, fin, decided: decided || dec.lastRound};
 }
 // issue #30 / #117: draw a race order place by place (who takes P1, then P2, ...), weighting the still-unplaced
 // drivers by their weight for that place (placeWeight: finishes at that place or better in the data window, a bonus
 // for finishes just behind it, and a small floor, so nothing is impossible and the weights never all go to zero),
 // and removing each pick before the next place. Every place is drawn, so countback and 0-point drivers' order work.
 // startSlot: the first position being filled (1 when P1 is already decided, #14). noWin[i] true: driver i
 // can't be drawn for P1 (they have a set number of wins and this isn't one of those races).
 // #56: draws from the first len entries of alive (reordered in place), adds each placed driver's points
 // straight into totals and (Grand Prix only) their place into fin, and returns the drawn order.
 function sampleOrder(ctx, rand, alive, len, startSlot, noWin, totals, pts, fin){
   const W=ctx.W, wts=ctx.wts, n=ctx.n, order=[];
   for(let s=0; s<len; s++){
     const slot=s+startSlot;
     let anyAllowed=true;
     if(slot===0 && noWin){ anyAllowed=false; for(let x=s;x<len;x++) if(!noWin[alive[x]]){ anyAllowed=true; break; } }
     let total=0;
     for(let x=s;x<len;x++){
       const i=alive[x];
       const wt = slot===0 && noWin && anyAllowed && noWin[i] ? 0 : W[i*n+slot];
       wts[x]=wt; total+=wt;
     }
     let r=rand()*total, pick=len-1;
     for(let x=s;x<len;x++){ if((r-=wts[x])<=0){ pick=x; break; } }
     const i=alive[pick]; alive[pick]=alive[s]; alive[s]=i; // move the pick to the front of what's left
     if(totals && slot<pts.length) totals[i]+=pts[slot];
     if(fin) fin[i*n+slot]++;
     order.push(i);
   }
   return order;
 }
 // #117: equal points go to countback, as in the real standings — most Grand Prix wins, then most second places, and
 // so on (fin from simulateSeason); still level, the current standings order.
 function countback(fin, n, a, b){
   for(let p=0;p<n;p++){ const d=fin[b*n+p]-fin[a*n+p]; if(d) return d; }
   return 0;
 }
 return { placeWeight, dnfRate, simulate, NEAR_BONUS, NEAR_DECAY, WEIGHT_FLOOR, DNF_PRIOR_RACES,
          decidedContext, titleSettled, decidedRoundFor, pickInPlace, planSeason, simulateSeason, sampleOrder, countback };
})();
if(typeof module!=='undefined' && module.exports) module.exports=F1RaceModel; // Node (the backtest, #153)

