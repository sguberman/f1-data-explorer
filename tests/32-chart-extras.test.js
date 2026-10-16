// Group 2 (#122) on the Drivers' and Constructors' pages:
// #106: the points chart's tooltip names the round with its short name ("Round 5 · Singapore GP").
// #110: the projected final points chart has a tooltip per round listing each shown entry's projection, highest first.
// #113: tapping a round on the position-by-round chart opens that round's result in a panel under that chart (its own
// URL keys, presult/psession), for any loaded round whatever the slider says; it never fetches.
module.exports = async (t, h) => {
  const J = JSON.stringify;
  // Hovers value v on a chart's x axis and checks a thin vertical line appears there: pixels in that column that were empty
  // before the hover are drawn on after it, while a column 25px away stays empty.
  let p;
  const hoverLine = async (sel, v) => {
    const pt = await p.evaluate(([sel, v]) => { const ch = Chart.getChart(document.querySelector(sel)); ch.canvas.scrollIntoView({ block: 'center' });
      const b = ch.canvas.getBoundingClientRect(), x = Math.round(ch.scales.x.getPixelForValue(v)), dpr = devicePixelRatio, a = ch.chartArea;
      const px = y => [...ch.ctx.getImageData(x * dpr, y * dpr, 1, 1).data].join();
      const ref = px(Math.round(a.top + 2)), empty = [];
      for(let y = Math.round(a.top) + 2; y < a.bottom - 2; y += 3) if(px(y) === ref) empty.push(y);
      window.__emptyBefore = { x, empty, ref };
      return { x: b.left + ch.scales.x.getPixelForValue(v), y: b.top + (a.top + a.bottom) / 2 }; }, [sel, v]);
    await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(120);
    const ok = await p.evaluate(sel => { const ch = Chart.getChart(document.querySelector(sel)), { x, empty, ref } = window.__emptyBefore;
      const px = y => [...ch.ctx.getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data].join();
      const off = y => [...ch.ctx.getImageData((x + 25) * devicePixelRatio, y * devicePixelRatio, 1, 1).data].join();
      const changed = empty.filter(y => px(y) !== ref);
      return empty.length > 10 && changed.length >= empty.length * 0.6 && empty.filter(y => off(y) === ref).length >= empty.length * 0.6; }, sel);
    return ok;
  };
  for(const page of ['drivers', 'constructors']){
    const kind = page === 'drivers' ? 'drivers' : 'teams';
    p = await h.openPage(page, { width: 1000 }); await h.loaded(p);
    const hits = p.apiHits.length;

    // ---- #106 ----
    const t106 = await p.evaluate(() => {
      currentCalendar.raceNames[5] = 'Formula 1 Singapore Airlines Singapore Grand Prix 2026';
      currentCalendar.raceNames[9] = 'Formula 1 Gran Premio de la Ciudad de México 2026';
      const cb = Chart.getChart(document.getElementById('c')).options.plugins.tooltip.callbacks;
      return { five: cb.title([{ dataIndex: 4 }]), nine: cb.title([{ dataIndex: 8 }]), late: cb.title([{ dataIndex: 20 }]) };
    });
    t.check(`${page}: points tooltip uses the short race name (#106)`, t106.five === 'Round 5 · Singapore GP' && t106.nine === 'Round 9 · México City GP', J(t106));
    t.check(`${page}: …and a projected round still says so, with no name when there's none`, t106.late === 'Round 21 (projected)', t106.late);

    // ---- #110 ----
    const t110 = await p.evaluate(() => {
      drawProjPoints(true); // redraw so the tooltip sees the names set above
      const ch = Chart.getChart(document.getElementById('projChart')), tt = ch.options.plugins.tooltip, cb = tt.callbacks;
      const round = 5, items = ch.data.datasets.map((d, di) => ({ dataset: d, datasetIndex: di, raw: d.data[round - 1] }))
        .filter(tt.filter).sort(tt.itemSort);
      // independent: each shown entry's projected total after round 5, from the page's projections
      const want = ch.data.datasets.map(d => d.name).map((name, i) => ({ name, y: ch.data.datasets[i].data[round - 1].y }))
        .sort((a, b) => b.y - a.y).map(o => ` ${o.name}: ${o.y} pts`);
      return { enabled: tt.enabled !== false, mode: ch.options.interaction.mode, title: cb.title(items), labels: items.map(cb.label), want, n: ch.data.datasets.length };
    });
    t.check(`${page}: projected final points has a tooltip by round (#110)`, t110.enabled && t110.mode === 'index' && t110.title === 'After round 5 · Singapore GP', J(t110));
    t.check(`${page}: …listing every shown ${kind === 'teams' ? 'team' : 'driver'}'s projection then, highest first`, t110.n > 0 && J(t110.labels) === J(t110.want), J(t110));
    // no dots at rest, only on hover (the owner's request: they made the hovered round hard to see)
    t.check(`${page}: projected lines have no resting dots, only a hover dot`, await p.evaluate(() => Chart.getChart(document.getElementById('projChart')).data.datasets
      .every(d => d.pointRadius === 0 && d.pointHoverRadius > 0)));
    // a real hover shows it, with a vertical line at that round (F1Common.hoverLine)
    t.check(`${page}: hovering draws a vertical line at the round`, await hoverLine('#projChart', 5));
    t.check(`${page}: hovering a round shows the tooltip`, await p.evaluate(() => { const tip = Chart.getChart(document.getElementById('projChart')).tooltip;
      return tip.opacity > 0 && tip.title[0] === 'After round 5 · Singapore GP' && tip.body.length > 0; }));

    // the points chart gets the same hover line (owner's request); its x values are column indexes (round 3 = 2)
    t.check(`${page}: the points chart also draws the hover line at the hovered round`, await hoverLine('#c', 2));

    // ---- #113 ----
    const tapPos = async n => {
      const pt = await p.evaluate(n => { const ch = Chart.getChart(document.getElementById('posChart')); ch.canvas.scrollIntoView({ block: 'center' });
        const b = ch.canvas.getBoundingClientRect(); return { x: b.left + ch.scales.x.getPixelForValue(n), y: b.top + (ch.chartArea.top + ch.chartArea.bottom) / 2 }; }, n);
      await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(80);
    };
    const panel = sel => p.evaluate(sel => { const el = document.querySelector(sel);
      return { hidden: !el || el.hidden, title: el && el.querySelector('.rr-title')?.textContent.replace(/\s+/g, ' ').trim(),
        rows: el ? [...el.querySelectorAll('tbody tr')].map(tr => tr.dataset.id) : [], after: el && el.previousElementSibling && el.previousElementSibling.id }; }, sel);
    const L = await p.evaluate(() => currentSeasonRounds.length);
    await h.setRound(p, 3); await p.waitForTimeout(100); // the slider doesn't limit the position chart
    await tapPos(7);
    let s = await panel('#posResult');
    const want = await p.evaluate(() => { const r = F1Controls.state.seasonRounds.find(x => x.round === 7);
      return { name: r.raceName, order: [...r.raceResults.filter(x => x.position != null).sort((a, b) => a.position - b.position), ...r.raceResults.filter(x => x.position == null)].map(x => x.driverId) }; });
    t.check(`${page}: tapping round 7 on the position chart opens its result under that chart (#113)`, !s.hidden && s.after === 'posWrap' && s.title === `Round 7 ${want.name}`, J(s));
    t.check(`${page}: …in finishing order, even with the slider at round 3`, J(s.rows) === J(want.order.slice(0, s.rows.length)) && s.rows.length >= 10, J(s.rows));
    t.check(`${page}: …and the points chart's own panel stays closed`, (await panel('#roundResult')).hidden);
    await p.waitForFunction(() => new URL(location.href).searchParams.has('presult'), null, { timeout: 3000 }).catch(() => {});
    const url = new URL(p.url()).searchParams;
    t.check(`${page}: the open round goes into the URL as presult`, url.get('presult') === '7' && !url.has('result'), p.url());
    t.check(`${page}: the round is shaded on the position chart`, await p.evaluate(() => { const ch = Chart.getChart(document.getElementById('posChart'));
      const x = Math.round(ch.scales.x.getPixelForValue(7)), y = Math.round(ch.chartArea.top + 2); const d = ch.ctx.getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data; return d[3] > 0; }));
    await p.click('#posResult .rr-next'); s = await panel('#posResult');
    t.check(`${page}: › steps to round 8`, /^Round 8 /.test(s.title), s.title);
    await tapPos(L); s = await panel('#posResult');
    t.check(`${page}: the latest round (${L}) can be opened`, s.title && s.title.startsWith(`Round ${L} `), s.title);
    const link = p.url().split('/').pop();
    await p.click('#posResult .rr-close');
    await p.waitForFunction(() => !new URL(location.href).searchParams.has('presult'), null, { timeout: 3000 }).catch(() => {});
    t.check(`${page}: × closes it and presult leaves the URL`, (await panel('#posResult')).hidden && !new URL(p.url()).searchParams.has('presult'));
    t.check(`${page}: opening, stepping and closing never fetch`, p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
    t.check(`${page}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();

    p = await h.openPage(page, { width: 390, theme: 'dark' }); await p.goto('http://site.test/' + link); await h.loaded(p); await p.waitForTimeout(150);
    s = await panel('#posResult');
    t.check(`${page}: a link with presult opens that round under the position chart (390px dark)`, !s.hidden && s.title.startsWith(`Round ${L} `), link);
    t.check(`${page}: 390px: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    t.check(`${page}: link: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
