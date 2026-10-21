// F1RaceModel (#133): the simulator's race model (#117) for a single race, used by What-If's "Simulated" preset.
// Each run draws a finishing order place by place, weighting the drivers not yet placed by how often they finished
// at that place or better in the data window (plus a bonus for finishes just behind it, and a small floor), after
// drivers retire at their blended DNF rate. The result is one summary per driver over all the runs.
// #153: it also holds the Simulator's season engine (planSeason, simulateSeason, ...), moved here from simulator.html
// so one copy serves the page, What-If and Node (the backtest). Nothing here reads page state: the random generator
// and the points tables come in as arguments.
const F1RaceModel = (()=>{
 // #162: refitted on 2014–2025 (docs/BACKTEST.md): a larger floor and DNF smoothing, plus team strength. A driver's own DNF
 // record barely predicts their DNFs, so the DNF chance is mostly the grid's rate (DNF_PRIOR_RACES).
 const NEAR_BONUS=0.5, NEAR_DECAY=0.5, WEIGHT_FLOOR=0.03, DNF_PRIOR_RACES=64;
 // Team strength: each driver's weight for a place also includes TEAM_SHARE times the average of their teammates'
 // (the other cars on the same team), so a replaced or new driver inherits the car's pace.
 const TEAM_SHARE=0.25;
 // #167: extra evidence about where a driver will finish. A known starting grid / qualifying position for this race counts
 // like QUALI_KNOWN extra finishes there; each of this season's earlier qualifying positions counts QUALI_FORM (a driver
 // who qualifies well tends to finish well, and it helps while the qualifying result isn't in yet). Fitted by the backtest.
 const QUALI_KNOWN=16, QUALI_FORM=0.5;
 // #169: track history. A driver's finishes at this circuit in earlier seasons, each relative to their own average that season
 // (the deltas in data/tracks.json), averaged and shrunk toward zero (divided by visits + TRACK_SHRINK), move their current
 // average finish to an expected position here, which counts like TRACK_WEIGHT extra finishes there.
 const TRACK_WEIGHT=2, TRACK_SHRINK=3;
 function placeWeight(res, place){
   let w=WEIGHT_FLOOR;
   for(const f of res){ if(f==null) continue; w += f<=place ? 1 : NEAR_BONUS*Math.pow(NEAR_DECAY, f-place-1); }
   return w;
 }
  // The weight a position f (a finish, grid or qualifying position) gives a finishing place: 1 at that place or better,
 // then the near bonus halving each place further behind.
 function posTerm(f, place){ return f<=place ? 1 : NEAR_BONUS*Math.pow(NEAR_DECAY, f-place-1); }
 // A driver's extra evidence for weightMatrix: [[weight, [positions...]], ...] from this race's known position (or null),
 // this season's earlier qualifying positions (or an empty list) and the expected position at this track (or null, see
 // trackPosition); null when there is none.
 function evidence(known, form, track){
   const ev=[];
   if(known!=null) ev.push([QUALI_KNOWN, [known]]);
   if(form && form.length) ev.push([QUALI_FORM, form]);
   if(track!=null) ev.push([TRACK_WEIGHT, [track]]);
   return ev.length ? ev : null;
 }
 // The expected position at a circuit from earlier visits: deltas = [delta, ...] (finish minus that season's average, from
 // earlier seasons only); cur = the driver's average classified finish this season (null when none: mid-field, n/2); n = cars.
 // null when they have never raced there.
 function trackPosition(deltas, cur, n){
   if(!deltas || !deltas.length) return null;
   let sum=0; for(const d of deltas) sum+=d;
   const base = cur==null ? n/2 : cur;
   return Math.min(n, Math.max(1, Math.round(base + sum/(deltas.length+TRACK_SHRINK))));
 }
 // The cars sharing each car's team: teams[i] is a team id, or null for a car with no teammates in this race.
 function matesOf(teams){ return teams.map((t,i)=>t==null ? [] : teams.map((u,j)=>j!==i && u===t ? j : -1).filter(j=>j>=0)); }
 // The weight of every driver for every finishing place (n x n, driver i place s at i*n+s): their own, plus TEAM_SHARE times
 // the average of their teammates', plus any extra evidence ev[i] (see evidence; optional). res[i] = driver i's results in
 // the window; teams as for matesOf.
 function weightMatrix(res, teams, ev){
   const n=res.length, mates=matesOf(teams), W=new Float64Array(n*n);
   for(let i=0;i<n;i++) for(let s=0;s<n;s++){
     let w=placeWeight(res[i], s+1);
     if(mates[i].length){ let m=0; for(const j of mates[i]) m+=placeWeight(res[j], s+1); w += TEAM_SHARE*m/mates[i].length; }
     if(ev && ev[i]) for(const [lam, pos] of ev[i]) for(const f of pos) w += lam*posTerm(f, s+1);
     W[i*n+s]=w;
   }
   return W;
 }
 // The window's DNF share blended with DNF_PRIOR_RACES races at the grid's DNF rate.
 function dnfRate(res, gridRate){ const k=res.filter(f=>f==null).length; return (k + DNF_PRIOR_RACES*gridRate)/(res.length + DNF_PRIOR_RACES); }
 // drivers: [{results, team, ev}] (ev = evidence(known, form), optional; results = each Grand Prix start in the window: classified position or null for a DNF;
 // team = their team id this race, for team strength).
 // Returns per driver {meanPoints, medianPos (DNF counts as last), pClassified}.
 function simulate(drivers, {pts, gridRate, runs, rand}){
   const n=drivers.length, W=weightMatrix(drivers.map(d=>d.results), drivers.map(d=>d.team==null ? null : d.team), drivers.map(d=>d.ev||null)), rate=new Float64Array(n);
   drivers.forEach((d,i)=>{ rate[i]=dnfRate(d.results, gridRate); });
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
   const n=ctx.n, fin=ctx.fin0.slice(), active=ctx.active, W0=ctx.W;
   let decided=ctx.decidedNow;
   for(let e=0;e<ctx.E;e++){
     ctx.W = (ctx.eventW && ctx.eventW[e]) || W0; // #167: an event can have its own weights (the next race, once its qualifying is known)
     const gp=ctx.isGp[e], w=plan.winnerOf[e], pts = gp ? ptsGP : ptsSprint;
     let len=0; for(let i=0;i<n;i++) if(active[i] && !plan.out[i][e] && i!==w) alive[len++]=i;
     // A driver with a set number of wins wins exactly those GPs: they're never drawn for P1 elsewhere.
     let order;
     if(gp && w>=0){ totals[w]+=pts[0]; fin[w*n]++; order=sampleOrder(ctx, rand, alive, len, 1, null, totals, pts, fin); if(orders) order.unshift(w); }
     else order=sampleOrder(ctx, rand, alive, len, 0, gp ? ctx.forcedWinner : null, totals, pts, gp ? fin : null);
     if(orders) orders.push(order);
     if(!decided && dec.endRound[e] && titleSettled(totals, n, dec.roomAfter[e])) decided=dec.endRound[e];
   }
   ctx.W=W0;
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
 return { placeWeight, dnfRate, matesOf, weightMatrix, evidence, trackPosition, posTerm, simulate, NEAR_BONUS, NEAR_DECAY, WEIGHT_FLOOR, DNF_PRIOR_RACES, TEAM_SHARE, QUALI_KNOWN, QUALI_FORM, TRACK_WEIGHT, TRACK_SHRINK,
          decidedContext, titleSettled, decidedRoundFor, pickInPlace, planSeason, simulateSeason, sampleOrder, countback };
})();
if(typeof module!=='undefined' && module.exports) module.exports=F1RaceModel; // Node (the backtest, #153)

