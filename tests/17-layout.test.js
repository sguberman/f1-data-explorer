// #64: every data page uses the same page frame — margins, width, title, intro text and card style — so moving
// between pages doesn't shift anything. The simulator used to have its own (narrower, bigger title, other cards).
module.exports = async (t, h) => {
  const frame = p => p.evaluate(() => {
    const cs = (sel, props) => { const e = document.querySelector(sel); if(!e) return null; const c = getComputedStyle(e); return props.map(k => c[k]).join(' '); };
    return {
      body: cs('body', ['paddingTop', 'paddingLeft', 'paddingRight']),
      wrap: cs('.wrap', ['maxWidth']),
      h1: cs('h1', ['fontSize', 'fontWeight', 'letterSpacing']),
      intro: cs('h1 + p', ['fontSize', 'marginBottom']),
      card: cs('.card', ['borderRadius', 'paddingTop', 'paddingLeft', 'borderTopWidth']),
      controlsLeft: Math.round(document.getElementById('f1controls').getBoundingClientRect().left),
    };
  });
  const pages = ['drivers', 'constructors', 'position', 'simulator', 'whatif'];
  for(const width of [1000, 390]){
    const got = {};
    for(const name of pages){ const p = await h.openPage(name, { width }); await h.loaded(p); got[name] = await frame(p); await p.done(); }
    const ref = got.drivers;
    for(const name of pages.slice(1)) for(const k of Object.keys(ref)){
      t.check(`${width}px ${name}: ${k} matches the other pages`, got[name][k] === ref[k], `${got[name][k]} vs ${ref[k]}`);
    }
  }
};
