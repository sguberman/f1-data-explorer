/* F1Share (#31): each page's setup lives in its URL, so any view can be bookmarked or shared and opens exactly as
   it was. The URL always carries the season; it carries the round only when the slider isn't on the latest round
   (so a bookmark follows the season as it goes on), and whatever the page registers (picked drivers, options…),
   leaving out anything still at its default.

   - F1Controls reads `season` and `round` from the URL when it loads the first season (param()).
   - A page reads its own keys once, when it builds its first season (take()), and registers a function that
     returns them (register()). Values are strings; null leaves a key out, '' keeps it empty (e.g. "none picked").
   - After any click, change or key press the URL is rewritten in place (history.replaceState): no reload, no
     fetch, no new history entry.
   - share() copies the link, or opens the phone's share sheet. */
const F1Share = (() => {
  const initial = new URLSearchParams(location.search);
  const providers = []; let taken = false, pending = false;

  const param = key => initial.get(key);
  // The page's own URL keys, for the first season it builds only (later season switches start from defaults).
  function take(){ if(taken) return null; taken = true; return initial; }
  // Several parts of a page can register (e.g. the page itself and its round-result panel, #29).
  function register(fn){ providers.push(fn); sync(); }

  // A comma-separated id list from the URL, keeping only ids that exist (e.g. drivers of this season).
  function ids(value, valid){
    if(value == null) return null;
    const ok = valid instanceof Set ? valid : new Set(valid);
    return value.split(',').filter(id => id && ok.has(id));
  }
  const sameSet = (a, b) => (a||[]).length === (b||[]).length && (a||[]).every(x => (b||[]).includes(x));

  function url(){
    const st = typeof F1Controls !== 'undefined' ? F1Controls.state : {};
    const p = new URLSearchParams();
    if(st.year) p.set('season', st.year);
    const page = Object.assign({}, ...providers.map(fn => fn()));
    // _round: the page needs the round kept even on the latest round (a simulator run depends on it)
    if(st.round && (page._round || st.round < st.maxRound)) p.set('round', st.round);
    Object.entries(page).forEach(([k, v]) => { if(k[0] !== '_' && v != null) p.set(k, v); });
    const q = p.toString().replace(/%2C/g, ',').replace(/%7C/g, '|').replace(/%3A/g, ':');
    return location.pathname + (q ? '?' + q : '');
  }
  function sync(){
    if(pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if(typeof F1Controls === 'undefined' || !F1Controls.state.year) return; // nothing loaded yet
      const u = url();
      if(u !== location.pathname + location.search){ try{ history.replaceState(history.state, '', u); }catch(e){} }
    }, 0);
  }
  // Every way a setup can change ends in one of these; the page's own handlers run first (setTimeout above).
  ['change', 'click', 'pointerup', 'keyup'].forEach(t => document.addEventListener(t, sync, true));
  window.addEventListener('f1selection', sync);
  window.addEventListener('f1roundchange', sync);

  // The button every page uses (controls.js puts it in the season row; the Eras page, #145, in its chart card).
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/></svg>';
  const BUTTON = `<button type="button" class="f1c-share" title="Copy a link to exactly this view">${ICON}<span>Share</span></button>`;

  // `plainLink` (#145): a page without controls (Eras) shares its own address, which it keeps current itself.
  async function share(btn, plainLink){
    let link = plainLink && location.href;
    if(!link){ sync(); await new Promise(r => setTimeout(r, 0)); link = location.origin + url(); }
    const label = btn && btn.querySelector('span');
    const say = text => { if(!label) return; label.textContent = text; clearTimeout(btn._t); btn._t = setTimeout(() => { label.textContent = 'Share'; }, 2000); };
    // Phones (and anything with a share sheet and a touch screen) get the share sheet; desktops copy the link.
    if(navigator.share && matchMedia('(pointer:coarse)').matches){
      try{ await navigator.share({ title: document.title, url: link }); return; }
      catch(e){ if(e && e.name === 'AbortError') return; }
    }
    try{ await navigator.clipboard.writeText(link); say('Link copied'); }
    catch(e){ window.prompt('Copy this link:', link); }
  }

  return { param, take, register, ids, sameSet, url, sync, share, BUTTON };
})();
