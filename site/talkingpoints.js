/* F1TalkingPoints (#88): a few facts worked out from the season so far, for the whole field, as of the slider's
   round — the leader and the gap, most wins, the longest active points streak, the biggest climber and faller
   over the last 5 rounds. Each fact names its driver(s) by code with a flag;
   ties list everyone ("VER and NOR · 3 wins each"). A fact that can't be worked out yet (the 5-round moves before
   round 6) is left out. Everything comes from the season already loaded,
   so it never fetches. Standings and tie-breaks come from F1Common.standingsOrder, like the rest of the site.

   F1TalkingPoints.facts(seasonRounds, round)  the facts, as data: [{key, label, ids, n, value, detail}]
   F1TalkingPoints.stats(seasonRounds, round, ids)  #109: wins, podiums, not classified and streaks for these drivers (position page)
   F1TalkingPoints.render(el, seasonRounds, round[, list])  writes them (or `list`) into el (a list of .tp tiles)
*/
const F1TalkingPoints = (() => {
  const MOVE_SPAN = 5; // "over the last 5 rounds"
  const MAX_NAMES = 3; // more tied drivers than this read "+N more"
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const fmt = n => Math.round(n * 10) / 10; // half points (shortened races) stay exact

  // The ids with the highest value (above `min`), in standings order.
  function best(values, rank, min){
    const ids = Object.keys(values).filter(id => values[id] > min);
    if(!ids.length) return null;
    const top = Math.max(...ids.map(id => values[id]));
    return { n: top, ids: ids.filter(id => values[id] === top).sort((a, b) => rank[a] - rank[b]) };
  }

  function facts(seasonRounds, round){
    const upto = (seasonRounds || []).filter(r => r.round <= round).sort((a, b) => a.round - b.round);
    if(!upto.length) return [];
    const order = F1Common.standingsOrder(seasonRounds, round, 'drivers'), rank = {};
    order.forEach((id, i) => { rank[id] = i; });
    const code = {}, pts = {}, wins = {}, podiums = {}, roundPts = {};
    upto.forEach(r => {
      [...r.raceResults, ...(r.sprintResults || [])].forEach(x => {
        code[x.driverId] = x.code;
        pts[x.driverId] = (pts[x.driverId] || 0) + x.points;
        const rp = roundPts[x.driverId] = roundPts[x.driverId] || {};
        rp[r.round] = (rp[r.round] || 0) + x.points;
      });
      r.raceResults.forEach(x => {
        if(x.position === 1) wins[x.driverId] = (wins[x.driverId] || 0) + 1;
        if(x.position != null && x.position <= 3) podiums[x.driverId] = (podiums[x.driverId] || 0) + 1;
      });
    });
    const out = [];

    // Leader and the gap to second (ties on points go to countback, as in the standings).
    const [p1, p2] = order;
    if(p1){
      const gap = p2 ? pts[p1] - pts[p2] : 0;
      out.push({ key:'leader', label:'Leader', ids:[p1], n:gap, value:plural(fmt(pts[p1]), 'pt'),
        detail: !p2 ? '' : gap > 0 ? `${plural(fmt(gap), 'pt')} ahead of ${code[p2]}` : `level with ${code[p2]}, ahead on countback` });
    }

    // Most Grand Prix wins, and how many different drivers have won.
    const w = best(wins, rank, 0);
    if(w){
      const gpCount = upto.filter(r => r.raceResults.length).length;
      out.push({ key:'wins', label:'Most wins', ids:w.ids, n:w.n, value:plural(w.n, 'win') + (w.ids.length > 1 ? ' each' : ''),
        detail:`${plural(Object.keys(wins).length, 'different winner')} in ${plural(gpCount, 'Grand Prix', 'Grands Prix')}` });
    }

    // Most podiums (a Grand Prix finish in the top 3), and how many different drivers have been on one (#102).
    const pd = best(podiums, rank, 0);
    if(pd) out.push({ key:'podiums', label:'Most podiums', ids:pd.ids, n:pd.n, value:plural(pd.n, 'podium') + (pd.ids.length > 1 ? ' each' : ''),
      detail:`${plural(Object.keys(podiums).length, 'different driver')} on the podium` });

    // Longest active points streak: rounds in a row, back from this round, with points from the Grand Prix or the
    // sprint. A round the driver wasn't in ends it.
    const streak = {};
    Object.keys(roundPts).forEach(id => {
      let s = 0;
      for(let i = upto.length - 1; i >= 0 && (roundPts[id][upto[i].round] || 0) > 0; i--) s++;
      streak[id] = s;
    });
    const st = best(streak, rank, 1);
    if(st) out.push({ key:'streak', label:'Longest points streak', ids:st.ids, n:st.n,
      value:plural(st.n, 'round') + (st.ids.length > 1 ? ' each' : ''),
      detail: st.n === upto.length ? 'every round so far' : `every round since round ${upto[upto.length - st.n].round}` });

    // Biggest climber and faller in the standings over the last 5 rounds (needs a standing 5 rounds back).
    const from = round - MOVE_SPAN;
    if(from >= 1 && upto.some(r => r.round <= from)){
      const before = {};
      F1Common.standingsOrder(seasonRounds, from, 'drivers').forEach((id, i) => { before[id] = i; });
      const up = {}, down = {};
      order.forEach(id => { if(id in before){ const d = before[id] - rank[id]; up[id] = d; down[id] = -d; } });
      [['climber', up, '▲', 'up'], ['faller', down, '▼', 'down']].forEach(([key, vals, arrow, cls]) => {
        const b = best(vals, rank, 0);
        if(!b) return;
        const id = b.ids[0];
        out.push({ key, label:`Biggest ${key}`, ids:b.ids, n:b.n,
          value:`<span class="tpMove ${cls}">${arrow}${b.n}</span>` + (b.ids.length > 1 ? ' each' : ''),
          detail:(b.ids.length === 1 ? `P${before[id] + 1} → P${rank[id] + 1} · ` : '') + `last ${MOVE_SPAN} rounds` });
      });
    }

    out.forEach(f => { f.codes = f.ids.map(id => code[id]); });
    return out;
  }
  // Stats for a set of drivers (#109, the results heat strip): most wins, podiums and not classified, and the longest
  // runs of wins, podiums and rounds with points, in Grand Prix rounds through `round`. A missed round ends a run.
  // `ids` are in the order the strip shows them; ties are listed in standings order. Zero stats are left out.
  function stats(seasonRounds, round, ids){
    const upto = (seasonRounds || []).filter(r => r.round <= round).sort((a, b) => a.round - b.round);
    if(!upto.length || !ids.length) return [];
    const order = F1Common.standingsOrder(seasonRounds, round, 'drivers'), rank = {};
    order.forEach((id, i) => { rank[id] = i; });
    const code = {}, count = { win:{}, pod:{}, nc:{} }, run = { win:{}, pod:{}, pts:{} };
    const cur = {};
    ids.forEach(id => { Object.keys(count).forEach(k => { count[k][id] = 0; }); cur[id] = { win:0, pod:0, pts:0 }; Object.keys(run).forEach(k => { run[k][id] = { n:0, to:0 }; }); });
    upto.forEach(r => {
      ids.forEach(id => {
        const gp = r.raceResults.find(x => x.driverId === id), sp = (r.sprintResults || []).find(x => x.driverId === id);
        if(gp || sp) code[id] = (gp || sp).code;
        const pos = gp ? gp.position : undefined;
        if(pos === 1) count.win[id]++;
        if(pos != null && pos <= 3) count.pod[id]++;
        if(gp && pos == null) count.nc[id]++;
        const hit = { win: pos === 1, pod: pos != null && pos <= 3, pts: ((gp ? gp.points : 0) + (sp ? sp.points : 0)) > 0 };
        Object.keys(hit).forEach(k => {
          cur[id][k] = hit[k] ? cur[id][k] + 1 : 0;
          if(cur[id][k] > run[k][id].n) run[k][id] = { n:cur[id][k], to:r.round };
        });
      });
    });
    const lastRound = upto[upto.length - 1].round, out = [];
    const add = (key, label, vals, min, unit) => {
      const b = best(vals, rank, min);
      if(b) out.push({ key, label, ids:b.ids, n:b.n, value:plural(b.n, unit[0], unit[1]) + (b.ids.length > 1 ? ' each' : ''), detail:'' });
      return b;
    };
    add('wins', 'Most wins', count.win, 0, ['win']);
    add('podiums', 'Most podiums', count.pod, 0, ['podium']);
    add('nc', 'Most not classified', count.nc, 0, ['Grand Prix', 'Grands Prix']);
    [['winStreak', 'Longest win streak', 'win'], ['podiumStreak', 'Longest podium streak', 'pod'], ['pointsStreak', 'Longest points streak', 'pts']].forEach(([key, label, k]) => {
      const lens = {}; ids.forEach(id => { lens[id] = run[k][id].n; });
      const b = add(key, label, lens, 1, ['round']);
      if(!b) return;
      const f = out[out.length - 1];
      if(b.ids.length === 1){
        const to = run[k][b.ids[0]].to;
        f.detail = `rounds ${to - b.n + 1}–${to}` + (to === lastRound && cur[b.ids[0]][k] === b.n ? ', still going' : '');
      }
    });
    out.forEach(f => { f.codes = f.ids.map(id => code[id]); });
    return out;
  }
  // "VER", "VER and NOR", "VER, NOR and LEC", "VER, NOR, LEC +2 more" — each with its flag.
  function namesHTML(ids, codes){
    const name = (id, i) => `<span class="tpName">${F1Common.flagHTML(F1Common.nationalityOf('drivers', id))}${esc(codes[i])}</span>`;
    const parts = ids.map(name);
    if(ids.length > MAX_NAMES) return parts.slice(0, MAX_NAMES).join(', ') + ` <span class="tpMore" title="${esc(codes.join(', '))}">+${ids.length - MAX_NAMES} more</span>`;
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  }

  function render(el, seasonRounds, round, list){
    if(!el) return;
    list = list || facts(seasonRounds, round);
    el.innerHTML = list.map(f => `<div class="tp" data-fact="${f.key}" data-ids="${esc(f.ids.join(','))}" data-n="${f.n}">`
      + `<div class="tpLabel">${esc(f.label)}</div>`
      + `<div class="tpValue">${namesHTML(f.ids, f.codes)} <span class="tpSep">·</span> ${f.value}</div>`
      + (f.detail ? `<div class="tpDetail">${esc(f.detail)}</div>` : '')
      + `</div>`).join('');
  }

  return { facts, stats, render };
})();
