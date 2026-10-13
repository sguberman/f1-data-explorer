// issue #10: projected final points (picker selection) and projected standings (all entries).
module.exports = async (t, h) => {
  for(const [name, kind, picker, selVar] of [['drivers','drivers','#driverPicker','selectedDriverIds'], ['constructors','teams','#teamPicker','selectedTeamIds']]){
    const p = await h.openPage(name); await h.loaded(p);
    const lines = () => p.evaluate(() => Chart.getChart(document.getElementById('projChart')).data.datasets.map(d => ({name:d.name, fin:Math.round(d.fin), n:d.data.length})));
    // Same math as the points chart: the last projected value equals the end of its projection line.
    const top = await p.evaluate(() => Object.fromEntries(D.map(d => [d.n, Math.round(d.full[N-1])])));
    const got = await lines();
    t.check(`${name}: projected points match the points chart's projection`, got.length === Object.keys(top).length && got.every(d => top[d.name] === d.fin), JSON.stringify(got));
    t.check(`${name}: one point per completed round`, got.every(d => d.n === 12));
    // Projected standings vs an independent calc, every round.
    await p.selectOption('#posView', 'proj'); await p.waitForTimeout(150);
    const plotted = await p.evaluate(() => Object.fromEntries(Chart.getChart(document.getElementById('posChart')).data.datasets
      .map(d => [d.label, d.data.filter((_,i) => i % 2 === 0).map(q => q.y).join(',')])));
    const exp = await p.evaluate(k => {
      const rs = F1Controls.state.seasonRounds, total = totalRounds(), idOf = q => k === 'teams' ? q.teamId : q.driverId;
      const actual = F1Common.standingsByRound(rs, k).pos, lab = {}, out = {};
      for(let n = 1; n <= rs.length; n++){
        const per = {};
        rs.slice(0, n).forEach(r => [...r.raceResults, ...(r.sprintResults||[])].forEach(q => {
          const id = idOf(q); lab[id] = k === 'teams' ? F1Common.shortTeamName(id, q.teamName) : q.code;
          (per[id] = per[id] || {})[r.round] = (per[id][r.round]||0) + q.points; }));
        Object.entries(per).map(([id, byRound]) => {
          const rr = Object.keys(byRound).map(Number).sort((a,b) => a-b), last5 = rr.slice(-5);
          const sum = rr.reduce((s,r) => s + byRound[r], 0), rate = last5.reduce((s,r) => s + byRound[r], 0) / last5.length;
          return {id, proj: sum + rate * (Math.max(total, n) - n)};
        }).sort((a,b) => b.proj-a.proj || actual[a.id][n-1]-actual[b.id][n-1])
          .forEach((r,i) => { (out[lab[r.id]] = out[lab[r.id]] || []).push(i+1); });
      }
      return Object.fromEntries(Object.entries(out).map(([k2, v]) => [k2, v.join(',')]));
    }, kind);
    const bad = Object.keys(exp).filter(k => exp[k] !== plotted[k]);
    t.check(`${name}: projected standings match an independent calc`, bad.length === 0 && Object.keys(plotted).length === Object.keys(exp).length, bad.slice(0,2).join(', '));
    t.check(`${name}: Show dropdown switches note and axis`, /Projected finishing order/.test(await h.text(p, '#posNote')) &&
      await p.evaluate(() => Chart.getChart(document.getElementById('posChart')).options.scales.x.title.text === 'After round'));
    // Slider: chart not rebuilt, nothing fetched.
    await p.evaluate(() => { window.__pc = Chart.getChart(document.getElementById('projChart')); });
    p.apiHits.length = 0;
    await h.setRound(p, 4); await p.waitForTimeout(150);
    t.check(`${name}: slider leaves the projection chart alone`, await p.evaluate(() => Chart.getChart(document.getElementById('projChart')) === window.__pc) && p.apiHits.length === 0);
    // Follows the picker.
    await p.click('#presetRow button[data-preset="all"]'); await p.waitForTimeout(150);
    const all = await p.evaluate(v => eval(v).length, selVar);
    t.check(`${name}: follows the picker (All)`, (await lines()).length === all);
    await p.locator(`${picker} input`).first().click(); await p.waitForTimeout(150);
    t.check(`${name}: follows the picker (uncheck one)`, (await lines()).length === all - 1);
    await p.click('#presetRow button[data-preset="none"]'); await p.waitForTimeout(150);
    t.check(`${name}: empty selection is fine`, (await lines()).length === 0 && p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
