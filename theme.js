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
    syncButtons();
    if(applied&&applied!==t) window.dispatchEvent(new CustomEvent('themechange',{detail:{theme:t}}));
    applied=t;
  }

  const OPTS=[
    ['light','Light','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'],
    ['dark','Dark','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'],
    ['system','System','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>']
  ];
  function syncButtons(){
    const p=getPref();
    document.querySelectorAll('.theme-toggle button').forEach(b=>{
      const on=b.dataset.pref===p;b.setAttribute('aria-checked',on);b.tabIndex=on?0:-1;});
  }
  function mount(){
    const slot=document.getElementById('themeToggle');
    if(!slot) return;
    slot.innerHTML='<div class="theme-toggle" role="radiogroup" aria-label="Colour theme">'+
      OPTS.map(([v,l,i])=>`<button type="button" role="radio" data-pref="${v}">${i}<span>${l}</span></button>`).join('')+'</div>';
    const btns=[...slot.querySelectorAll('button')];
    btns.forEach((b,i)=>{
      b.addEventListener('click',()=>{setPref(b.dataset.pref);apply();});
      b.addEventListener('keydown',e=>{
        const d=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;
        if(!d) return;e.preventDefault();
        const n=btns[(i+d+btns.length)%btns.length];setPref(n.dataset.pref);apply();n.focus();
      });
    });
    syncButtons();
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
