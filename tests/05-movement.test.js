// issue #47: ▲/▼ places gained/lost since the previous round, in picker rows, against an independent calc.
// #20: ranks break ties on points by countback of Grand Prix finishes (most wins, then second places, ...),
// like the championship-position chart, and the picker lists entries in that order.
module.exports = async (t, h) => {
  for(const [name, picker, idKey] of [['drivers','#driverPicker','driverId'], ['constructors','#teamPicker','teamId']]){
    const p = await h.openPage(name); await h.loaded(p);
    if(name === 'drivers') await p.selectOption('#sortSeg', 'rank');
    for(const round of [1, 2, 7, 12]){
      await h.setRound(p, round); await p.waitForTimeout(100);
      const got = await p.$$eval(`${picker} .pickerRow`, rows => rows.map(r => [r.querySelector('input').dataset.id, r.querySelector('.pickerMove').textContent]));
      const exp = await p.evaluate(([r, key]) => {
        const rs = F1Controls.state.seasonRounds;
        const rank = n => { const tot = {}, fin = {};
          rs.filter(x => x.round <= n).forEach(x => {
            [...x.raceResults, ...(x.sprintResults||[])].forEach(q => { tot[q[key]] = (tot[q[key]]||0) + q.points; });
            x.raceResults.forEach(q => { if(q.position >= 1){ const f = fin[q[key]] = fin[q[key]] || new Array(30).fill(0); f[q.position-1]++; } });
          });
          const cb = (a, b) => { const A = fin[a] || [], B = fin[b] || []; for(let i = 0; i < 30; i++){ const d = (B[i]||0) - (A[i]||0); if(d) return d; } return 0; };
          return Object.keys(tot).sort((a,b) => tot[b]-tot[a] || cb(a,b)); };
        const cur = rank(r), m = {};
        if(r > 1){
          const prev = rank(r-1);
          cur.forEach((id,i) => { const j = prev.indexOf(id); if(j >= 0 && j !== i) m[id] = (j > i ? '▲' : '▼') + Math.abs(j-i); });
        }
        return { m, order:cur };
      }, [round, idKey]);
      const bad = got.filter(([id, mv]) => (exp.m[id] || '') !== mv);
      t.check(`${name} round ${round}: movement matches standings`, bad.length === 0, JSON.stringify(bad.slice(0,3)));
      t.check(`${name} round ${round}: picker order matches the standings, ties broken by countback`,
        JSON.stringify(got.map(g => g[0])) === JSON.stringify(exp.order), JSON.stringify([got.map(g => g[0]).slice(0,6), exp.order.slice(0,6)]));
      if(round === 2) t.check(`${name} round 2: some entries moved`, got.some(([, mv]) => /[▲▼]\d/.test(mv)));
    }
    await p.done();
  }
};
