// F1RaceModel (#133): the simulator's race model (#117) for a single race, used by What-If's "Simulated" preset.
// Each run draws a finishing order place by place, weighting the drivers not yet placed by how often they finished
// at that place or better in the data window (plus a bonus for finishes just behind it, and a small floor), after
// drivers retire at their blended DNF rate. The result is one summary per driver over all the runs.
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
 return { placeWeight, dnfRate, simulate, NEAR_BONUS, NEAR_DECAY, WEIGHT_FLOOR, DNF_PRIOR_RACES };
})();
