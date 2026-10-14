// #18: national flags and driver numbers. #30: "most common" (mode) markers on the ridgeline charts.
// Expected values come from the fixture's own tables, not the site's helpers.
const fs = require('fs'), path = require('path');
const { DRIVER_NAT, DRIVER_NUM, TEAM_NAT, CIRCUITS } = require('./lib/fixture');

// The flag each fixture name should get (null = no flag), written out by hand.
const FLAG = { British:'gb', 'Great Britain':'gb', 'United Kingdom':'gb', Italy:'it', Italian:'it', Monaco:'mc', Australian:'au',
  Netherlands:'nl', France:'fr', French:'fr', Argentina:'ar', Thailand:'th', Spanish:'es', Spain:'es', German:'de', Germany:'de',
  Brazil:'br', Canada:'ca', 'New Zealand':'nz', Finnish:'fi', Austria:'at', 'United States':'us', USA:'us', Australia:'au',
  China:'cn', Japan:'jp', Bahrain:'bh', 'Saudi Arabia':'sa', Belgium:'be', Atlantis:null };

module.exports = async (t, h) => {
  const SITE = path.join(__dirname, '..', 'site');

  // Every flag the site can ask for exists as a file.
  const codes = await (async () => { const p = await h.openPage('drivers'); await h.loaded(p); const c = await p.evaluate(() => {
    const names = ['Great Britain','british','Netherlands','dutch','United States','american','Monaco','Saudi Arabia','New Zealand','Abu Dhabi','Atlantis',''];
    return { mapped: names.map(n => F1Common.flagCode(n)) }; }); await p.done(); return c; })();
  t.check('nationality names and demonyms map to flags (unknown → none)',
    JSON.stringify(codes.mapped) === JSON.stringify(['gb','gb','nl','nl','us','us','mc','sa','nz','ae',null,null]), JSON.stringify(codes.mapped));
  const missing = Object.values(FLAG).filter(Boolean).concat(['ae','az','hu','mx','qa','sg','tr','pt','ru','ch','dk','pl','in'])
    .filter(c => !fs.existsSync(path.join(SITE, 'flags', c + '.svg')));
  t.check('a flag file exists for every country the site maps', missing.length === 0, missing.join(','));

  for(const theme of ['light', 'dark']){
    const p = await h.openPage('drivers', {theme}); await h.loaded(p);
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#driverPicker .pickerRow')].map(row => {
        const img = row.querySelector('.pickerCode img.flag');
        return { id:row.querySelector('input').dataset.id, flag: img ? img.getAttribute('src') : null,
                 loaded: img ? img.complete && img.naturalWidth > 0 : null, num: row.querySelector('.pickerNum').textContent };
      });
      const teams = [...document.querySelectorAll('#driverPicker .pickerTeamLabel')].map(el => {
        const img = el.querySelector('img.flag'); return [el.textContent.trim(), img ? img.getAttribute('src') : null]; });
      const lab = document.querySelector('.f1c-roundlabel'), limg = lab.querySelector('img.flag');
      return { rows, teams, label: lab.textContent, labelFlag: limg ? limg.getAttribute('src') : null,
               legendFlags: document.querySelectorAll('#lg img.flag').length, legendText: document.getElementById('lg').textContent };
    });
    const idx = id => { const [, i, k] = id.match(/^d(\d+)_(\d)$/); return 2*(+i) + (+k); };
    const badFlag = r.rows.filter(x => x.flag !== (FLAG[DRIVER_NAT[idx(x.id)]] ? `flags/${FLAG[DRIVER_NAT[idx(x.id)]]}.svg` : null));
    t.check(`${theme}: each driver picker row shows the driver's flag (none for an unknown nationality)`, badFlag.length === 0, JSON.stringify(badFlag.slice(0,3)));
    t.check(`${theme}: picker flags load`, r.rows.every(x => x.loaded !== false));
    const badNum = r.rows.filter(x => x.num !== String(DRIVER_NUM[idx(x.id)]));
    t.check(`${theme}: each driver picker row shows the driver's number`, badNum.length === 0, JSON.stringify(badNum.slice(0,3)));
    // #70: team headings in driver pickers are just the name — team flags only on constructor views.
    t.check(`${theme}: team headings show the team name without a flag`, r.teams.length === 11 && r.teams.every(([, f]) => f === null)
      && r.teams.some(([n]) => n === 'Scuderia Ferrari'), JSON.stringify(r.teams.slice(0,3)));
    t.check(`${theme}: round label shows the circuit country's flag`, r.labelFlag === `flags/${FLAG[CIRCUITS[11]]}.svg` && /^Round 12 of 12 — Round 12 Grand Prix$/.test(r.label), `${r.labelFlag} ${r.label}`);
    t.check(`${theme}: chart legend shows each driver's flag and no team names (#70)`, r.legendFlags > 0
      && !/Mercedes|Ferrari|McLaren|Red Bull/.test(r.legendText) && /Knockout line/.test(r.legendText), r.legendText);
    await h.setRound(p, 6);
    t.check(`${theme}: round label flag follows the slider (circuit sent as an array)`,
      await p.evaluate(() => document.querySelector('.f1c-roundlabel img.flag').getAttribute('src')) === `flags/${FLAG[CIRCUITS[5]]}.svg`);
    t.check(`${theme}: drivers: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }

  // #70: the other driver pickers' team headings have no flag either; constructor pickers keep theirs (below).
  for(const name of ['position', 'simulator']){
    const p = await h.openPage(name); await h.loaded(p);
    const heads = await p.$$eval('.pickerTeamLabel', els => els.map(e => [e.textContent.trim(), !!e.querySelector('img.flag')]));
    t.check(`${name}: driver picker team headings have no flag`, heads.length === 11 && heads.every(([n, f]) => n && !f), JSON.stringify(heads.slice(0,2)));
    await p.done();
  }

  // Constructors picker rows get the team flag.
  {
    const p = await h.openPage('constructors'); await h.loaded(p);
    const rows = await p.$$eval('#teamPicker .pickerRow', rs => rs.map(r => [r.querySelector('input').dataset.id, (r.querySelector('img.flag')||{}).getAttribute ? r.querySelector('img.flag').getAttribute('src') : null]));
    const TEAMS = ['mercedes','ferrari','mclaren','red_bull','alpine','haas','williams','audi','aston_martin','rb','mystery_gp'];
    const bad = rows.filter(([id, f]) => f !== (FLAG[TEAM_NAT[TEAMS.indexOf(id)]] ? `flags/${FLAG[TEAM_NAT[TEAMS.indexOf(id)]]}.svg` : null));
    t.check('constructors: team picker rows show the team flag', rows.length === 11 && bad.length === 0, JSON.stringify(bad));
    await p.done();
  }

  // #30: position page "most common" markers, from an independent count over individual positions.
  {
    const p = await h.openPage('position'); await h.loaded(p);
    await p.click('#presetRow button[data-preset="all"]');
    const read = () => p.evaluate(() => {
      const codeToId = {};
      F1Controls.state.seasonRounds.forEach(r => r.raceResults.forEach(q => { codeToId[q.code] = q.driverId; }));
      return { labels: ridgeChart.data.labels, rows: ridgeChart.data.datasets.filter(d => !d._baseline)
        .map(d => ({ id:codeToId[d._code], counts:d._counts, modes:d._modes, labels:d._modeLabels, median:d._median })) };
    });
    // Expected: each driver's finishes through the last round, GP + sprint, one category per classified
    // position plus NC (no classified position, #46); every tied most-common one.
    const expected = () => p.evaluate(() => {
      const rs = F1Controls.state.seasonRounds, per = {}; let worst = 10;
      rs.forEach(r => [...r.raceResults, ...(r.sprintResults||[])].forEach(q => {
        const k = q.position >= 1 ? 'P' + q.position : 'NC';
        if(q.position > worst) worst = q.position;
        (per[q.driverId] = per[q.driverId] || {})[k] = (per[q.driverId][k] || 0) + 1;
      }));
      const order = []; for(let i = 1; i <= worst; i++) order.push('P' + i); order.push('NC');
      const out = {};
      Object.entries(per).forEach(([id, c]) => { const top = Math.max(...Object.values(c)); out[id] = order.filter(k => c[k] === top); });
      return out;
    });
    const exp = await expected();
    let r = await read();
    const shownAs = m => m === 'NC' || +m.slice(1) > 10 ? 10 : +m.slice(1) - 1; // grouped view: 11+ and NC share the last bucket
    const bad = r.rows.filter(d => {
      const want = [...new Set(exp[d.id].map(shownAs))];
      const lab = exp[d.id].filter(m => shownAs(m) === 10).join('/');
      return JSON.stringify(d.modes) !== JSON.stringify(want) || (d.labels[10] || '') !== lab;
    });
    t.check('position: markers sit on every most common finish (grouped view)', r.rows.length === 22 && bad.length === 0, JSON.stringify(bad.slice(0,2)));
    t.check('position: no median markers', r.rows.every(d => d.median === undefined));
    t.check('position: the fake data has a tied mode and a mode below P10 (so the checks cover them)',
      Object.values(exp).some(m => m.length > 1) && Object.values(exp).some(m => m.some(x => shownAs(x) === 10)));
    // e.g. a driver with 8 finishes spread over P11–P20 but 2 at P6: the grouped bucket is tallest, yet P6 is most common
    t.check('position: the grouped 11+/NC bucket never wins just for being a group (case present in fake data)',
      r.rows.some(d => d.counts[10] > Math.max(...d.counts.slice(0,10)) && d.modes.some(i => i < 10)));
    const rank = await p.evaluate(() => F1Common.standingsOrder(F1Controls.state.seasonRounds, L, 'drivers'));
    const key = m => m === 'NC' ? 999 : +m.slice(1);
    const wantOrder = Object.keys(exp).sort((a,b) => key(exp[a][0]) - key(exp[b][0]) || rank.indexOf(a) - rank.indexOf(b));
    t.check('position: sorted by most common finish (default), ties by standings', JSON.stringify(r.rows.map(d => d.id)) === JSON.stringify(wantOrder),
      JSON.stringify([r.rows.map(d => d.id).slice(0,5), wantOrder.slice(0,5)]));
    t.check('position: sort dropdown offers Most common (no Median)', await p.$eval('#chartSortSelect', el => [...el.options].map(o => o.textContent).join(',')) === 'Most common,Championship,Team');
    // Below P10 shown: markers on the real positions, no labels needed.
    await p.check('#chartOptRow input[data-opt="below10"]');
    r = await read();
    const bad2 = r.rows.filter(d => JSON.stringify(d.modes.map(i => r.labels[i])) !== JSON.stringify(exp[d.id]) || Object.keys(d.labels).length);
    t.check('position: with Below P10 shown, markers sit on the real positions', bad2.length === 0, JSON.stringify(bad2.slice(0,2)));
    t.check('position: marker key shown', /most common/.test(await p.$eval('#ridgeKey', e => e.textContent)));
    t.check('position: ridge plugins for flags and markers attached', await p.evaluate(() => ['ridgeMarkers','ridgeFlags'].every(id => ridgeChart.config.plugins.some(pl => pl.id === id))));
    t.check('position: no page errors', p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }

  // #30: simulator "most common" markers — exact rank for the position chart, 10-point bin + exact total for points.
  {
    const p = await h.openPage('simulator'); await h.loaded(p);
    await p.evaluate(async () => {
      document.getElementById('n').value = '2000'; document.getElementById('run').click();
      for(let i = 0; i < 100 && !/seasons simulated/.test(document.getElementById('status').textContent); i++) await new Promise(r => setTimeout(r, 100));
    });
    const s = await p.evaluate(() => {
      const codeToId = {}; fullRoster.forEach(d => { codeToId[d.code] = d.driverId; });
      const series = id => { const i = lastRun.ids.indexOf(id), v = []; for(let k = 0; k < lastRun.N; k++) v.push([lastRun.totals[k*lastRun.n+i], lastRun.ranks[k*lastRun.n+i]]); return v; };
      const k = selectedDriverIds.length;
      const ch = Chart.getChart('ridgePointsCanvas'), cp = Chart.getChart('ridgePosCanvas');
      const min = +ch.data.labels[0], nb = ch.data.labels.length;
      const pts = ch.data.datasets.filter(d => !d._baseline).map(d => {
        const v = series(codeToId[d._code]).map(x => x[0]), bins = new Array(nb).fill(0);
        v.forEach(x => bins[Math.min(Math.floor((x-min)/10), nb-1)]++);
        const top = Math.max(...bins), modes = bins.map((c,i) => c === top ? i : -1).filter(i => i >= 0), labels = {};
        modes.forEach(bi => { const f = {}; v.forEach(x => { if(Math.min(Math.floor((x-min)/10), nb-1) === bi) f[x] = (f[x]||0) + 1; });
          labels[bi] = String(Math.round(+Object.keys(f).sort((a,b) => f[b]-f[a] || a-b)[0])); });
        return { ok: JSON.stringify(d._modes) === JSON.stringify(modes) && JSON.stringify(d._modeLabels) === JSON.stringify(labels),
                 best: Math.max(...modes.map(bi => +labels[bi])), got:[d._modes, d._modeLabels], want:[modes, labels], median:d._median };
      });
      const pos = cp.data.datasets.filter(d => !d._baseline).map(d => {
        const rc = {}; series(codeToId[d._code]).forEach(x => { rc[x[1]] = (rc[x[1]]||0) + 1; });
        const top = Math.max(...Object.values(rc)), ranks = Object.keys(rc).map(Number).filter(r => rc[r] === top).sort((a,b) => a-b);
        const modes = [...new Set(ranks.map(r => r <= k ? r-1 : k))], labels = {};
        ranks.filter(r => r > k).forEach(r => { labels[k] = labels[k] ? labels[k] + '/P' + r : 'P' + r; });
        return { ok: JSON.stringify(d._modes) === JSON.stringify(modes) && JSON.stringify(d._modeLabels) === JSON.stringify(labels), best: ranks[0], got:[d._modes, d._modeLabels], want:[modes, labels] };
      });
      return { pts, pos, keys: [...document.querySelectorAll('#ridgePosCard .ridgeKey, #ridgePointsCard .ridgeKey')].map(e => e.textContent),
               oddsFlags: document.querySelectorAll('#odds img.flag').length, oddsRows: document.querySelectorAll('#odds .driver-row').length };
    });
    t.check('simulator: points ridges mark the most common 10-point range, labelled with the most common total in it', s.pts.length > 0 && s.pts.every(x => x.ok), JSON.stringify(s.pts.filter(x => !x.ok).slice(0,2)));
    t.check('simulator: points ridges sorted by most common points, highest first', s.pts.every((x,i) => i === 0 || s.pts[i-1].best >= x.best), JSON.stringify(s.pts.map(x => x.best)));
    t.check('simulator: position ridges mark the most common exact finish', s.pos.length > 0 && s.pos.every(x => x.ok), JSON.stringify(s.pos.filter(x => !x.ok).slice(0,2)));
    t.check('simulator: position ridges sorted by most common finish, best first', s.pos.every((x,i) => i === 0 || s.pos[i-1].best <= x.best), JSON.stringify(s.pos.map(x => x.best)));
    t.check('simulator: no median markers', s.pts.every(x => x.median === undefined));
    t.check('simulator: most-common key under both ridge charts', s.keys.length === 2 && s.keys.every(k => /most common/.test(k)), JSON.stringify(s.keys));
    t.check('simulator: win-probability rows show flags', s.oddsFlags === s.oddsRows && s.oddsRows > 0, JSON.stringify(s));
    // Track more drivers than the default so some most-common finishes can fall outside the top k... and fewer so they must.
    const few = await p.evaluate(() => {
      document.querySelector('#presetRow button[data-preset="5"]') ? document.querySelector('#presetRow button[data-preset="5"]').click() : null;
      const cp = Chart.getChart('ridgePosCanvas');
      return cp.data.datasets.filter(d => !d._baseline).map(d => d._modeLabels);
    });
    t.check('simulator: tracking 5 still draws markers with labels only on the last column', few.every(l => Object.keys(l).every(k => +k === 5)), JSON.stringify(few));
    t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
