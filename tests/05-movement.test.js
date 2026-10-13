// issue #47: ▲/▼ places gained/lost since the previous round, in picker rows, against an independent calc.
module.exports = async (t, h) => {
  for(const [name, picker, idKey] of [['drivers','#driverPicker','driverId'], ['constructors','#teamPicker','teamId']]){
    const p = await h.openPage(name); await h.loaded(p);
    if(name === 'drivers') await p.selectOption('#sortSeg', 'rank');
    for(const round of [1, 2, 7, 12]){
      await h.setRound(p, round); await p.waitForTimeout(100);
      const got = await p.$$eval(`${picker} .pickerRow`, rows => rows.map(r => [r.querySelector('input').dataset.id, r.querySelector('.pickerMove').textContent]));
      const exp = await p.evaluate(([r, key]) => {
        const rs = F1Controls.state.seasonRounds;
        const rank = n => { const tot = {};
          rs.filter(x => x.round <= n).forEach(x => [...x.raceResults, ...(x.sprintResults||[])].forEach(q => { tot[q[key]] = (tot[q[key]]||0) + q.points; }));
          return Object.entries(tot).sort((a,b) => b[1]-a[1]).map(e => e[0]); };
        if(r <= 1) return {};
        const prev = rank(r-1), cur = rank(r), m = {};
        cur.forEach((id,i) => { const j = prev.indexOf(id); if(j >= 0 && j !== i) m[id] = (j > i ? '▲' : '▼') + Math.abs(j-i); });
        return m;
      }, [round, idKey]);
      const bad = got.filter(([id, mv]) => (exp[id] || '') !== mv);
      t.check(`${name} round ${round}: movement matches standings`, bad.length === 0, JSON.stringify(bad.slice(0,3)));
      if(round === 2) t.check(`${name} round 2: some entries moved`, got.some(([, mv]) => /[▲▼]\d/.test(mv)));
    }
    await p.done();
  }
};
