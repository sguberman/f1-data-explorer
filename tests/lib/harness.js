// Shared test plumbing (issue #53). Pages are served from ../site at http://site.test/, Jolpica is answered
// by the fixture, and Chart.js comes from node_modules — so tests run offline and deterministically.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { api } = require('./fixture');
const { answer: openf1Answer } = require('./openf1-fixture');

const SITE = path.join(__dirname, '..', '..', 'site');
const ARTIFACTS = path.join(__dirname, '..', 'artifacts');
const CHART_JS = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

let browser;
async function launch(){ browser = await chromium.launch(); }
async function close(){ if(browser) await browser.close(); }

// Opens a page in a fresh context. Options:
//   theme 'light'|'dark', width (px), fail(url) -> true to answer that Jolpica request with HTTP 500,
//   delay (ms) before each Jolpica response.
//   now (ms or date string): fixes the page's clock (Date) at that moment (#89); timezone (IANA name) and
//   locale set the browser's time zone and locale.
//   snapshots: {year: object} served as site/data/{year}.json (#13). The real season files in site/data/ are
//   never served, so tests always use the fake season; without this option every season file is a 404 and
//   pages load live from the (fake) Jolpica, as before.
//   eras: an object served as site/data/eras.json (#135); without it that file is a 404.
//   grids: {year: object|null} served as site/data/grid/{year}.json (#167); null = a 404 (no qualifying data); a year not
//     listed gets the real file in site/data/grid/. page.gridHits lists the requests for it.
//   tracks: an object served as site/data/tracks.json (#169), null = a 404; left out = the real file. page.trackHits lists the requests.
//   pace: {list:{year: file}, sessions:{key: file}} served as site/data/pace/… (#186; a saved copy of a session, tools/pace-snapshot.mjs); anything else there is a 404. page.paceHits lists the requests.
//   spacing: ms the Weekend Pace page waits between OpenF1 requests (0 here, its real value is 350).
//   openf1: {fail(url), live: true|fn(url) (OpenF1 closed for a live session: 401), rate: {left: n} (the first n get a 429), empty:[session keys], answer(url, options) (replaces the fixture)} answers api.openf1.org from lib/openf1-fixture.js (#186); left out = the request is blocked. page.openf1Hits lists the requests.
// The returned page has .errors (uncaught page errors), .apiHits (Jolpica requests made) and .done().
async function openPage(name, {theme='light', width=1000, fail=()=>false, delay=0, snapshots={}, grids={}, tracks=undefined, openf1=null, pace={}, spacing=0, eras=null, now=null, timezone, locale}={}){
  const ctx = await browser.newContext({ viewport:{width, height:1400}, ...(timezone ? {timezoneId:timezone} : {}), ...(locale ? {locale} : {}) });
  if(now !== null) await ctx.clock.setFixedTime(now);
  await ctx.addInitScript(t => { try{ localStorage.setItem('f1-theme', t); }catch(e){} }, theme);
  await ctx.addInitScript(n => { window.F1O_SPACING = n; }, spacing); // the Weekend Pace page's pause between OpenF1 requests (0 here)
  const apiHits = [], snapshotHits = [], gridHits = [], trackHits = [], openf1Hits = [], openf1Times = [], paceHits = [];
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if(url.startsWith('https://api.jolpi.ca/')){
      apiHits.push(url);
      if(delay) await new Promise(r => setTimeout(r, delay));
      const headers = {'access-control-allow-origin':'*'};
      if(fail(url)) return route.fulfill({status:500, headers, body:'error'});
      const {status, body} = api(url);
      return route.fulfill({status, headers, contentType:'application/json', body:JSON.stringify(body)});
    }
    if(url.startsWith('https://api.openf1.org/') && openf1){
      openf1Hits.push(url); openf1Times.push(Date.now());
      if(delay) await new Promise(r => setTimeout(r, delay));
      const headers = {'access-control-allow-origin':'*'};
      if(openf1.fail && openf1.fail(url)) return route.fulfill({status:500, headers, body:'error'});
      // a live session: OpenF1 answers nobody without an account (live: true, or a function of the url)
      if(openf1.live && (openf1.live === true || openf1.live(url))) return route.fulfill({status:401, headers, contentType:'application/json', body:JSON.stringify({detail:'Live F1 session in progress. Global API access (including past sessions) is restricted to authenticated users until the session ends. Get an API key here: https://example.test'})});
      if(openf1.rate && openf1.rate.left > 0){ openf1.rate.left--; return route.fulfill({status:429, headers:{...headers, 'retry-after':'0'}, body:'slow down'}); } // rate: {left: n}: the first n requests get a 429
      const body = (openf1.answer || openf1Answer)(url, openf1);
      return body ? route.fulfill({status:200, headers, contentType:'application/json', body:JSON.stringify(body)}) : route.fulfill({status:404, headers, body:'[]'});
    }
    if(url.startsWith('https://cdnjs.cloudflare.com/') && url.includes('Chart.js'))
      return route.fulfill({status:200, contentType:'application/javascript', body:CHART_JS});
    if(url.startsWith('http://site.test/')){
      if(new URL(url).pathname === '/data/eras.json')
        return eras ? route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(eras)}) : route.fulfill({status:404, body:''});
      if(new URL(url).pathname === '/data/tracks.json'){
        trackHits.push(url);
        if(tracks !== undefined) return tracks ? route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(tracks)}) : route.fulfill({status:404, body:''});
      }
      const paceM = new URL(url).pathname.match(/^\/data\/pace\/(?:(\d{4})\.json|(\d{4})\/(\d+)\.json)$/);
      if(paceM){ // saved weekend pace data (#186): only what the test gives; the real files are never served
        paceHits.push(url);
        const body = paceM[1] ? (pace.list || {})[paceM[1]] : (pace.sessions || {})[paceM[3]];
        return body ? route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(body)}) : route.fulfill({status:404, body:''});
      }
      const gridM = new URL(url).pathname.match(/^\/data\/grid\/(\d{4})\.json$/);
      if(gridM){
        gridHits.push(url);
        if(gridM[1] in grids) return grids[gridM[1]] ? route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(grids[gridM[1]])}) : route.fulfill({status:404, body:''});
      }
      const snap = new URL(url).pathname.match(/^\/data\/(\d{4})\.json$/);
      if(snap){
        snapshotHits.push(url);
        return snapshots[snap[1]] ? route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(snapshots[snap[1]])})
                                  : route.fulfill({status:404, body:''});
      }
      const file = path.join(SITE, new URL(url).pathname.slice(1) || 'index.html');
      if(!file.startsWith(SITE) || !fs.existsSync(file)) return route.fulfill({status:404, body:''});
      return route.fulfill({status:200, contentType:TYPES[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.errors = []; page.apiHits = apiHits; page.snapshotHits = snapshotHits; page.gridHits = gridHits; page.trackHits = trackHits; page.openf1Hits = openf1Hits; page.openf1Times = openf1Times; page.paceHits = paceHits;
  page.on('pageerror', e => page.errors.push(e.message));
  page.done = () => ctx.close();
  await page.goto(`http://site.test/${name}.html`);
  return page;
}

// Waits for the season to finish loading (controls.js removes .f1-loading from <html>).
async function loaded(page, timeout=10000){
  await page.waitForFunction(() => typeof F1Controls !== 'undefined' && F1Controls.state.year && !document.documentElement.classList.contains('f1-loading'), null, {timeout});
  await page.waitForTimeout(150);
}

// Moves the "as of round" slider the way a user would (fires the input event).
const setRound = (page, round) => page.evaluate(r => {
  const s = document.querySelector('.f1c-round'); s.value = r; s.dispatchEvent(new Event('input'));
}, round);

// Text of an element, or '(hidden)' / '(missing)'.
const text = (page, sel) => page.$eval(sel, e => e.hidden ? '(hidden)' : e.textContent.replace(/\s+/g,' ').trim()).catch(() => '(missing)');

async function screenshot(page, file){
  fs.mkdirSync(ARTIFACTS, {recursive:true});
  await page.screenshot({path: path.join(ARTIFACTS, file), fullPage:true});
}

module.exports = { launch, close, openPage, loaded, setRound, text, screenshot };
