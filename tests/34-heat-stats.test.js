// #109: Talking points card on the position page (under the picker): most wins / podiums / not classified and the longest
// win, podium and points streaks among every driver (not just those shown), Grand Prix finishes through the slider's
// round. Checked against an independent calculation; follows the slider and season; never fetches; fits a phone.
module.exports = async (t, h) => {
  const shown = p => p.$$eval('#heatStats .tp', els => els.map(e => ({ key: e.dataset.fact, ids: e.dataset.ids.split(','), n: +e.dataset.n,
    value: e.querySelector('.tpValue').textContent.replace(/\s+/g, ' ').trim(), detail: (e.querySelector('.tpDetail') || { textContent: '' }).textContent.trim() })));
  // Independent: counts and longest runs per selected driver; a missed round breaks a run.
  const expected = p => p.evaluate(() => {
    const L = F1Controls.state.round, rounds = F1Controls.state.seasonRounds.filter(r => r.round <= L).sort((a, b) => a.round - b.round);
    const ids = [...new Set(rounds.flatMap(r => r.raceResults.map(x => x.driverId)))]; // every driver, not just those shown
    const cnt = { wins: {}, podiums: {}, nc: {} }, runs = { winStreak: {}, podiumStreak: {}, pointsStreak: {} };
    ids.forEach(id => { for(const k in cnt) cnt[k][id] = 0; const cur = {}; for(const k in runs) runs[k][id] = { n: 0, to: 0 };
      rounds.forEach(r => {
        const g = r.raceResults.find(x => x.driverId === id), s = (r.sprintResults || []).find(x => x.driverId === id);
        const pos = g ? g.position : undefined;
        if(pos === 1) cnt.wins[id]++; if(pos != null && pos <= 3) cnt.podiums[id]++; if(g && pos == null) cnt.nc[id]++;
        const hit = { winStreak: pos === 1, podiumStreak: pos != null && pos <= 3, pointsStreak: ((g ? g.points : 0) + (s ? s.points : 0)) > 0 };
        for(const k in hit){ cur[k] = hit[k] ? (cur[k] || 0) + 1 : 0; if(cur[k] > runs[k][id].n) runs[k][id] = { n: cur[k], to: r.round }; }
      }); });
    const out = {};
    const top = (vals, min) => { const c = ids.filter(id => vals[id] > min); if(!c.length) return null; const n = Math.max(...c.map(id => vals[id])); return { n, ids: c.filter(id => vals[id] === n) }; };
    for(const k in cnt){ const b = top(cnt[k], 0); if(b) out[k] = b; }
    for(const k in runs){ const v = {}; ids.forEach(id => { v[id] = runs[k][id].n; }); const b = top(v, 1); if(b){ b.to = b.ids.length === 1 ? runs[k][b.ids[0]].to : null; out[k] = b; } }
    return { out, last: rounds.length ? rounds[rounds.length - 1].round : 0 };
  });
  const ORDER = ['wins', 'podiums', 'nc', 'winStreak', 'podiumStreak', 'pointsStreak'];
  const compare = async (p, label) => {
    const want = await expected(p), got = await shown(p);
    t.check(`${label}: shows exactly the stats that apply, in order`, JSON.stringify(got.map(g => g.key)) === JSON.stringify(ORDER.filter(k => want.out[k])), JSON.stringify([got.map(g => g.key), Object.keys(want.out)]));
    const bad = got.filter(g => !want.out[g.key] || g.n !== want.out[g.key].n || JSON.stringify([...g.ids].sort()) !== JSON.stringify([...want.out[g.key].ids].sort()));
    t.check(`${label}: right drivers and numbers`, bad.length === 0, JSON.stringify(bad.map(b => [b, want.out[b.key]])));
    const streaks = got.filter(g => /Streak$/.test(g.key) && g.ids.length === 1);
    t.check(`${label}: a single holder's streak names its rounds`, streaks.every(g => { const w = want.out[g.key]; return g.detail.startsWith(`rounds ${w.to - w.n + 1}–${w.to}`) && g.detail.endsWith('still going') === (w.to === want.last && /still going/.test(g.detail)); }), JSON.stringify(streaks));
    return got;
  };

  let p = await h.openPage('position', { width: 1000 }); await h.loaded(p);
  const hits = p.apiHits.length;
  await p.click('#presetRow [data-preset="all"]').catch(() => {});
  let got = await compare(p, 'all drivers, round 12');
  t.check('own Talking points card right under the picker, then the heat strip card, then the chart card', await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.wrap > .card')], at = id => cards.indexOf(document.getElementById(id).closest('.card'));
    return at('driverPicker') === 0 && at('heatStats') === 1 && at('heatStrip') === 2 && at('ridgeCanvas') === 3 && !document.getElementById('heatCard').contains(document.getElementById('heatStats')); }));
  t.check('wording: "N wins" / "N rounds" with flags', got.every(g => /(win|podium|Grands? Prix|round)s?( each)?$/.test(g.value)) && await p.$$eval('#heatStats .tpName img.flag', x => x.length) > 0, JSON.stringify(got.map(g => g.value)));
  for(const round of [9, 4, 1]){ await h.setRound(p, round); await p.waitForTimeout(80); await compare(p, `slider at round ${round}`); }
  await h.setRound(p, 12);
  const full = JSON.stringify(await shown(p));
  await p.click('#presetRow [data-preset="none"]');
  t.check('with no drivers shown, the talking points still cover every driver', JSON.stringify(await shown(p)) === full);
  await p.click('#presetRow [data-preset="5"]');
  t.check('picking drivers does not change them', JSON.stringify(await shown(p)) === full);
  await compare(p, 'a small selection');
  t.check('no fetches while interacting', p.apiHits.length === hits, `${p.apiHits.length - hits} new`);
  t.check('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  for(const theme of ['light', 'dark']){
    p = await h.openPage('position', { theme, width: 390 }); await h.loaded(p);
    const fit = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, cols: getComputedStyle(document.getElementById('heatStats')).gridTemplateColumns.split(' ').length,
      over: [...document.querySelectorAll('#heatStats .tp')].filter(e => e.scrollWidth > e.clientWidth + 1).length }));
    t.check(`phone ${theme}: two tiles per row, nothing cut off, no page scroll`, fit.page <= 390 && fit.cols === 2 && fit.over === 0, JSON.stringify(fit));
    await h.screenshot(p, `heatstats-390-${theme}.png`);
    await p.done();
  }
};
