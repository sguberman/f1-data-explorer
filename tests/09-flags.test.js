// #18: national flags and driver numbers. #30: median and mode markers on the ridgeline charts.
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
               legendFlags: document.querySelectorAll('#lg img.flag').length };
    });
    const idx = id => { const [, i, k] = id.match(/^d(\d+)_(\d)$/); return 2*(+i) + (+k); };
    const badFlag = r.rows.filter(x => x.flag !== (FLAG[DRIVER_NAT[idx(x.id)]] ? `flags/${FLAG[DRIVER_NAT[idx(x.id)]]}.svg` : null));
    t.check(`${theme}: each driver picker row shows the driver's flag (none for an unknown nationality)`, badFlag.length === 0, JSON.stringify(badFlag.slice(0,3)));
    t.check(`${theme}: picker flags load`, r.rows.every(x => x.loaded !== false));
    const badNum = r.rows.filter(x => x.num !== String(DRIVER_NUM[idx(x.id)]));
    t.check(`${theme}: each driver picker row shows the driver's number`, badNum.length === 0, JSON.stringify(badNum.slice(0,3)));
    t.check(`${theme}: team headings show the team's flag`, r.teams.length === 11 && r.teams.filter(([,f]) => f).length === 10
      && r.teams.find(([n]) => n === 'Scuderia Ferrari')[1] === 'flags/it.svg', JSON.stringify(r.teams.slice(0,3)));
    t.check(`${theme}: round label shows the circuit country's flag`, r.labelFlag === `flags/${FLAG[CIRCUITS[11]]}.svg` && /^Round 12 of 12 — Round 12 Grand Prix$/.test(r.label), `${r.labelFlag} ${r.label}`);
    t.check(`${theme}: chart legend shows flags`, r.legendFlags > 0);
    await h.setRound(p, 6);
    t.check(`${theme}: round label flag follows the slider (circuit sent as an array)`,
      await p.evaluate(() => document.querySelector('.f1c-roundlabel img.flag').getAttribute('src')) === `flags/${FLAG[CIRCUITS[5]]}.svg`);
    t.check(`${theme}: drivers: no page errors`, p.errors.length === 0, p.errors.join('; '));
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

  // #30: position page markers vs an independent median/mode of each ridge's counts.
  {
    const p = await h.openPage('position'); await h.loaded(p);
    const m = await p.evaluate(() => ridgeChart.data.datasets.filter(d => !d._baseline).map(d => ({ counts:d._counts, median:d._median, modes:d._modes })));
    const bad = m.filter(d => {
      const tot = d.counts.reduce((a,b) => a+b, 0); let c = 0, med = null;
      for(let i = 0; i < d.counts.length; i++){ c += d.counts[i]; if(c*2 >= tot){ med = i; break; } }
      const top = Math.max(...d.counts), modes = d.counts.map((v,i) => v === top ? i : -1).filter(i => i >= 0);
      return d.median !== med || JSON.stringify(d.modes) !== JSON.stringify(modes);
    });
    t.check('position: each ridge marks its median and every most-common position', m.length > 0 && bad.length === 0, JSON.stringify(bad.slice(0,2)));
    t.check('position: the fake data has a tied mode (so the check above covers ties)', m.some(d => d.modes.length > 1));
    t.check('position: marker key shown', /median.*most common/.test(await p.$eval('#ridgeKey', e => e.textContent)));
    t.check('position: ridge plugins for flags and markers attached', await p.evaluate(() => ['ridgeMarkers','ridgeFlags'].every(id => ridgeChart.config.plugins.some(pl => pl.id === id))));
    t.check('position: no page errors', p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }

  // #30: simulator medians — position = median rank bucket, points = the median total placed between bins.
  {
    const p = await h.openPage('simulator'); await h.loaded(p);
    await p.evaluate(async () => {
      document.getElementById('n').value = '2000'; document.getElementById('run').click();
      for(let i = 0; i < 100 && !/seasons simulated/.test(document.getElementById('status').textContent); i++) await new Promise(r => setTimeout(r, 100));
    });
    const s = await p.evaluate(() => {
      const ch = Chart.getChart('ridgePointsCanvas'), cp = Chart.getChart('ridgePosCanvas');
      const labels = ch.data.labels.map(Number), bin = labels[1] - labels[0];
      const pts = ch.data.datasets.filter(d => !d._baseline).map(d => {
        const id = lastRun.ids[lastRun.ids.findIndex(x => fullRoster.find(r => r.driverId === x && r.code === d._code))];
        const i = lastRun.ids.indexOf(id), v = [];
        for(let k = 0; k < lastRun.N; k++) v.push(lastRun.totals[k*lastRun.n + i]);
        v.sort((a,b) => a-b); const q = (v.length-1)/2, med = (v[Math.floor(q)] + v[Math.ceil(q)]) / 2;
        return { got:d._median, exp:(med - labels[0] - bin/2) / bin };
      });
      const pos = cp.data.datasets.filter(d => !d._baseline).map(d => {
        let c = 0, med = null; for(let i = 0; i < d._pct.length; i++){ c += d._pct[i]; if(c >= 50 - 1e-9){ med = i; break; } }
        return { got:d._median, exp:med };
      });
      return { pts, pos, keys: document.querySelectorAll('#ridgePosCard .ridgeKey, #ridgePointsCard .ridgeKey').length,
               oddsFlags: document.querySelectorAll('#odds img.flag').length, oddsRows: document.querySelectorAll('#odds .driver-row').length };
    });
    t.check('simulator: points ridges mark the median final points', s.pts.length > 0 && s.pts.every(x => Math.abs(x.got - x.exp) < 1e-6), JSON.stringify(s.pts.slice(0,2)));
    t.check('simulator: position ridges mark the median final position', s.pos.length > 0 && s.pos.every(x => x.got === x.exp), JSON.stringify(s.pos.slice(0,3)));
    t.check('simulator: median key under both ridge charts', s.keys === 2);
    t.check('simulator: win-probability rows show flags', s.oddsFlags === s.oddsRows && s.oddsRows > 0, JSON.stringify(s));
    t.check('simulator: no page errors', p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
