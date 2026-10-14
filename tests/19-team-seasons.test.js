// #72: teams from earlier seasons get that season's name and colour — Alfa Romeo and AlphaTauri (2021–23) and
// Sauber (2024–25, not "Audi") — readable in both themes. Every other team keeps its usual colour.
module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const base = await buildSnapshot(2026, fakeFetch, Date.now());
  // The fake season with older team ids: audi → alfa / sauber, rb → alphatauri.
  const as = (year, ids) => JSON.parse(JSON.stringify({ ...base, year, complete: true }), (k, v) => k === 'teamId' && ids[v] ? ids[v] : v);
  const snapshots = { 2026: base, 2024: as(2024, { audi: 'sauber' }), 2023: as(2023, { audi: 'alfa', rb: 'alphatauri' }), 2022: as(2022, { audi: 'alfa', rb: 'alphatauri' }) };
  const legend = p => p.$$eval('#lg > span', ss => Object.fromEntries(ss.map(s => [s.textContent.trim(), (s.querySelector('line')||{}).getAttribute?.('stroke')])));
  const show = async (p, year) => { await p.selectOption('.f1c-year', String(year)); await h.loaded(p); await p.click('#presetRow button[data-preset="all"]'); await p.waitForTimeout(100); return legend(p); };

  for(const theme of ['light', 'dark']){
    const p = await h.openPage('constructors', { snapshots, theme }); await h.loaded(p);
    const dark = theme === 'dark';
    let lg = await show(p, 2024);
    t.check(`${theme} 2024: Sauber is called Sauber, not Audi`, 'Sauber' in lg && !('Audi' in lg), Object.keys(lg).join(', '));
    t.check(`${theme} 2024: Sauber in Kick green`, lg.Sauber === (dark ? '#52E252' : '#399E39'), lg.Sauber);
    t.check(`${theme} 2024: other teams keep their usual colours`, lg.Ferrari === '#DC0000' && lg.McLaren === '#FF8000', JSON.stringify(lg));
    lg = await show(p, 2023);
    t.check(`${theme} 2023: Alfa Romeo and AlphaTauri by name, in their 2023 colours`,
      lg['Alfa Romeo'] === '#C92D4B' && lg.AlphaTauri === '#5E8FAA', JSON.stringify(lg));
    lg = await show(p, 2022);
    t.check(`${theme} 2022: 2022 colours (Alfa Romeo lightened for dark)`,
      lg['Alfa Romeo'] === (dark ? '#BD4157' : '#B12039') && lg.AlphaTauri === '#4E7C9B', JSON.stringify(lg));
    lg = await show(p, 2026);
    t.check(`${theme} 2026: Audi is Audi again`, lg.Audi === '#E8534D' && !('Sauber' in lg), JSON.stringify(lg));
    t.check(`${theme}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
