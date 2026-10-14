// Every page loads without errors in both themes at desktop and phone widths, and data pages finish loading.
// Screenshots are saved to tests/artifacts/ for a person to look at.
module.exports = async (t, h) => {
  for(const theme of ['light','dark']) for(const width of [1000, 390]){
    for(const name of ['index','drivers','constructors','position','simulator','whatif']){
      const p = await h.openPage(name, {theme, width});
      if(name !== 'index') await h.loaded(p);
      else await p.waitForTimeout(300);
      if(name === 'simulator'){ await p.click('#run'); await p.waitForTimeout(1500); }
      await h.screenshot(p, `${name}-${width}-${theme}.png`);
      t.check(`${name} ${theme} ${width}px: no page errors`, p.errors.length === 0, p.errors.join('; '));
      await p.done();
    }
  }
};
