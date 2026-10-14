// #62: site navigation shared by every data page — a "F1 Data Explorer" link home and a Pages menu that
// jumps to any other page. Renders into <nav id="siteNav"> at the left of the top bar (the theme menu stays
// on the right). The menu's items are plain links; the season carries over through F1Controls' saved season.
(function(){
  const PAGES = [
    ['drivers.html', "Drivers' Championship"],
    ['constructors.html', "Constructors' Championship"],
    ['position.html', 'Race Finishing Positions'],
    ['simulator.html', 'Title Simulator'],
    ['whatif.html', 'What-If Results']
  ];
  const HOME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>';
  const CHEVRON = '<svg class="theme-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;');

  function mount(){
    const slot = document.getElementById('siteNav');
    if(!slot) return;
    // match "drivers.html" and "drivers" alike (Cloudflare previews drop the .html)
    const base = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    const here = base + '.html';
    const current = PAGES.find(([href]) => href === here);
    slot.innerHTML =
      `<a class="nav-home" href="index.html" title="F1 Data Explorer home" aria-label="F1 Data Explorer home">${HOME_ICON}<span>F1 Data Explorer</span></a>` +
      '<div class="theme-dd nav-dd">' +
        '<button type="button" class="theme-trigger nav-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Pages">' +
          `<span class="nav-current">${esc(current ? current[1] : 'Pages')}</span><span class="nav-short">Pages</span>${CHEVRON}</button>` +
        '<div class="theme-menu nav-menu" role="menu" aria-label="Pages" hidden>' +
          PAGES.map(([href, label]) => `<a role="menuitem" href="${href}"${href === here ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('') +
        '</div></div>';

    const trigger = slot.querySelector('.nav-trigger'), menu = slot.querySelector('.nav-menu');
    const items = [...menu.querySelectorAll('a')];
    const setOpen = open => { trigger.setAttribute('aria-expanded', open); menu.hidden = !open; };
    trigger.addEventListener('click', () => {
      const open = menu.hidden; setOpen(open);
      if(open) (items.find(a => a.hasAttribute('aria-current')) || items[0]).focus();
    });
    items.forEach((a, i) => a.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ setOpen(false); trigger.focus(); return; }
      const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if(!d) return; e.preventDefault();
      items[(i + d + items.length) % items.length].focus();
    }));
    document.addEventListener('click', e => { if(!menu.hidden && !slot.querySelector('.nav-dd').contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if(!menu.hidden && e.key === 'Escape') setOpen(false); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
