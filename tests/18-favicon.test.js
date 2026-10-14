// #68: every page has the favicon (checkered flag + red rising line): an SVG for modern browsers, favicon.ico for
// older ones, and a 180px apple-touch-icon for phone home screens.
module.exports = async (t, h) => {
  for(const name of ['index', 'drivers', 'constructors', 'position', 'simulator', 'whatif']){
    const p = await h.openPage(name);
    const links = await p.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')]
      .map(l => `${l.rel} ${l.getAttribute('href')}`));
    t.check(`${name}: links the favicon (svg + ico) and the home-screen icon`,
      JSON.stringify(links) === JSON.stringify(['icon favicon.ico', 'icon favicon.svg', 'apple-touch-icon apple-touch-icon.png']), links.join(', '));
    await p.done();
  }
  // The browser draws the SVG; the .ico and .png are checked on disk (Playwright can't intercept /favicon.ico).
  const fs = require('fs'), path = require('path'), site = f => fs.readFileSync(path.join(__dirname, '..', 'site', f));
  const ico = site('favicon.ico'), png = site('apple-touch-icon.png');
  const icoSizes = [...Array(ico.readUInt16LE(4))].map((_, i) => (ico[6 + i*16] || 256) + 'x' + (ico[7 + i*16] || 256)).sort();
  t.check('favicon.ico is a real .ico with 16, 32 and 48px images', ico.readUInt32LE(0) === 0x00010000 && icoSizes.join() === '16x16,32x32,48x48', icoSizes.join());
  t.check('apple-touch-icon.png is a 180×180 PNG', png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) === 180 && png.readUInt32BE(20) === 180, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);
  const p = await h.openPage('index');
  const drawn = await p.evaluate(() => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = 'favicon.svg'; }));
  t.check('favicon.svg is served and draws', drawn);
  t.check('favicon: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
