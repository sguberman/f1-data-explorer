// #62: every data page has a link home and a Pages menu to every other page; the season chosen on one page
// is kept on the next.
module.exports = async (t, h) => {
  const { buildSnapshot } = await import('../tools/snapshot.mjs');
  const { api } = require('./lib/fixture');
  const fakeFetch = async url => { const r = api(url); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; };
  const full = await buildSnapshot(2026, fakeFetch, Date.now());
  const snapshots = { 2026: full, 2025: { ...full, year: 2025, complete: true } };
  const PAGES = { drivers:"Drivers' Championship", constructors:"Constructors' Championship", position:'Race Finishing Positions',
    simulator:'Title Simulator', whatif:'What-If Results' };

  for(const [name, title] of Object.entries(PAGES)){
    const p = await h.openPage(name, { snapshots }); await h.loaded(p);
    const nav = await p.evaluate(() => ({
      home: document.querySelector('#siteNav .nav-home')?.getAttribute('href'),
      label: document.querySelector('#siteNav .nav-current')?.textContent,
      links: [...document.querySelectorAll('#siteNav .nav-menu a')].map(a => [a.getAttribute('href'), a.textContent, a.getAttribute('aria-current')]),
      hidden: document.querySelector('#siteNav .nav-menu')?.hidden,
    }));
    t.check(`${name}: link home`, nav.home === 'index.html', nav.home);
    t.check(`${name}: Pages menu names the current page`, nav.label === title, nav.label);
    t.check(`${name}: menu lists all five pages, current one marked`,
      JSON.stringify(nav.links.map(l => l[0])) === JSON.stringify(Object.keys(PAGES).map(n => n + '.html')) &&
      nav.links.filter(l => l[2] === 'page').map(l => l[0]).join() === name + '.html', JSON.stringify(nav.links));
    t.check(`${name}: menu starts closed`, nav.hidden === true);
    t.check(`${name}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }

  // Menu behaviour, and the season carried from page to page.
  const p = await h.openPage('drivers', { snapshots }); await h.loaded(p);
  await p.click('#siteNav .nav-trigger');
  t.check('clicking Pages opens the menu', !(await p.$eval('#siteNav .nav-menu', m => m.hidden)));
  t.check('every page name fits inside the open menu', await p.$$eval('#siteNav .nav-menu a', as => as.every(a => a.scrollWidth <= a.clientWidth + 1)));
  t.check('…and focuses the current page', await p.evaluate(() => document.activeElement?.getAttribute('aria-current') === 'page'));
  await p.keyboard.press('ArrowDown');
  t.check('arrow keys move through the pages', await p.evaluate(() => document.activeElement?.getAttribute('href')) === 'constructors.html');
  await p.keyboard.press('Escape');
  t.check('Escape closes it', await p.$eval('#siteNav .nav-menu', m => m.hidden));
  await p.click('#siteNav .nav-trigger'); await p.click('h1');
  t.check('clicking elsewhere closes it', await p.$eval('#siteNav .nav-menu', m => m.hidden));
  const themeMenuOk = await p.$eval('#themeToggle .theme-trigger', b => !!b);
  t.check('theme menu still there', themeMenuOk);

  await p.selectOption('.f1c-year', '2025'); await h.loaded(p);
  await p.click('#siteNav .nav-trigger'); await p.click('#siteNav .nav-menu a[href="constructors.html"]');
  await h.loaded(p);
  t.check('Pages menu goes to that page', /constructors\.html$/.test(p.url()), p.url());
  t.check('…keeping the chosen season (2025)', await p.evaluate(() => F1Controls.state.year) === 2025 && await p.$eval('.f1c-year', s => s.value) === '2025');
  await p.click('#siteNav .nav-home');
  await p.waitForURL(/index\.html$/);
  t.check('the home link goes to the homepage', /index\.html$/.test(p.url()), p.url());
  await p.click('a.card[href="simulator.html"]'); await h.loaded(p);
  t.check('going via the homepage also keeps the season', await p.evaluate(() => F1Controls.state.year) === 2025);
  await p.selectOption('.f1c-year', '2026'); await h.loaded(p);
  await p.goto('http://site.test/whatif.html'); await h.loaded(p);
  t.check('switching back to 2026 is kept too', await p.evaluate(() => F1Controls.state.year) === 2026);
  await p.evaluate(() => localStorage.setItem('f1cache:selectedSeason', '1999'));
  await p.goto('http://site.test/drivers.html'); await h.loaded(p);
  t.check('an unknown saved season falls back to the newest', await p.evaluate(() => F1Controls.state.year) === 2026);
  t.check('navigation: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();

  // Phone: one row, short "Pages" label, nothing overflows; and the homepage has no menu.
  for(const theme of ['light', 'dark']){
    const m = await h.openPage('constructors', { snapshots, width: 390, theme }); await h.loaded(m);
    const r = await m.evaluate(() => {
      const box = s => document.querySelector(s).getBoundingClientRect();
      const home = box('#siteNav .nav-home'), pages = box('#siteNav .nav-trigger'), th = box('#themeToggle .theme-trigger');
      return { oneRow: Math.abs(home.top - th.top) < 12 && Math.abs(pages.top - th.top) < 4, right: th.right, scroll: document.documentElement.scrollWidth,
        label: getComputedStyle(document.querySelector('#siteNav .nav-short')).display !== 'none' && getComputedStyle(document.querySelector('#siteNav .nav-current')).display === 'none' };
    });
    t.check(`phone ${theme}: home, Pages and theme on one row`, r.oneRow, JSON.stringify(r));
    t.check(`phone ${theme}: no horizontal scroll`, r.scroll <= 390 && r.right <= 390, JSON.stringify(r));
    t.check(`phone ${theme}: menu button reads "Pages"`, r.label);
    await m.click('#siteNav .nav-trigger');
    const menu = await m.$eval('#siteNav .nav-menu', e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right }; });
    t.check(`phone ${theme}: open menu fits on screen`, menu.left >= 0 && menu.right <= 390, JSON.stringify(menu));
    await h.screenshot(m, `nav-phone-${theme}.png`);
    await m.done();
  }
  const idx = await h.openPage('index');
  t.check('homepage: no Pages menu (its cards are the menu)', !(await idx.$('#siteNav')));
  t.check('homepage: theme menu still on the right', await idx.evaluate(() => document.querySelector('#themeToggle .theme-trigger').getBoundingClientRect().right > 900));
  await idx.done();
};
