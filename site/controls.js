/* F1Controls — shared season/round picker. Renders a dropdown + "as of round" slider into a container,
   persists the chosen season in localStorage (so navigating between pages keeps your selection), and
   dispatches a `f1selection` CustomEvent on `window` with { year, round, maxRound, seasonRounds } whenever
   the data is ready or the selection changes. Pages just listen for that event and redraw. */
const F1Controls = (() => {
  const SEASON_KEY = 'f1cache:selectedSeason';
  const ROUND_KEY = 'f1cache:selectedRound'; // #105: the slider's round, kept between pages (only while it isn't on the latest)
  const YEARS = F1Common.YEARS; // newest first — add a season by adding its row to F1Common.SEASON_META

  let state = { year:null, round:null, maxRound:null, seasonRounds:[] };
  let options = {}; // mount() options: upcoming (#186)

  // #186: the Weekend Pace page also needs the race weekend that is on now, before its Grand Prix has any results. With
  // `upcoming`, each calendar round after the loaded ones whose weekend has begun (its race date is within 4 days) is added
  // as a round with no results ({upcoming:true}); the slider then reaches it. Nothing is fetched beyond the calendar.
  const WEEKEND_DAYS = 4;
  async function withUpcoming(year, rounds){
    let cal = null;
    try{ cal = await F1Data.getCalendar(year, {dates:true}); }catch(e){}
    if(!cal || !cal.raceDates) return rounds;
    const out = rounds.slice();
    for(let r = out.length + 1; r <= cal.totalRounds; r++){
      const date = cal.raceDates[r];
      if(!date || Date.now() < Date.parse(date + 'T00:00:00Z') - WEEKEND_DAYS*864e5) break;
      out.push({ round:r, raceName:cal.raceNames[r] || ('Round '+r), country:cal.countries && cal.countries[r], raceResults:[], sprintResults:null, upcoming:true });
    }
    return out;
  }

  // "Round 5 of 12 — [flag] Miami Grand Prix" (#18: the circuit country's flag before the race name).
  function roundLabelHTML(round){
    if(!state.maxRound) return 'No rounds found';
    const r = state.seasonRounds[round-1];
    const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return `Round ${round} of ${state.maxRound}${r?(' — '+F1Common.flagHTML(r.country)+esc(r.raceName)):''}`;
  }

  function emit(){
    F1Common.indexPeople(state.seasonRounds); // #18: nationalities and numbers by id, for flags
    window.dispatchEvent(new CustomEvent('f1selection', { detail: { ...state } }));
  }

  // #105: remembered as {year, round}; nothing is kept while the slider is on the latest round, so "latest" keeps
  // following the season. A saved round that doesn't fit the loaded season is ignored.
  function savedRound(year, max){
    try{
      const o = JSON.parse(localStorage.getItem(ROUND_KEY));
      return o && o.year===year && Number.isInteger(o.round) && o.round>=1 && o.round<max ? o.round : null;
    }catch(e){ return null; }
  }
  function saveRound(){
    try{
      if(state.year && state.round && state.round<state.maxRound) localStorage.setItem(ROUND_KEY, JSON.stringify({year:state.year, round:state.round}));
      else localStorage.removeItem(ROUND_KEY);
    }catch(e){}
  }
  // issue #49: "updated 5 min ago"-style age of the newest data, from F1Data's fetch timestamps.
  function relativeAge(ms){
    const s = Math.max(0, Math.round((Date.now()-ms)/1000));
    if(s < 60) return 'just now';
    const m = Math.round(s/60); if(m < 60) return `${m} min ago`;
    const h = Math.round(m/60); if(h < 24) return `${h} hr${h===1?'':'s'} ago`;
    const d = Math.round(h/24); return `${d} day${d===1?'':'s'} ago`;
  }
  let fetchedAt = null, loadedMsg = '';
  let linkRound = null; // #31: the round from a shared link, applied once
  let linkSeason = false; // #105: the first load came from a link
  function renderStatus(container){
    container.querySelector('.f1c-status').textContent = loadedMsg;
    const age = container.querySelector('.f1c-age');
    age.hidden = !fetchedAt;
    if(fetchedAt){
      age.textContent = ` · updated ${relativeAge(fetchedAt)}`;
      age.title = 'Data fetched from f1api.dev ' + new Date(fetchedAt).toLocaleString();
    }
  }

  // issue #48: a token per load, so a slow earlier load (e.g. before a season switch) can't overwrite a
  // later one's status, error or loading state when it finally finishes.
  let loadToken = 0;
  // issue #16: each page's <title> is written without a year ("Drivers' Championship · F1 Data Explorer");
  // the selected season is prefixed here, so the browser tab always names the season being shown.
  const baseTitle = document.title;
  async function loadYear(container, year, statusEl, fresh=false){
    const token = ++loadToken;
    document.title = `${year} ${baseTitle}`;
    const root = document.documentElement, errorEl = container.querySelector('.f1c-error');
    const refreshBtn = container.querySelector('.f1c-refresh');
    root.classList.add('f1-loading'); // pages show a placeholder in their chart/picker slots (theme.css)
    errorEl.hidden = true; refreshBtn.disabled = true;
    fetchedAt = null; container.querySelector('.f1c-age').hidden = true;
    statusEl.textContent = `Loading ${year} season…`;
    const loaded = await F1Data.loadSeason(year, { fresh,
      onProgress:(round)=>{ if(token===loadToken) statusEl.textContent = `Loading ${year} season… round ${round}`; }
    });
    const { failed, fetchedAt: newest } = loaded;
    const withResults = loaded.rounds.length;
    const rounds = options.upcoming ? await withUpcoming(year, loaded.rounds) : loaded.rounds;
    if(token!==loadToken) return; // superseded by a newer load
    root.classList.remove('f1-loading');
    refreshBtn.disabled = false;
    fetchedAt = newest;
    if(failed){
      container.querySelector('.f1c-errortext').textContent = rounds.length
        ? `Couldn't load everything from f1api.dev — some results may be missing (showing rounds 1–${rounds.length}).`
        : `Couldn't load the ${year} season from f1api.dev. It may be down or rate-limiting requests.`;
      errorEl.hidden = false;
    }
    state.year = year;
    F1Common.setSeason(year); // #72: season-specific team colours
    state.fresh = fresh; // Refresh data: the pages that load more (the qualifying file, #167) re-download it too
    state.seasonRounds = rounds;
    state.maxRound = rounds.length;
    state.round = rounds.length; // default to "as of the latest round loaded"
    if(linkRound){ if(linkRound>=1 && linkRound<rounds.length) state.round = linkRound; linkRound = null; } // #31: a shared link's round, first load only
    else if(!linkSeason && savedRound(year, rounds.length)) state.round = savedRound(year, rounds.length); // #105: a link without a round means the latest
    linkSeason = false;
    saveRound();
    const slider = container.querySelector('.f1c-round');
    slider.max = state.maxRound || 1;
    slider.value = state.round || 1;
    container.querySelector('.f1c-roundlabel').innerHTML = roundLabelHTML(state.round);
    loadedMsg = state.maxRound ? `${withResults} rounds loaded${rounds.length > withResults ? ` · race weekend of round ${rounds.length}` : ''}` : (failed ? 'No rounds loaded' : `Couldn't find any results for ${year}.`);
    renderStatus(container);
    emit();
  }

  // #141: the seasons, newest first, grouped by the Eras page's rule eras (an <optgroup> each; the latest era
  // has few seasons, so a group header over a single 2026 is still fine). Seasons outside any era go ungrouped.
  function yearOptionsHTML(selected){
    const opt = y => `<option value="${y}" ${y===selected?'selected':''}>${y}</option>`;
    const eras = F1Common.ERAS.slice().sort((a,b)=>b.from-a.from);
    return eras.map(e=>{
      const ys = YEARS.filter(y=>y>=e.from && y<=e.to);
      return ys.length ? `<optgroup label="${e.name} · ${e.from}–${e.to>=9999?'':e.to}">${ys.map(opt).join('')}</optgroup>` : '';
    }).join('') + YEARS.filter(y=>!F1Common.ERAS.some(e=>y>=e.from && y<=e.to)).map(opt).join('');
  }

  function mount(containerId, opts={}){
    options = opts;
    const container = document.getElementById(containerId);
    // #62: the season chosen on any page wins, so moving between pages keeps it; otherwise the newest season.
    const savedYear = (()=>{ try{ const y = +localStorage.getItem(SEASON_KEY); return YEARS.includes(y) ? y : null; }catch(e){ return null; } })();
    // #31: a shared link's season comes first, and its round is used for that first load
    const linkYear = YEARS.includes(+F1Share.param('season')) ? +F1Share.param('season') : null;
    linkRound = linkYear || !F1Share.param('season') ? +F1Share.param('round') || null : null;
    linkSeason = !!linkYear;
    const defaultYear = linkYear || savedYear || opts.defaultYear || YEARS[0];

    container.innerHTML = `
      <div class="f1c-row">
        <label class="f1c-label">Season
          <select class="f1c-year">${yearOptionsHTML(defaultYear)}</select>
        </label>
        <span class="f1c-statusline"><span class="f1c-status"></span><span class="f1c-age" hidden></span>
          · <button type="button" class="f1c-link f1c-refresh" title="Clear cached race data (all seasons) and reload from f1api.dev">Refresh data</button></span>
        ${F1Share.BUTTON}
      </div>
      <div class="f1c-error" role="alert" hidden><span class="f1c-errortext"></span>
        <button type="button" class="f1c-link f1c-retry">Retry</button></div>
      <div class="f1c-row">
        <input type="range" class="f1c-round" min="1" max="1" value="1" step="1">
      </div>
      <div class="f1c-row"><span class="f1c-roundlabel"></span></div>`;

    const yearSel = container.querySelector('.f1c-year');
    const roundSlider = container.querySelector('.f1c-round');
    const statusEl = container.querySelector('.f1c-status');
    const currentYear = () => +yearSel.value;
    // issue #23: wipe the cached f1api.dev data and reload the selected season. The only network request
    // these controls make besides loading a season — and only on an explicit click.
    container.querySelector('.f1c-refresh').addEventListener('click', ()=>{
      F1Data.clearCache();
      loadYear(container, currentYear(), statusEl, true); // true: re-download the season file too (#13)
    });
    container.querySelector('.f1c-share').addEventListener('click', e=>F1Share.share(e.currentTarget)); // #31
    // issue #48: failures are never cached, so retrying is just loading the season again.
    container.querySelector('.f1c-retry').addEventListener('click', ()=>loadYear(container, currentYear(), statusEl));
    // Keep the "updated … ago" text current without any network requests.
    setInterval(()=>{ if(fetchedAt) renderStatus(container); }, 60*1000);

    yearSel.addEventListener('change', ()=>{
      const y = +yearSel.value;
      try{ localStorage.setItem(SEASON_KEY, y); }catch(e){}
      loadYear(container, y, statusEl);
    });
    roundSlider.addEventListener('input', ()=>{
      state.round = +roundSlider.value;
      saveRound();
      container.querySelector('.f1c-roundlabel').innerHTML = roundLabelHTML(state.round);
      // Live update on every drag step, same as the on-chart drag handle — a lightweight event
      // (not `f1selection`) so pages can just recompute from already-loaded data, with no network
      // call and without resetting the driver/team selection the way a full f1selection rebuild would.
      window.dispatchEvent(new CustomEvent('f1roundchange', { detail: { round: state.round } }));
    });

    // #112: the slider was released (not every drag step), for pages that run something heavier on release
    roundSlider.addEventListener('change', ()=>window.dispatchEvent(new CustomEvent('f1roundcommit', { detail: { round: state.round } })));

    // #132: once scrolled, the floating controls shrink to the slider (hysteresis so it can't flicker). Only a class; no fetch.
    window.addEventListener('scroll', ()=>{ const y = window.scrollY;
      if(y>140) container.classList.add('compact'); else if(y<60) container.classList.remove('compact'); }, {passive:true});

    try{ localStorage.setItem(SEASON_KEY, defaultYear); }catch(e){}
    loadYear(container, defaultYear, statusEl);
    mountedContainer = container;
  }

  let mountedContainer = null;
  // Update the slider/label to reflect a round chosen elsewhere (e.g. dragging the chart's own handle),
  // without re-fetching or re-emitting f1selection — the caller already redrew itself.
  function setRound(round){
    if(!mountedContainer) return;
    state.round = round;
    saveRound();
    const slider = mountedContainer.querySelector('.f1c-round');
    if(slider) slider.value = round;
    const label = mountedContainer.querySelector('.f1c-roundlabel');
    if(label) label.innerHTML = roundLabelHTML(round);
  }

  return { mount, setRound, get state(){ return { ...state }; } };
})();
