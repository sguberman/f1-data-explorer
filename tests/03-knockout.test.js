// issues #45/#46: both championship charts draw the "Below the knockout line" label inside the plot area
// (desktop and phone), and both summaries use the same wording.
module.exports = async (t, h) => {
  for(const name of ['drivers','constructors']) for(const width of [1000, 390]){
    const p = await h.openPage(name, {width});
    // Record where the label is drawn (spy on fillText, then force a redraw).
    await p.evaluate(() => {
      const orig = CanvasRenderingContext2D.prototype.fillText;
      window.__labels = [];
      CanvasRenderingContext2D.prototype.fillText = function(txt, x, y){
        if(txt === 'Below the knockout line') window.__labels.push({x, w:this.measureText(txt).width, align:this.textAlign, canvas:this.canvas.id});
        return orig.apply(this, arguments);
      };
    });
    await h.loaded(p);
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('themechange'))); // force a redraw with the spy in place
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const a = Chart.getChart(document.getElementById('c')).chartArea;
      const l = window.__labels.filter(l => l.canvas === 'c').pop();
      return { l, left:a.left, right:a.right, summary:document.getElementById('sm').textContent };
    });
    const inside = r.l && r.l.align === 'center' && r.l.x - r.l.w/2 >= r.left && r.l.x + r.l.w/2 <= r.right;
    t.check(`${name} ${width}px: knockout label inside the plot`, inside, JSON.stringify(r.l) + ` area ${r.left}-${r.right}`);
    t.check(`${name} ${width}px: summary wording`, /Below the line:/.test(r.summary) && /Projected to fall below at current form:/.test(r.summary) && !/liminated/.test(r.summary), r.summary);
    await p.done();
  }
};
