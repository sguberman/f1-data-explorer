// #132: the round slider floats at the top of every page that has one (as the simulator's did since #112), shrinking
// to just the slider once scrolled. Moving it never fetches.
module.exports = async (t, h) => {
  for(const theme of ['light', 'dark']) for(const [width, label] of [[1000, 'desktop'], [390, 'phone']]) for(const name of ['drivers', 'constructors', 'position', 'simulator', 'whatif']){
    const p = await h.openPage(name, { theme, width }); await h.loaded(p);
    const at = `${name} ${theme} ${label}`;
    const hits = p.apiHits.length;
    t.check(`${at}: starts expanded`, await p.evaluate(() => !document.getElementById('f1controls').classList.contains('compact')));
    await p.evaluate(() => { const f = document.createElement('div'); f.style.height = '2000px'; document.querySelector('.wrap').appendChild(f); }); // enough page to scroll, even before a simulator run
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(150);
    const s = await p.evaluate(() => { const c = document.getElementById('f1controls'), r = document.querySelector('.f1c-round').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, compact: c.classList.contains('compact'), year: getComputedStyle(document.querySelector('.f1c-row')).display }; });
    t.check(`${at}: the slider stays at the top while scrolled, with the season row folded away`, s.top >= 0 && s.bottom < 200 && s.compact && s.year === 'none', JSON.stringify(s));
    await h.setRound(p, (await p.evaluate(() => F1Controls.state.round)) - 1); await p.waitForTimeout(100);
    if(theme === 'light' || label === 'phone') await h.screenshot(p, `38-floating-${name}-${theme}-${label}.png`);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
    t.check(`${at}: expands again at the top`, await p.evaluate(() => !document.getElementById('f1controls').classList.contains('compact')));
    t.check(`${at}: the slider never fetches`, p.apiHits.length === hits, p.apiHits.slice(hits).join(' '));
    t.check(`${at}: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
