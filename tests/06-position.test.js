// issue #9: championship position by round — standings logic and the chart on both pages.
module.exports = async (t, h) => {
  const p = await h.openPage('drivers'); await h.loaded(p);
  // Hand-built seasons: countback ties, a late joiner, team totals.
  const r = await p.evaluate(() => {
    const row = (id, team, pos, pts) => ({driverId:id, code:id.toUpperCase(), name:id, teamId:team, teamName:team, position:pos, points:pts});
    const rounds = [
      {round:1, raceResults:[row('a','t1',1,25), row('b','t2',2,18), row('c','t1',3,15)], sprintResults:null},
      {round:2, raceResults:[row('b','t2',1,25), row('a','t1',2,18), row('c','t1',3,15)], sprintResults:null},
      {round:3, raceResults:[row('c','t1',1,25), row('d','t2',2,18), row('a','t1',3,15), row('b','t2',4,12)], sprintResults:[row('b','t2',null,3)]},
    ];
    const tie = [
      {round:1, raceResults:[row('x','tx',2,18), row('y','ty',null,0)], sprintResults:[row('x','tx',null,7)]},
      {round:2, raceResults:[row('y','ty',1,25), row('x','tx',null,0)], sprintResults:null},
    ];
    return { d:F1Common.standingsByRound(rounds,'drivers').pos, t:F1Common.standingsByRound(rounds,'teams').pos,
             tie:F1Common.standingsByRound(tie,'drivers').pos };
  });
  // After round 3, a and b both have 58: a wins countback with an extra third place. d joins in round 3.
  t.check('standings with countback and a late joiner', JSON.stringify(r.d) === JSON.stringify({a:[1,1,1], b:[2,2,2], c:[3,3,3], d:[null,null,4]}), JSON.stringify(r.d));
  t.check('team standings', JSON.stringify(r.t) === JSON.stringify({t1:[1,1,1], t2:[2,2,2]}), JSON.stringify(r.t));
  // x and y tie on 25 after round 2; y has a win, x only a second -> y ahead.
  t.check('countback beats points-table order', r.tie.y[1] === 1 && r.tie.x[1] === 2, JSON.stringify(r.tie));
  await p.done();

  for(const [name, kind] of [['drivers','drivers'], ['constructors','teams']]){
    const q = await h.openPage(name); await h.loaded(q);
    const snap = () => q.evaluate(() => Chart.getChart(document.getElementById('posChart')).data.datasets
      .map(d => d.label + ':' + d.data.filter((_,i) => i % 2 === 0).map(v => v.y).join(',')));
    const before = await snap();
    const exp = await q.evaluate(k => {
      const rs = F1Controls.state.seasonRounds, idOf = x => k === 'teams' ? x.teamId : x.driverId, out = {};
      for(let n = 1; n <= rs.length; n++){
        const pts = {}, fin = {};
        rs.slice(0, n).forEach(r => {
          [...r.raceResults, ...(r.sprintResults||[])].forEach(x => { pts[idOf(x)] = (pts[idOf(x)]||0) + x.points; });
          r.raceResults.forEach(x => { if(x.position){ const f = fin[idOf(x)] = fin[idOf(x)] || []; f[x.position-1] = (f[x.position-1]||0) + 1; } });
        });
        const cb = (a,b) => { for(let i = 0; i < 30; i++){ const d = ((fin[b]||[])[i]||0) - ((fin[a]||[])[i]||0); if(d) return d; } return 0; };
        Object.keys(pts).sort((a,b) => pts[b]-pts[a] || cb(a,b)).forEach((id,i) => { (out[id] = out[id] || []).push(i+1); });
      }
      return Object.values(out).map(v => v.join(',')).sort();
    }, kind);
    t.check(`${name}: every entry plotted, positions match an independent calc`,
      JSON.stringify(before.map(s => s.split(':')[1]).sort()) === JSON.stringify(exp), `${before.length} lines`);
    q.apiHits.length = 0;
    await h.setRound(q, 5); await q.waitForTimeout(150);
    t.check(`${name}: slider leaves the chart alone, no requests`, JSON.stringify(await snap()) === JSON.stringify(before) && q.apiHits.length === 0);
    await q.done();
  }
};
