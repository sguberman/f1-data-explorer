// #50: the homepage lists the pages as vertical cards, each with a picture of that page's main chart.
module.exports = async (t, h) => {
  for(const [width, theme] of [[1000,'light'], [390,'dark']]){
    const p = await h.openPage('index', {width, theme}); await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('a.card')];
      const boxes = cards.map(c => c.getBoundingClientRect());
      return {
        hrefs: cards.map(c => c.getAttribute('href')),
        pictures: cards.map(c => !!c.querySelector('.thumb svg.pv')),
        stacked: boxes.every((b, i) => i === 0 || b.top >= boxes[i-1].bottom - 1),
        sameLeft: boxes.every(b => Math.abs(b.left - boxes[0].left) < 1),
        scroll: document.documentElement.scrollWidth,
        // the picture recolours with the theme (Red Bull navy is lightened in dark)
        c4: getComputedStyle(document.querySelector('.pv')).getPropertyValue('--c4').trim(),
      };
    });
    t.check(`${theme} ${width}px: cards in order drivers, constructors, positions, simulator, what-if`,
      JSON.stringify(r.hrefs) === JSON.stringify(['drivers.html','constructors.html','position.html','simulator.html','whatif.html']), r.hrefs.join(','));
    t.check(`${theme} ${width}px: every card has a chart picture`, r.pictures.every(Boolean));
    t.check(`${theme} ${width}px: cards are laid out vertically, one per row`, r.stacked && r.sameLeft);
    t.check(`${theme} ${width}px: no horizontal scroll`, r.scroll <= width);
    t.check(`${theme} ${width}px: picture colours follow the theme`, r.c4.toLowerCase() === (theme === 'dark' ? '#6a86f0' : '#1b2a6b'), r.c4);
    // #78: the title and intro sit on a soft checkered flag in the theme's own colours, text inside it
    const hero = await p.evaluate(() => {
      const h = document.querySelector('.hero'); if(!h) return null;
      const cs = getComputedStyle(h), box = h.getBoundingClientRect(), sub = h.querySelector('.sub').getBoundingClientRect();
      const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return { holds: !!h.querySelector('h1') && !!h.querySelector('.sub'), bg: cs.backgroundImage,
        inside: sub.right <= box.right && sub.bottom <= box.bottom, right: box.right, inset: css('--inset'), panel: css('--panel') };
    });
    t.check(`${theme} ${width}px: title and intro sit on a checkered banner`, hero && hero.holds && /conic-gradient/.test(hero.bg) && hero.inside && hero.right <= width, JSON.stringify(hero));
    t.check(`${theme} ${width}px: banner checks use the theme's colours`, hero && /rgb/.test(hero.bg) && hero.inset !== hero.panel);
    t.check(`${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
    await p.done();
  }
};
