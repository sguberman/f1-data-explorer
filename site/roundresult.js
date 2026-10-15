/* F1RoundResult (#29): tap or click a round on a championship points chart to see that round's result in a
   panel under the chart: the finishing order, with the picked drivers (drivers' page) or the picked teams' drivers
   (constructors' page) in bold, a Grand Prix / Sprint switch on sprint weekends, ‹ › to step through rounds and
   × to close. Only rounds up to the slider's round can be opened (later ones are projected). Everything comes from the season
   already loaded — opening, switching and stepping never fetch.

   F1RoundResult.attach({
     kind:     'drivers' | 'teams',
     canvas:   canvasEl,                  the points chart's canvas,
     after:    el,                        the panel goes right after this element,
     getChart: () => chart,               the current Chart.js chart (or null),
     getState: () => ({rounds, L, selected}),  season rounds, the slider's round, the picked ids,
   })
   F1RoundResult.band      a Chart.js plugin that shades the open round on the chart.
   F1RoundResult.update()  call after every redraw (round, season, picks or theme changed).
   F1RoundResult.hint(i)   tooltip footer for column i ("Click for the full result" on actual rounds).
   URL (#31): result=<round>, session=sprint. */
const F1RoundResult = (() => {
  let opts = null, panel = null, open = null, session = 'gp', expanded = false, lastYear = null, linkUsed = false;
  const TOP = 10;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const coarse = () => matchMedia('(pointer:coarse)').matches;

  const state = () => opts.getState();
  const roundData = n => (state().rounds || []).find(r => r.round === n) || null;
  // Rounds that can be opened: loaded and not after the slider's round.
  const openable = n => { const st = state(); return n >= 1 && n <= st.L && !!roundData(n); };

  // Classified finishers in order, then those not classified (in the order given).
  function ordered(results){
    const fin = results.filter(r => r.position != null).sort((a, b) => a.position - b.position);
    return fin.concat(results.filter(r => r.position == null));
  }
  const teamDot = id => `<span class="rr-dot" style="background:${F1Theme.team(F1Common.teamColor(id))}"></span>`;
  const pts = p => (Math.round(p * 10) / 10);

  function driverRows(results, picked){
    const rows = ordered(results), all = rows.length, shown = expanded || all <= TOP + 2 ? rows : rows.slice(0, TOP);
    const body = shown.map(r => `<tr data-id="${esc(r.driverId)}"${picked.has(r.driverId) ? ' class="rr-pick"' : ''}>`
      + `<td class="rr-pos">${r.position != null ? r.position : 'NC'}</td>`
      + `<td class="rr-who">${teamDot(r.teamId)}${F1Common.flagHTML(F1Common.nationalityOf('drivers', r.driverId))}<span class="rr-long">${esc(r.name || r.code)}</span><span class="rr-short">${esc(r.code || r.name)}</span></td>`
      + `<td class="rr-team">${esc(F1Common.shortTeamName(r.teamId, r.teamName))}</td>`
      + `<td class="rr-pts">${pts(r.points)}</td></tr>`).join('');
    return { head: '<tr><th class="rr-pos">Pos</th><th class="rr-who">Driver</th><th class="rr-team">Team</th><th class="rr-pts">Pts</th></tr>',
      body, more: all > shown.length || expanded && all > TOP + 2 ? all : 0 };
  }
  function render(){
    const rd = open != null && roundData(open);
    if(!rd || !opts.getChart()){ panel.hidden = true; return; }
    const hasSprint = !!(rd.sprintResults && rd.sprintResults.length);
    const shown = session === 'sprint' && hasSprint ? 'sprint' : 'gp';
    const results = shown === 'sprint' ? rd.sprintResults : rd.raceResults;
    // Picked drivers in bold; on the constructors' page, the drivers of the picked teams.
    const sel = new Set(state().selected || []);
    const picked = new Set(results.filter(r => opts.kind === 'teams' ? sel.has(r.teamId) : sel.has(r.driverId)).map(r => r.driverId));
    const t = driverRows(results, picked);
    const prev = open - 1, next = open + 1;
    panel.innerHTML = `<div class="rr-head">
      <div class="rr-title"><span class="rr-round">Round ${open}</span> ${esc(rd.raceName || '')}</div>
      <div class="rr-tools">
        ${hasSprint ? `<span class="rr-seg" role="group" aria-label="Session"><button type="button" class="pill rr-gp${shown === 'gp' ? ' active' : ''}" aria-pressed="${shown === 'gp'}">Grand Prix</button><button type="button" class="pill rr-sprint${shown === 'sprint' ? ' active' : ''}" aria-pressed="${shown === 'sprint'}">Sprint</button></span>` : ''}
        <button type="button" class="rr-btn rr-prev" aria-label="Previous round"${openable(prev) ? '' : ' disabled'}>‹</button>
        <button type="button" class="rr-btn rr-next" aria-label="Next round"${openable(next) ? '' : ' disabled'}>›</button>
        <button type="button" class="rr-btn rr-close" aria-label="Close result">×</button>
      </div></div>
      <table class="rr-table"><thead>${t.head}</thead><tbody>${t.body}</tbody></table>
      ${t.more ? `<button type="button" class="f1c-link rr-more">${expanded ? 'Show top ' + TOP : 'Show all ' + t.more}</button>` : ''}`;
    panel.setAttribute('aria-label', `Round ${open} ${shown === 'sprint' ? 'sprint' : 'Grand Prix'} result`);
    panel.hidden = false;
  }

  function show(n, how){
    if(!openable(n)) return;
    open = n; render(); redrawChart();
    if(how === 'tap') panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    F1Share.sync();
  }
  function close(){
    if(open == null) return;
    open = null; panel.hidden = true; redrawChart(); F1Share.sync();
  }
  const redrawChart = () => { const ch = opts.getChart(); if(ch) ch.draw(); };

  // The chart column under a pointer event, or null outside the plot (the x-axis labels count as inside).
  function columnAt(e){
    const ch = opts.getChart(); if(!ch || !ch.scales.x) return null;
    const box = ch.canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top, a = ch.chartArea;
    if(x < a.left - 8 || x > a.right + 8 || y < a.top || y > ch.scales.x.bottom) return null;
    return Math.round(ch.scales.x.getValueForPixel(x));
  }

  function attach(o){
    opts = o;
    panel = document.createElement('div');
    panel.className = 'rr'; panel.id = 'roundResult'; panel.hidden = true; panel.setAttribute('role', 'region');
    o.after.insertAdjacentElement('afterend', panel);
    o.canvas.addEventListener('click', e => { const i = columnAt(e); if(i != null && openable(i + 1)) show(i + 1, 'tap'); });
    o.canvas.addEventListener('mousemove', e => { const i = columnAt(e); o.canvas.style.cursor = i != null && openable(i + 1) ? 'pointer' : ''; });
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.classList.contains('rr-close')) close();
      else if(b.classList.contains('rr-prev')) show(open - 1);
      else if(b.classList.contains('rr-next')) show(open + 1);
      else if(b.classList.contains('rr-gp') || b.classList.contains('rr-sprint')){ session = b.classList.contains('rr-sprint') ? 'sprint' : 'gp'; render(); F1Share.sync(); }
      else if(b.classList.contains('rr-more')){ expanded = !expanded; render(); }
      const again = b.className && panel.querySelector('.' + [...b.classList].filter(c => c.startsWith('rr-')).join('.'));
      if(again && !again.disabled) again.focus(); // keep keyboard focus on the button after the re-render
    });
    // Escape closes it from inside the panel, or after tapping the chart (focus left on the page, not in a menu).
    document.addEventListener('keydown', e => {
      const a = document.activeElement;
      if(e.key === 'Escape' && open != null && (panel.contains(a) || a === document.body || a === o.canvas)) close();
    });
    panel.addEventListener('keydown', e => {
      if(e.key === 'ArrowLeft' && !e.target.closest('.rr-seg')) show(open - 1);
      else if(e.key === 'ArrowRight' && !e.target.closest('.rr-seg')) show(open + 1);
    });
    F1Share.register(() => {
      if(open == null) return { result: null, session: null };
      const rd = roundData(open), sprint = session === 'sprint' && rd && rd.sprintResults && rd.sprintResults.length;
      return { result: String(open), session: sprint ? 'sprint' : null };
    });
  }

  function update(){
    if(!opts) return;
    const st = state();
    const year = typeof F1Controls !== 'undefined' ? F1Controls.state.year : null;
    if(st.rounds && st.rounds.length && year !== lastYear){ // a new season: start closed (a shared link opens its round, first season only)
      lastYear = year; open = null; session = 'gp';
      if(!linkUsed && st.rounds && st.rounds.length){
        linkUsed = true;
        const n = parseInt(F1Share.param('result'), 10);
        if(F1Share.param('session') === 'sprint') session = 'sprint';
        if(openable(n)) open = n;
      }
    }
    if(open != null && !openable(open)) open = null; // e.g. the slider moved back before it
    render();
    if(open != null) redrawChart(); // the chart was just rebuilt before the panel opened: add the band
  }

  const band = { id: 'roundResultBand', beforeDatasetsDraw(ch){
    if(open == null || !panel || panel.hidden) return;
    const x = ch.scales.x, a = ch.chartArea, i = open - 1;
    const step = Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) || 20;
    const l = Math.max(a.left, x.getPixelForValue(i) - step / 2), r = Math.min(a.right, x.getPixelForValue(i) + step / 2);
    const c = ch.ctx; c.save(); c.fillStyle = F1Theme.chart().pick; c.fillRect(l, a.top, r - l, a.bottom - a.top); c.restore();
  } };

  const hint = i => !opts || coarse() || !openable(i + 1) ? '' : 'Click for the full result';

  return { attach, update, band, hint, get open(){ return open; } };
})();
