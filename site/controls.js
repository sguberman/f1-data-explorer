/* F1Controls — shared season/round picker. Renders a dropdown + "as of round" slider into a container,
   persists the chosen season in localStorage (so navigating between pages keeps your selection), and
   dispatches a `f1selection` CustomEvent on `window` with { year, round, maxRound, seasonRounds } whenever
   the data is ready or the selection changes. Pages just listen for that event and redraw. */
const F1Controls = (() => {
  const SEASON_KEY = 'f1cache:selectedSeason';
  const YEARS = F1Common.YEARS; // newest first — add a season by adding its row to F1Common.SEASON_META

  let state = { year:null, round:null, maxRound:null, seasonRounds:[] };

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
  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/></svg>';
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
    const { rounds, failed, fetchedAt: newest } = await F1Data.loadSeason(year, { fresh,
      onProgress:(round)=>{ if(token===loadToken) statusEl.textContent = `Loading ${year} season… round ${round}`; }
    });
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
    state.seasonRounds = rounds;
    state.maxRound = rounds.length;
    state.round = rounds.length; // default to "as of the latest round loaded"
    if(linkRound){ if(linkRound>=1 && linkRound<rounds.length) state.round = linkRound; linkRound = null; } // #31: a shared link's round, first load only
    const slider = container.querySelector('.f1c-round');
    slider.max = state.maxRound || 1;
    slider.value = state.round || 1;
    container.querySelector('.f1c-roundlabel').innerHTML = roundLabelHTML(state.round);
    loadedMsg = state.maxRound ? `${state.maxRound} rounds loaded` : (failed ? 'No rounds loaded' : `Couldn't find any results for ${year}.`);
    renderStatus(container);
    emit();
  }

  function mount(containerId, opts={}){
    const container = document.getElementById(containerId);
    // #62: the season chosen on any page wins, so moving between pages keeps it; otherwise the newest season.
    const savedYear = (()=>{ try{ const y = +localStorage.getItem(SEASON_KEY); return YEARS.includes(y) ? y : null; }catch(e){ return null; } })();
    // #31: a shared link's season comes first, and its round is used for that first load
    const linkYear = YEARS.includes(+F1Share.param('season')) ? +F1Share.param('season') : null;
    linkRound = linkYear || !F1Share.param('season') ? +F1Share.param('round') || null : null;
    const defaultYear = linkYear || savedYear || opts.defaultYear || YEARS[0];

    container.innerHTML = `
      <div class="f1c-row">
        <label class="f1c-label">Season
          <select class="f1c-year">${YEARS.map(y=>`<option value="${y}" ${y===defaultYear?'selected':''}>${y}</option>`).join('')}</select>
        </label>
        <span class="f1c-statusline"><span class="f1c-status"></span><span class="f1c-age" hidden></span>
          · <button type="button" class="f1c-link f1c-refresh" title="Clear cached race data (all seasons) and reload from f1api.dev">Refresh data</button></span>
        <button type="button" class="f1c-share" title="Copy a link to exactly this view">${SHARE_ICON}<span>Share</span></button>
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
      container.querySelector('.f1c-roundlabel').innerHTML = roundLabelHTML(state.round);
      // Live update on every drag step, same as the on-chart drag handle — a lightweight event
      // (not `f1selection`) so pages can just recompute from already-loaded data, with no network
      // call and without resetting the driver/team selection the way a full f1selection rebuild would.
      window.dispatchEvent(new CustomEvent('f1roundchange', { detail: { round: state.round } }));
    });

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
    const slider = mountedContainer.querySelector('.f1c-round');
    if(slider) slider.value = round;
    const label = mountedContainer.querySelector('.f1c-roundlabel');
    if(label) label.innerHTML = roundLabelHTML(round);
  }

  return { mount, setRound, get state(){ return { ...state }; } };
})();
