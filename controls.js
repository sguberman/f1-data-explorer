/* F1Controls — shared season/round picker. Renders a dropdown + "as of round" slider into a container,
   persists the chosen season in localStorage (so navigating between pages keeps your selection), and
   dispatches a `f1selection` CustomEvent on `window` with { year, round, maxRound, seasonRounds } whenever
   the data is ready or the selection changes. Pages just listen for that event and redraw. */
const F1Controls = (() => {
  const SEASON_KEY = 'f1cache:selectedSeason';
  const YEARS = Array.from({length:6},(_,i)=>2026-i); // 2026 down to 2021 — adjust as more seasons are wanted

  let state = { year:null, round:null, maxRound:null, seasonRounds:[] };

  function emit(){
    window.dispatchEvent(new CustomEvent('f1selection', { detail: { ...state } }));
  }

  async function loadYear(container, year, statusEl){
    statusEl.textContent = `Loading ${year} season…`;
    const rounds = await F1Data.loadSeason(year, {
      onProgress:(round)=>{ statusEl.textContent = `Loading ${year} season… round ${round}`; }
    });
    state.year = year;
    state.seasonRounds = rounds;
    state.maxRound = rounds.length;
    state.round = rounds.length; // default to "as of the latest round loaded"
    const slider = container.querySelector('.f1c-round');
    slider.max = state.maxRound || 1;
    slider.value = state.round || 1;
    container.querySelector('.f1c-roundlabel').textContent =
      state.maxRound ? `Round ${state.round} of ${state.maxRound}${rounds[state.round-1]?(' — '+rounds[state.round-1].raceName):''}` : 'No rounds found';
    statusEl.textContent = state.maxRound ? `${state.maxRound} rounds loaded (cached locally).` : `Couldn't find any results for ${year}.`;
    emit();
  }

  function mount(containerId, opts={}){
    const container = document.getElementById(containerId);
    const savedYear = (()=>{ try{ return +localStorage.getItem(SEASON_KEY) || null; }catch(e){ return null; } })();
    const defaultYear = opts.defaultYear || savedYear || YEARS[0];

    container.innerHTML = `
      <div class="f1c-row">
        <label class="f1c-label">Season
          <select class="f1c-year">${YEARS.map(y=>`<option value="${y}" ${y===defaultYear?'selected':''}>${y}</option>`).join('')}</select>
        </label>
        <span class="f1c-status"></span>
      </div>
      <div class="f1c-row">
        <input type="range" class="f1c-round" min="1" max="1" value="1" step="1">
      </div>
      <div class="f1c-row"><span class="f1c-roundlabel"></span></div>`;

    const yearSel = container.querySelector('.f1c-year');
    const roundSlider = container.querySelector('.f1c-round');
    const statusEl = container.querySelector('.f1c-status');

    yearSel.addEventListener('change', ()=>{
      const y = +yearSel.value;
      try{ localStorage.setItem(SEASON_KEY, y); }catch(e){}
      loadYear(container, y, statusEl);
    });
    roundSlider.addEventListener('input', ()=>{
      state.round = +roundSlider.value;
      const r = state.seasonRounds[state.round-1];
      container.querySelector('.f1c-roundlabel').textContent =
        `Round ${state.round} of ${state.maxRound}${r?(' — '+r.raceName):''}`;
    });
    roundSlider.addEventListener('change', emit); // only re-render charts once the user releases the slider

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
    const r = state.seasonRounds[round-1];
    const label = mountedContainer.querySelector('.f1c-roundlabel');
    if(label) label.textContent = `Round ${round} of ${state.maxRound}${r?(' — '+r.raceName):''}`;
  }

  return { mount, setRound, get state(){ return { ...state }; } };
})();
