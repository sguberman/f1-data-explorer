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
    t.check(`${theme} ${width}px: cards in order eras (#142), drivers, constructors, what-if (#107), positions, simulator, weekend pace (#186)`,
      JSON.stringify(r.hrefs) === JSON.stringify(['eras.html','drivers.html','constructors.html','whatif.html','position.html','simulator.html','pace.html']), r.hrefs.join(','));
    t.check(`${theme} ${width}px: every card has a chart picture`, r.pictures.every(Boolean));
    // #142: the Eras picture shows era bands with labels, team lines and ★ marks for drivers' titles; its text covers the page's current features
    const eras = await p.evaluate(() => {
      const c = document.querySelector('a.card[href="eras.html"]'), svg = c.querySelector('svg.pv');
      return { bands: svg.querySelectorAll('rect.pshade').length, labels: [...svg.querySelectorAll('text.era')].map(e => e.textContent).filter(x => !/^P\d$/.test(x)),
        lines: svg.querySelectorAll('path.pl').length, stars: svg.querySelectorAll('polygon.star').length,
        starFill: getComputedStyle(svg.querySelector('polygon.star')).fill, text: c.querySelector('p').textContent };
    });
    t.check(`${theme} ${width}px: Eras picture has shaded era bands with labels, three team lines and stars (#142)`,
      eras.bands >= 2 && ['V10','V8','Hybrid'].every(l => eras.labels.includes(l)) && eras.lines === 3 && eras.stars >= 3 && eras.starFill !== 'rgb(0, 0, 0)', JSON.stringify(eras));
    t.check(`${theme} ${width}px: Eras text mentions tracking teams or drivers, lineages, the star and eras (#142)`,
      /track your favorite teams or drivers through history/i.test(eras.text) && /renames and new owners/.test(eras.text) && eras.text.includes('★') && /Zoom in on an era/.test(eras.text), eras.text);
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
