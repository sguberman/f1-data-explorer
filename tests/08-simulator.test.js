// The simulator's season model. issue #39: drivers on auto retire at their own DNF rate this season
// (any cause); the finishing-position data the race orders are drawn from only covers races a driver
// finished. #42: tracked drivers start on auto and can be set to an exact number of DNFs. #14: exact
// wins. #11: collisions retire both drivers from the same Grand Prix. #17: results survive changes.
module.exports = async (t, h) => {
  const p = await h.openPage('simulator'); await h.loaded(p);
  const hitsAfterLoad = p.apiHits.length;

  // DNF rate and finish histogram vs an independent calculation from the raw results.
  const r = await p.evaluate(() => {
    const exp = {};
    F1Controls.state.seasonRounds.filter(x => x.round <= L).forEach(x => x.raceResults.forEach(q => {
      const e = exp[q.driverId] = exp[q.driverId] || {starts:0, dnfs:0, finishes:0};
      e.starts++;
      if(Number.isFinite(q.position) && q.position >= 1) e.finishes++; else e.dnfs++;
    }));
    return fullRoster.map(d => ({ id:d.driverId, rate:d.dnfRate, histTotal:d.posHist.reduce((a,b)=>a+b,0), exp:exp[d.driverId] }));
  });
  const badRate = r.filter(d => Math.abs(d.rate - d.exp.dnfs / d.exp.starts) > 1e-9);
  t.check('DNF rate = results with no classified position / Grand Prix starts (#46)', badRate.length === 0, JSON.stringify(badRate.slice(0,2)));
  const badHist = r.filter(d => d.histTotal !== d.exp.finishes);
  t.check('finishing-position data counts only finished races', badHist.length === 0, JSON.stringify(badHist.slice(0,2)));
  t.check('the fake season has unclassified results (so the checks above mean something)', r.some(d => d.exp.dnfs > 0 && d.rate > 0));

  // The settings card: every tracked driver starts on auto for both DNFs and wins.
  const ui = await p.evaluate(() => ({
    rows: document.querySelectorAll('#outcomeGrid .oc-item').length,
    tracked: selectedDriverIds.length,
    vals: [...document.querySelectorAll('#outcomeGrid .val')].map(v => v.textContent),
    autoClass: [...document.querySelectorAll('#outcomeGrid .val')].every(v => v.classList.contains('auto')),
  }));
  t.check('one settings row per tracked driver', ui.rows === ui.tracked && ui.rows > 0, JSON.stringify(ui));
  t.check('DNFs and wins default to auto', ui.vals.length === 2*ui.rows && ui.vals.every(v => v === 'auto') && ui.autoClass, ui.vals.join(','));

  // Stepper behaviour: from auto, − → 0, + → 1; − at 0 → auto. Reset buttons.
  const st = await p.evaluate(() => {
    const id = selectedDriverIds[0];
    const btn = (kind, dir) => document.querySelector(`#outcomeGrid button[data-kind="${kind}"][data-key="${id}"][data-dir="${dir}"]`);
    const val = kind => document.querySelector(`#outcomeGrid .val[data-kind="${kind}"][data-key="${id}"]`).textContent;
    const out = {};
    btn('dnf',-1).click(); out.minusFromAuto = val('dnf');
    btn('dnf',-1).click(); out.minusFromZero = val('dnf');
    btn('dnf',1).click(); out.plus = val('dnf');
    btn('dnf',-1).click(); out.zero = val('dnf');
    btn('dnf',-1).click(); out.backToAuto = val('dnf');
    btn('win',1).click(); btn('win',1).click(); out.wins = val('win');
    document.getElementById('resetZero').click();
    out.afterZero = selectedDriverIds.map(x => [outcomes[x].dnf, outcomes[x].win]);
    out.zeroShown = [...document.querySelectorAll('#outcomeGrid .val')].map(v => v.textContent);
    document.getElementById('resetAuto').click();
    out.afterAuto = [...document.querySelectorAll('#outcomeGrid .val')].map(v => v.textContent);
    return out;
  });
  t.check('steppers: + from auto is 1, − to 0, − again back to auto', st.plus === '1' && st.zero === '0' && st.backToAuto === 'auto', JSON.stringify(st));
  t.check('steppers: − from auto is 0, and − at 0 goes back to auto', st.minusFromAuto === '0' && st.minusFromZero === 'auto', JSON.stringify(st));
  t.check('Reset all to 0 sets every DNF and win to 0', st.afterZero.every(([d,w]) => d === 0 && w === 0) && st.zeroShown.every(v => v === '0'), JSON.stringify(st));
  t.check('Reset all to auto puts everything back on auto', st.afterAuto.every(v => v === 'auto'));

  // Season plans: exact counts are honoured, auto follows the real rate, collisions retire both drivers.
  const s = await p.evaluate(() => {
    const ids = [...selectedDriverIds];
    const idx = id => fullRoster.findIndex(d => d.driverId === id);
    const autoId = fullRoster.filter(d => !ids.includes(d.driverId)).sort((a,b)=>b.dnfRate-a.dnfRate)[0].driverId;
    const [a, b, c] = ids;
    outcomes = { [a]:{dnf:2, win:2}, [b]:{dnf:0, win:0}, [c]:{dnf:null, win:1} };
    collisions = [{a:b, b:autoId, n:1}];
    const ctx = buildSimContext();
    const out = { E:ctx.E, nGP:ctx.gpIdx.length, aDnf:[], aWins:[], bDnf:[], bWins:0, cWins:[], cOutInWin:0,
                  colSame:0, colAll:0, autoOut:0, autoRate:fullRoster[idx(autoId)].dnfRate, autoFree:0, gpNoWinner:0, aWinGps:0 };
    const T = 3000;
    for(let k = 0; k < T; k++){
      const { plan, orders } = simulateSeason(ctx, true);
      const ia = idx(a), ib = idx(b), ic = idx(c), iu = idx(autoId);
      out.aDnf.push(plan.out[ia].size);
      out.bDnf.push(plan.out[ib].size);
      let aw = 0, cw = 0;
      ctx.events.forEach((e, ei) => {
        if(e.type !== 'gp') return;
        const w = orders[ei][0];
        if(w === ia) aw++; if(w === ic) cw++; if(w === ib) out.bWins++;
        if(plan.winnerOf[ei] === ic && plan.out[ic].has(ei)) out.cOutInWin++;
      });
      out.aWins.push(aw); out.cWins.push(cw);
      // the collision GP: both b and the auto driver are out of it
      const both = ctx.gpIdx.filter(ei => plan.out[ib].has(ei) && plan.out[iu].has(ei));
      if(both.length >= 1) out.colSame++;
      out.autoOut += plan.out[iu].size - 1; // minus the collision
      out.autoFree += ctx.E - 1;
    }
    out.aDnf = [...new Set(out.aDnf)]; out.aWins = [...new Set(out.aWins)]; out.cWins = [...new Set(out.cWins)];
    out.bDnf = [...new Set(out.bDnf)];
    out.autoSim = out.autoOut / out.autoFree;
    out.T = T;
    return out;
  });
  t.check('a driver set to 2 wins wins exactly 2 Grands Prix', s.aWins.length === 1 && s.aWins[0] === 2, JSON.stringify(s.aWins));
  t.check('a driver set to 2 DNFs retires from exactly 2 events', s.aDnf.length === 1 && s.aDnf[0] === 2, JSON.stringify(s.aDnf));
  t.check('a driver set to 0 wins never wins', s.bWins === 0);
  t.check('collisions add to set DNFs (0 DNFs + 1 collision = 1 retirement)', s.bDnf.length === 1 && s.bDnf[0] === 1, JSON.stringify(s.bDnf));
  t.check('a driver on auto DNFs with 1 set win wins exactly 1 GP and never retires from it', s.cWins.length === 1 && s.cWins[0] === 1 && s.cOutInWin === 0, JSON.stringify(s.cWins));
  t.check('both colliding drivers retire from the same Grand Prix', s.colSame === s.T, `${s.colSame} of ${s.T}`);
  t.check('a driver on auto retires at about their DNF rate', Math.abs(s.autoSim - s.autoRate) < 0.02,
    `simulated ${s.autoSim.toFixed(3)} vs actual ${s.autoRate.toFixed(3)}`);

  // Limits: wins can't add up to more than the Grands Prix left.
  const lim = await p.evaluate(() => {
    document.getElementById('resetAuto').click(); collisions = []; buildOutcomeInputs();
    const nGP = nGPLeft(), ids = selectedDriverIds;
    const plus = id => document.querySelector(`#outcomeGrid button[data-kind="win"][data-key="${id}"][data-dir="1"]`);
    for(let i = 0; i < nGP + 3; i++) if(!plus(ids[0]).disabled) plus(ids[0]).click();
    const first = outcomes[ids[0]].win;
    return { nGP, first, othersDisabled: ids.slice(1).every(id => plus(id).disabled) };
  });
  t.check('wins stop at the number of Grands Prix left', lim.first === lim.nGP, JSON.stringify(lim));
  t.check('once all Grands Prix have a winner, nobody else can be set to win one', lim.othersDisabled);

  // Collisions UI: add one, pick the same driver twice → warned and ignored.
  const col = await p.evaluate(() => {
    document.getElementById('resetAuto').click();
    document.getElementById('addCollision').click();
    const row = document.querySelector('#collisionList .col-row');
    const [sa, sb] = row.querySelectorAll('select');
    const out = { rows: document.querySelectorAll('#collisionList .col-row').length, differs: sa.value !== sb.value, valid1: validCollisions().length };
    sb.value = sa.value; sb.dispatchEvent(new Event('change', {bubbles:true}));
    out.warn = !row.querySelector('.col-warn').hidden; out.valid2 = validCollisions().length;
    row.querySelector('.col-x').click();
    out.after = document.querySelectorAll('#collisionList .col-row').length;
    return out;
  });
  t.check('+ Add a collision adds a row with two different drivers', col.rows === 1 && col.differs && col.valid1 === 1, JSON.stringify(col));
  t.check('a collision of a driver with themself is flagged and ignored', col.warn && col.valid2 === 0);
  t.check('× removes a collision', col.after === 0);

  // End to end: a tracked driver set to retire from every remaining event can't add any points.
  const run = async () => p.evaluate(async () => {
    document.getElementById('status').textContent = '';
    document.getElementById('n').value = '2000';
    document.getElementById('run').click();
    for(let i = 0; i < 100 && !/seasons simulated/.test(document.getElementById('status').textContent); i++)
      await new Promise(res => setTimeout(res, 100));
  });
  const d = await p.evaluate(() => {
    const d = trackedRoster()[1];
    outcomes = { [d.driverId]:{dnf:remainingEvents.length, win:null} }; buildOutcomeInputs();
    return { id:d.driverId, now:d.now };
  });
  await run();
  const e2e = await p.evaluate(id => {
    const i = lastRun.ids.indexOf(id), vals = new Set();
    for(let s = 0; s < lastRun.N; s++) vals.add(lastRun.totals[s*lastRun.n + i]);
    return { finals:[...vals], status:document.getElementById('status').textContent, stale:!document.getElementById('staleNote').hidden };
  }, d.id);
  t.check('a tracked driver retiring from every event keeps their current points', e2e.finals.length === 1 && e2e.finals[0] === d.now, JSON.stringify(e2e));
  t.check('status says how many seasons were simulated', /2,000 seasons simulated/.test(e2e.status), e2e.status);
  t.check('fresh results are not marked out of date', !e2e.stale);

  // #17: changing the tracked set redraws the same run (no re-run); changing settings marks it out of date.
  const r17 = await p.evaluate(() => {
    const run0 = lastRun;
    const rows = () => document.querySelectorAll('#odds .driver-row').length;
    const before = rows();
    document.querySelector('#presetRow button[data-preset="all"]').click();
    const out = { before, afterAll: rows(), all: fullRoster.length, sameRun: lastRun === run0,
                  shown: document.getElementById('oddsCard').style.display, staleAfterTrack: !document.getElementById('staleNote').hidden };
    document.querySelector('#outcomeGrid button[data-kind="win"][data-dir="1"]').click();
    out.staleAfterWin = !document.getElementById('staleNote').hidden;
    out.stillShown = document.getElementById('oddsCard').style.display;
    return out;
  });
  t.check('tracking more drivers redraws the last run for them without re-running', r17.sameRun && r17.afterAll === r17.all && r17.afterAll > r17.before && r17.shown === 'block', JSON.stringify(r17));
  t.check('changing the tracked set alone keeps results current', !r17.staleAfterTrack);
  t.check('changing a setting keeps the results but marks them out of date', r17.staleAfterWin && r17.stillShown === 'block');
  await p.click('#rerun');
  await p.waitForFunction(() => /seasons simulated/.test(document.getElementById('status').textContent));
  t.check('Run again clears the out-of-date note', await p.evaluate(() => document.getElementById('staleNote').hidden));
  await h.setRound(p, (await p.evaluate(() => L)) - 1);
  t.check('moving the round marks results out of date', await p.evaluate(() => !document.getElementById('staleNote').hidden && document.getElementById('oddsCard').style.display === 'block'));
  t.check('settings, runs and tracked-set changes never fetch', p.apiHits.length === hitsAfterLoad, p.apiHits.slice(hitsAfterLoad).join(' '));
  t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
