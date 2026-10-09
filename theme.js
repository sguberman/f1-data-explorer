// Light / dark / system theme handling shared by every page.
// Load synchronously in <head> so the theme is applied before first paint.
(function(){
  const KEY='f1-theme';
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const root=document.documentElement;
  const getPref=()=>{try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'system';}catch(e){return 'system';}};
  const setPref=p=>{try{p==='system'?localStorage.removeItem(KEY):localStorage.setItem(KEY,p);}catch(e){}};
  const resolve=p=>p==='system'?(mq.matches?'dark':'light'):p;

  // Canvas colours for Chart.js pages (CSS variables can't reach canvas drawing directly)
  const CHART={
    light:{text:'#666',label:'#333',grid:'#e1e0d9',axis:'#c3c2b7',projShade:'rgba(0,0,0,0.04)',divider:'#b4b2a9',dividerText:'#6b6a66',
      knock:'#1f1f1f',knockFill:'rgba(200,40,40,0.09)',knockFillProj:'rgba(200,40,40,0.05)',elim:'#c62828',elimText:'#a32020',pointRing:'#fff'},
    dark:{text:'#9aa3af',label:'#d5d9de',grid:'#232830',axis:'#3a404b',projShade:'rgba(255,255,255,0.035)',divider:'#4a515c',dividerText:'#9aa3af',
      knock:'#eef0f2',knockFill:'rgba(239,83,80,0.13)',knockFillProj:'rgba(239,83,80,0.07)',elim:'#ef5350',elimText:'#ff8a80',pointRing:'#191d24'}
  };
  // Team colours too dark to read on the dark background get a lighter stand-in
  const DARK_SWAP={'#1B2A6B':'#6A86F0','#1A1A1A':'#B6BAC0'};

  let applied=null;
  function apply(){
    const t=resolve(getPref());
    root.dataset.theme=t;
    syncMenu();
    if(applied&&applied!==t) window.dispatchEvent(new CustomEvent('themechange',{detail:{theme:t}}));
    applied=t;
  }

  // issue #27: the old always-visible three-button row is now a single dropdown trigger (icon +
  // current theme's label + chevron) that opens a small menu with all three choices, icon included.
  const OPTS=[
    ['light','Light Theme','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'],
    ['dark','Dark Theme','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'],
    ['system','System Theme','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>']
  ];
  const CHEVRON='<svg class="theme-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  let menuOpen=false;

  function setMenuOpen(open){
    menuOpen=open;
    const slot=document.getElementById('themeToggle');
    if(!slot) return;
    const trigger=slot.querySelector('.theme-trigger'), menu=slot.querySelector('.theme-menu');
    if(trigger) trigger.setAttribute('aria-expanded',open);
    if(menu) menu.hidden=!open;
  }
  function syncMenu(){
    const slot=document.getElementById('themeToggle');
    if(!slot) return;
    const p=getPref();
    const current=OPTS.find(([v])=>v===p)||OPTS[2];
    const trigger=slot.querySelector('.theme-trigger');
    if(trigger) trigger.innerHTML=current[2]+'<span>'+current[1]+'</span>'+CHEVRON;
    slot.querySelectorAll('.theme-menu button').forEach(b=>{
      const on=b.dataset.pref===p;b.setAttribute('aria-checked',on);});
  }
  function mount(){
    const slot=document.getElementById('themeToggle');
    if(!slot) return;
    slot.innerHTML='<div class="theme-dd">'+
      '<button type="button" class="theme-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Colour theme"></button>'+
      '<div class="theme-menu" role="menu" aria-label="Colour theme" hidden>'+
        OPTS.map(([v,l,i])=>`<button type="button" role="menuitemradio" data-pref="${v}">${i}<span>${l}</span></button>`).join('')+
      '</div></div>';
    const trigger=slot.querySelector('.theme-trigger');
    const items=[...slot.querySelectorAll('.theme-menu button')];
    trigger.addEventListener('click',()=>setMenuOpen(!menuOpen));
    items.forEach((b,i)=>{
      b.addEventListener('click',()=>{setPref(b.dataset.pref);apply();setMenuOpen(false);trigger.focus();});
      b.addEventListener('keydown',e=>{
        const d=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;
        if(e.key==='Escape'){setMenuOpen(false);trigger.focus();return;}
        if(!d) return;e.preventDefault();
        items[(i+d+items.length)%items.length].focus();
      });
    });
    document.addEventListener('click',e=>{ if(menuOpen && !slot.contains(e.target)) setMenuOpen(false); });
    document.addEventListener('keydown',e=>{ if(menuOpen && e.key==='Escape') setMenuOpen(false); });
    syncMenu();
  }

  mq.addEventListener('change',()=>{if(getPref()==='system')apply();});
  window.addEventListener('storage',e=>{if(e.key===KEY)apply();});
  apply();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();

  window.F1Theme={
    current:()=>root.dataset.theme,
    chart:()=>CHART[root.dataset.theme]||CHART.light,
    team:c=>root.dataset.theme==='dark'&&DARK_SWAP[c.toUpperCase()]||c
  };
})();
