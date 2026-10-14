// #56: a 30,000-season run no longer freezes the page. It runs in slices with a progress count, the Run
// button becomes Cancel, and cancelling keeps the previous results.
module.exports = async (t, h) => {
  const p = await h.openPage('simulator'); await h.loaded(p);
  await p.selectOption('#n', '30000');

  // Run 30,000 while timing the browser's own ticks: the longest stretch without one is how long the page froze.
  const r = await p.evaluate(async () => {
    const status = document.getElementById('status'), btn = document.getElementById('run');
    let last = performance.now(), worst = 0, progress = new Set(), sawCancel = false;
    const tick = setInterval(() => {
      const now = performance.now(); worst = Math.max(worst, now - last); last = now;
      const m = status.textContent.match(/Simulating… ([\d,]+) of 30,000/); if(m) progress.add(m[1]);
      if(btn.textContent === 'Cancel') sawCancel = true;
    }, 5);
    const t0 = performance.now();
    btn.click();
    while(!/seasons simulated/.test(status.textContent) && performance.now() - t0 < 60000) await new Promise(res => setTimeout(res, 20));
    clearInterval(tick);
    return { worst: Math.round(worst), steps: progress.size, sawCancel, status: status.textContent, N: lastRun && lastRun.N,
             filled: lastRun ? lastRun.ranks.every(x => x >= 1) : false, btn: btn.textContent, ms: Math.round(performance.now() - t0) };
  });
  t.check('30,000 simulations finish', /30,000 seasons simulated/.test(r.status) && r.N === 30000 && r.filled, JSON.stringify(r));
  t.check('the page keeps responding during the run (no freeze over 250 ms)', r.worst < 250, `longest freeze ${r.worst} ms over a ${r.ms} ms run`);
  t.check('progress is shown while it runs', r.steps >= 3, `${r.steps} progress updates`);
  t.check('the Run button turns into Cancel while running, and back after', r.sawCancel && r.btn === 'Run simulation');

  // Cancel part-way: the previous (30,000) results stay, and the status says so.
  const c = await p.evaluate(async () => {
    const status = document.getElementById('status'), btn = document.getElementById('run'), prev = lastRun;
    btn.click();
    while(!/Simulating…/.test(status.textContent)) await new Promise(res => setTimeout(res, 5));
    await new Promise(res => setTimeout(res, 60));
    btn.click(); // Cancel
    for(let i = 0; i < 100 && !/Cancelled/.test(status.textContent); i++) await new Promise(res => setTimeout(res, 20));
    return { status: status.textContent, kept: lastRun === prev, btn: btn.textContent, shown: document.getElementById('oddsCard').style.display };
  });
  t.check('Cancel stops the run and keeps the previous results', /Cancelled/.test(c.status) && c.kept && c.shown === 'block', JSON.stringify(c));
  t.check('after cancelling, Run simulation is back', c.btn === 'Run simulation');

  // A run can be started again after a cancel, and results reflect settings taken when the run started.
  const again = await p.evaluate(async () => {
    document.getElementById('n').value = '2000';
    document.getElementById('run').click();
    for(let i = 0; i < 200 && !/2,000 seasons simulated/.test(document.getElementById('status').textContent); i++) await new Promise(res => setTimeout(res, 20));
    return { N: lastRun.N, stale: !document.getElementById('staleNote').hidden };
  });
  t.check('a new run works after cancelling', again.N === 2000 && !again.stale, JSON.stringify(again));
  t.check('simulator run: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.done();
};
