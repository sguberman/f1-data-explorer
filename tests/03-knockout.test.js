// The knockout line on both championship charts (legacy #45/#46, GitHub #16): no label is drawn on the
// chart any more; the text under the chart explains the line, naming the highest-ranked selected entry.
module.exports = async (t, h) => {
  for(const [name, one] of [['drivers','driver'], ['constructors','team']]) for(const width of [1000, 390]){
    const p = await h.openPage(name, {width});
    // Record every text drawn on the main chart's canvas (spy on fillText, then force a redraw).
    await p.evaluate(() => {
      const orig = CanvasRenderingContext2D.prototype.fillText;
      window.__texts = [];
      CanvasRenderingContext2D.prototype.fillText = function(txt){
        if(this.canvas.id === 'c') window.__texts.push(String(txt));
        return orig.apply(this, arguments);
      };
    });
    await h.loaded(p);
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('themechange')));
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({
      texts: window.__texts,
      summary: document.getElementById('sm').textContent,
      // independent: highest cumulative points among the selected entries, at the current round
      leader: D.slice().sort((a,b) => b.cum[L-1] - a.cum[L-1])[0].n,
    }));
    t.check(`${name} ${width}px: no knockout label drawn on the chart`, r.texts.length > 0 && !r.texts.some(s => /knockout/i.test(s)), r.texts.filter(s => /knockout/i.test(s)).join('|'));
    t.check(`${name} ${width}px: text explains the line and names the leader`,
      r.summary.startsWith(`Knockout line: the fewest points a ${one} needs to still catch ${r.leader}, the highest-ranked ${one} you've selected.`)
        && r.summary.includes(`can't catch ${r.leader}`), r.summary);
    t.check(`${name} ${width}px: below-the-line lists kept, no "eliminated"`,
      /Below the line:/.test(r.summary) && /Projected to fall below at current form:/.test(r.summary) && !/liminated/.test(r.summary), r.summary);
    await p.done();
  }
};
