#!/usr/bin/env node
/**
 * Photographs a live web page for a reel panel (visual.type "image").
 *
 *   node scripts/shoot.mjs --site=zionle --page=analyze --symbol=VNINDEX --out=public/shots/vnindex-analyze.png
 *   node scripts/shoot.mjs --site=fireant --symbol=VNINDEX --clip=canvases --out=public/shots/fireant-vnindex.png
 *   node scripts/shoot.mjs --site=fireant --symbol=FPT --profile=<profile> --keep-open --out=…   (sign in once)
 *
 * Three ways to open the page:
 *   --real           the user's REAL Chrome, signed in as they are, driven like video-factory drives
 *                    it (OS-level events + screencapture) — see scripts/shoot_real.py. This is the
 *                    default for --site=fireant. Needs ../video-factory/.venv.
 *
 * The other two speak the DevTools protocol and share one code path:
 *   default          the Chrome Headless Shell that Remotion already downloaded. No window,
 *                    no sign-in, fast. Right for public pages such as the VN Trading Terminal.
 *   --profile=<name> the installed Google Chrome, VISIBLE, on a private copy of that Chrome
 *                    profile's sign-in state under .chrome/<name>/. Chrome 136+ refuses remote
 *                    control of the live default profile, so the first run copies Cookies,
 *                    Local Storage, Session Storage, IndexedDB and Preferences from
 *                    ~/Library/Application Support/Google/Chrome/<profile dir>. Nothing else
 *                    (no history, passwords, cache). --reseed copies again.
 *
 * Options
 *   --url=<url>                       page to open (or --site=zionle --page=<analyze|screener|…> [--symbol=X])
 *   --out=<file.png>                  where to write; a <file>.json sidecar records url, time, viewport, clip
 *   --viewport=1600x1000  --scale=2   CSS viewport and device pixel ratio (2 keeps chart text crisp at 880px)
 *   --wait=<ms>                       settle time after the load event (default 4000)
 *   --wait-for=<css>                  also wait until this selector exists and has size (30s cap)
 *   --js=<file.js>                    run this script in the page before capturing (pick a symbol, click a tab);
 *                                     whatever it returns is stored in the sidecar as `js` (e.g. row rectangles)
 *   --js-args=<json>                  exposed to that script as window.__SHOOT_ARGS
 *   --init-js=<file.js>               run before any page script, on every document (e.g. localStorage setup)
 *   --allow-post=/api/a,/api/b        paths the page may send a non-GET to. For --site=zionle every other
 *                                     non-GET is FAILED in the browser (CDP Fetch) and logged in the sidecar
 *   --click=x,y  --type=<text>        click a viewport point, then type text and press Enter — real input events,
 *                                     so they reach widgets inside iframes that page scripts cannot see
 *   --clip=<css> | canvases | x,y,w,h | full
 *                                     what to photograph. "canvases" = the smallest element holding every
 *                                     <canvas> (the chart card on a lightweight-charts page), or the largest
 *                                     <iframe> when the chart is a TradingView widget (default full)
 *   --wait-text=<substring>           also wait until the page text contains this (e.g. "bars · HPG")
 *   --dark                            emulate prefers-color-scheme: dark
 *   --range=5y|1y|6p|3p|1p|5n|1n      FireAnt (real mode): press that time-range button before capturing
 *   --interval=D|W|2W|M  --zoom-out=N FireAnt (real mode): click a pinned interval favourite; wheel N notches out
 *   --reset-view                      FireAnt (real mode): ⌥R after the interval (TradingView reset view)
 *   --pan=-330                        FireAnt (real mode): drag the pane left by 330pt so later dates come into view (deterministic)
 *   --indicator=MACD                  FireAnt (real mode): add an indicator via the fx dialog — saved into the user's layout
 *   --tab=VNM                         FireAnt (real mode): make that chart tab active first (found by OCR on the tab strip)
 *   --restore-symbol=VNM --restore-tab=VNINDEX
 *                                     FireAnt (real mode): after the capture, paste the tab's own ticker back and
 *                                     re-activate the tab that was active — a photo of a stock on the user's stock tab
 *                                     leaves their layout as it was
 *   --hover-back=1                    FireAnt (real mode): also capture <out>.hover.png with the pointer on the candle N bars
 *                                     before the last — the legend then prints that bar's values (an edition older than the chart)
 *   --crop=chart|full|x,y,w,h         real mode: what to capture inside the page area (fireant defaults to chart)
 *   --keep-open                       leave the window open afterwards (profile mode; sign in once, then re-run)
 *   --cookies=<domain>                debug: list the cookie NAMES the browser holds for that domain (never values)
 *   --eval=<js expression>            debug: evaluate in the page after load (awaits promises) and print the result
 *   --profile=none                    force the headless shell for a site that defaults to a profile (fireant)
 *
 * The script only reads. It never POSTs to the site; for zionle it passes the existing
 * config id in the URL so the frontend does not create a new one, and a request guard fails
 * any non-GET the PAGE itself tries (its Dashboard and Screener POST /api/stocks/filter on load;
 * a login with an unknown id POSTs /api/config). --allow-post names the exceptions — the
 * market-review skill allows /api/stocks/filter, a read-only query (user, 2026-09-29).
 */
import {spawn} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(`shoot: ${msg}`); process.exit(2); };

// ---------------------------------------------------------------- inputs

const configId = () => {
  if (process.env.ZIONLE_CONFIG_ID) return process.env.ZIONLE_CONFIG_ID.trim();
  const f = resolve(ROOT, '.zionle-config');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  die('no config id — set .zionle-config or $ZIONLE_CONFIG_ID');
};

/** The Chrome profile holding the user's sign-ins. Like the config id it stays out of git. */
const localProfile = () => {
  if (process.env.SHOOT_PROFILE) return process.env.SHOOT_PROFILE.trim();
  const f = resolve(ROOT, '.shoot-profile');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  die('no Chrome profile — put its folder, display name or account name in .shoot-profile or $SHOOT_PROFILE');
};

const SITES = {
  fireant: {
    /**
     * The user's saved layouts, indicators and watchlists live in their FireAnt account,
     * so this site opens in the visible Chrome on the local profile (.shoot-profile) unless --profile=none.
     */
    defaultProfile: true,
    /** Saved layouts need the real login, so FireAnt goes through the real Chrome (shoot_real.py). */
    defaultReal: true,
    url: () => 'https://fireant.vn/charts',
    /** FireAnt's header shows "Đăng nhập" when the browser holds no session. */
    signedIn: async (page) => !(await page.eval(`document.body.innerText.includes('Đăng nhập')`)),
    /**
     * The chart opens on the last/default tab and ignores URL parameters. Its symbol
     * box sits at the top-left of the TradingView iframe, so it is reached by clicking
     * there and typing — the search dialog selects the first match on Enter.
     */
    prepare: async (page, symbol) => {
      if (!symbol) return;
      const frame = await page.eval(`(() => {
        const area = (f) => { const r = f.getBoundingClientRect(); return r.width * r.height; };
        const f = [...document.querySelectorAll('iframe')].sort((a, b) => area(b) - area(a))[0];
        if (!f) return null;
        const r = f.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height};
      })()`);
      if (!frame) die('fireant: no chart iframe on the page');
      const sym = symbol.toUpperCase();
      await click(page, frame.x + 44, frame.y + 20);          // the "🔍 FPT" symbol box
      await sleep(1200);                                        // the search dialog opens with the current symbol selected
      await type(page, sym);                                    // replaces the selection
      await sleep(2500);                                        // the result list is fetched — Enter too early picks the OLD first row
      await pressEnter(page);
      const shown = async () => page.eval(`document.body.innerText.includes(${JSON.stringify(sym)})`);
      const t0 = Date.now();
      while (!(await shown()) && Date.now() - t0 < 8000) await sleep(300);
      if (!(await shown())) {
        // Enter did not take: click the first result row of the dialog instead.
        await click(page, frame.x + 40, frame.y + 240);
        await waitText(page, sym, 12000);
      }
      // Park the pointer off the chart: a hovered toolbar button keeps its tooltip
      // open and a hovered candle keeps the crosshair, and both end up in the shot.
      await page.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: 2, y: H - 2, button: 'none'});
      await sleep(2500);
    },
  },
  zionle: {
    url: (page) => {
      const u = new URL(`/${page ?? 'analyze'}`, 'https://zionle.io.vn');
      // Passing the id in the URL is how the frontend adopts an existing config
      // without POSTing a new one. It ignores any symbol parameter.
      u.searchParams.set('configId', configId());
      return u.toString();
    },
    /** The Analyze page opens on the last symbol (localStorage) or none; always search. */
    prepare: async (page, symbol) => {
      if (!symbol) return;
      // Measured 2026-09-23: once the config arrives the page auto-loads the first watchlist
      // symbol (STB) into the box, a few seconds AFTER the load event — overwriting anything
      // typed before it. Wait for that chart ("Latest:") to settle, or ~10s of no watchlist.
      for (const t0 = Date.now(); Date.now() - t0 < 10000; await sleep(250)) {
        if (await page.eval(`document.body.innerText.includes('Latest:')`)) break;
      }
      await sleep(1500);
      const found = await page.eval(`(() => {
        const inputs = [...document.querySelectorAll('input')];
        const el = inputs.find((i) => /^[A-Z0-9]{2,10}$/.test(i.value)) ?? inputs[0];
        if (!el) return false;
        el.focus(); el.select();
        return true;
      })()`);
      if (!found) die('zionle: no symbol search box on this page');
      const sym = symbol.toUpperCase();
      await type(page, sym);
      // Measured 2026-09-23: Enter 400ms after typing committed the stale suggestion (the
      // last symbol, restored from localStorage) instead of the typed one. Let the list refresh.
      await sleep(2500);
      await pressEnter(page);
      // The page no longer prints "bars · <sym>" (redesign seen 2026-09-23). A loaded chart
      // shows its OHLC strip ("Latest: … O: … H: …") and the symbol as page text; an input's
      // value is not innerText, so the typed symbol alone does not satisfy this.
      const t0 = Date.now();
      for (;;) {
        const s = await page.eval(`(() => { const t = document.body.innerText;
          return t.includes('Internal server error') ? 'error'
            : t.includes('Latest:') && t.includes(${JSON.stringify(sym)}) ? 'ok' : ''; })()`);
        if (s === 'ok') break;
        if (s === 'error' || Date.now() - t0 > 25000) {
          die(`zionle: ${sym} never loaded (${s || 'timeout'}). Page text starts: ` +
            (await page.eval('document.body.innerText.slice(0,300)')).replace(/\s+/g, ' '));
        }
        await sleep(250);
      }
      await sleep(1500);
    },
  },
};

const click = async (page, x, y) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', {type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1});
  }
};
const type = (page, text) => page.send('Input.insertText', {text});
const pressEnter = async (page) => {
  for (const type of ['keyDown', 'keyUp']) {
    await page.send('Input.dispatchKeyEvent', {type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13});
  }
};

const waitText = async (page, needle, timeout) => {
  const t0 = Date.now();
  for (;;) {
    if (await page.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`)) return;
    if (Date.now() - t0 > timeout) {
      die(`"${needle}" never appeared. Page text starts: ${(await page.eval('document.body.innerText.slice(0,300)')).replace(/\s+/g, ' ')}`);
    }
    await sleep(250);
  }
};

const site = opt('site');
const url = opt('url') ?? (site && SITES[site] ? SITES[site].url(opt('page'), opt('symbol')) : null);
const out = opt('out');
if (!url || !out) die('need --url=<url> (or --site=zionle --page=…) and --out=<file.png>');
if (site && !SITES[site]) die(`unknown --site=${site}; known: ${Object.keys(SITES).join(', ')}`);

const [W, H] = (opt('viewport', '1600x1000').split('x').map(Number));
const SCALE = Number(opt('scale', '2'));
const WAIT = Number(opt('wait', '4000'));
const WAIT_FOR = opt('wait-for');
const WAIT_TEXT = opt('wait-text');
const JS = opt('js');
const JS_ARGS = opt('js-args');
const INIT_JS = opt('init-js');
const ALLOW_POST = (opt('allow-post') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/** The user's own terminal gets the request guard by default; --allow-post also turns it on elsewhere. */
const GUARD = site === 'zionle' || ALLOW_POST.length > 0;
const CLICK = opt('click');
const TYPE = opt('type');
const CLIP = opt('clip', 'full');
const KEEP = flag('keep-open');
const profileArg = opt('profile') ?? (site && SITES[site]?.defaultProfile ? localProfile() : undefined);
const PROFILE = profileArg && profileArg !== 'none' ? profileArg : undefined;
const REAL = flag('real') || (site && SITES[site]?.defaultReal && opt('profile') !== 'none' && !flag('headless'));

// ---------------------------------------------------------------- browsers

const findHeadlessShell = () => {
  const base = resolve(ROOT, 'node_modules/.remotion/chrome-headless-shell');
  if (!existsSync(base)) return null;
  const walk = (dir, depth) => {
    for (const e of readdirSync(dir, {withFileTypes: true})) {
      const p = resolve(dir, e.name);
      if (e.isFile() && e.name === 'chrome-headless-shell') return p;
      if (e.isDirectory() && depth > 0) { const hit = walk(p, depth - 1); if (hit) return hit; }
    }
    return null;
  };
  return walk(base, 4);
};
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_HOME = resolve(homedir(), 'Library/Application Support/Google/Chrome');

/** "<name>" -> "Default": match the directory, display name, account name or its local part. */
const resolveProfileDir = (name) => {
  const state = resolve(CHROME_HOME, 'Local State');
  if (!existsSync(state)) die(`no Chrome profiles at ${CHROME_HOME}`);
  const cache = JSON.parse(readFileSync(state, 'utf8')).profile?.info_cache ?? {};
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  for (const [dir, p] of Object.entries(cache)) {
    const names = [dir, p.name, p.gaia_name, p.user_name, String(p.user_name ?? '').split('@')[0]].map(norm);
    if (names.includes(norm(name))) return dir;
  }
  die(`no Chrome profile called "${name}". Known: ${Object.entries(cache)
    .map(([d, p]) => `${d} (${p.name}, ${p.user_name ?? 'no account'})`).join('; ')}`);
};

/** A private user-data-dir holding only the sign-in state of the named profile. */
const seedProfile = (name) => {
  const dest = resolve(ROOT, '.chrome', name);
  if (existsSync(resolve(dest, 'Default', 'Preferences')) && !flag('reseed')) return dest;
  const dir = resolveProfileDir(name);
  const src = resolve(CHROME_HOME, dir);
  rmSync(dest, {recursive: true, force: true});
  mkdirSync(resolve(dest, 'Default'), {recursive: true});
  const PARTS = ['Cookies', 'Cookies-journal', 'Network/Cookies', 'Network/Cookies-journal',
                 'Local Storage', 'Session Storage', 'IndexedDB', 'Preferences'];
  const copied = [];
  for (const part of PARTS) {
    const from = resolve(src, part);
    if (!existsSync(from)) continue;
    const to = resolve(dest, 'Default', part);
    mkdirSync(dirname(to), {recursive: true});
    cpSync(from, to, {recursive: true});
    copied.push(part);
  }
  console.error(`seeded .chrome/${name}/ from Chrome profile "${dir}": ${copied.join(', ')}`);
  return dest;
};

const launch = async () => {
  let bin, userDataDir, extra;
  if (PROFILE) {
    if (!existsSync(SYSTEM_CHROME)) die(`Google Chrome not found at ${SYSTEM_CHROME}`);
    bin = SYSTEM_CHROME;
    userDataDir = seedProfile(PROFILE);
    extra = [`--window-size=${W},${H + 88}`, '--disable-session-crashed-bubble', '--hide-crash-restore-bubble'];
  } else {
    bin = findHeadlessShell();
    if (!bin) die('Remotion\'s chrome-headless-shell is not downloaded; run any remotion render once, or pass --profile');
    userDataDir = resolve(ROOT, '.chrome', '_headless');
    mkdirSync(userDataDir, {recursive: true});
    extra = ['--headless', `--window-size=${W},${H}`];
  }
  rmSync(resolve(userDataDir, 'DevToolsActivePort'), {force: true});
  const args = ['--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run',
                '--no-default-browser-check', '--disable-infobars', '--lang=vi-VN', ...extra, 'about:blank'];
  const child = spawn(bin, args, {stdio: ['ignore', 'ignore', 'pipe'], detached: KEEP});
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const portFile = resolve(userDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 300; i++) {
    if (child.exitCode != null) die(`browser exited early (${child.exitCode}): ${stderr.slice(-400)}`);
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
      if (port && path) return {child, port: Number(port), browserWs: `ws://127.0.0.1:${port}${path}`};
    }
    await sleep(100);
  }
  die(`browser opened no DevTools port in 30s: ${stderr.slice(-400)}`);
};

// ---------------------------------------------------------------- devtools protocol

class CDP {
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, {once: true});
      ws.addEventListener('error', () => rej(new Error(`cannot connect to ${wsUrl}`)), {once: true});
    });
    return new CDP(ws);
  }
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.listeners = new Set();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const {res, rej} = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message}${m.error.data ? ` — ${m.error.data}` : ''}`)) : res(m.result);
      } else if (m.method) {
        for (const l of this.listeners) l(m);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((res, rej) => this.pending.set(id, {res, rej}));
  }
  once(method, timeout) {
    return new Promise((res, rej) => {
      const l = (m) => { if (m.method === method) { this.listeners.delete(l); clearTimeout(t); res(m.params); } };
      const t = setTimeout(() => { this.listeners.delete(l); rej(new Error(`timed out waiting for ${method}`)); }, timeout);
      this.listeners.add(l);
    });
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close() { this.ws.close(); }
}

// ---------------------------------------------------------------- real Chrome (delegated)

if (REAL) {
  const {spawnSync} = await import('node:child_process');
  const python = process.env.TTS_PYTHON ?? resolve(ROOT, '../video-factory/.venv/bin/python');
  if (!existsSync(python)) die(`real-Chrome capture needs ../video-factory/.venv (python with pyobjc); not found at ${python}`);
  const name = PROFILE ?? localProfile();
  const dir = resolveProfileDir(name);
  const info = JSON.parse(readFileSync(resolve(CHROME_HOME, 'Local State'), 'utf8')).profile.info_cache[dir];
  const args = [resolve(ROOT, 'scripts/shoot_real.py'), '--url', url, '--out', out,
                '--profile-dir', dir, '--profile-title', info.name, '--wait', String(WAIT / 1000),
                '--size', opt('size', '1080x640')];
  if (opt('symbol')) args.push('--symbol', opt('symbol'));
  if (site) args.push('--site', site, '--title-contains', site === 'fireant' ? 'FireAnt' : opt('title-contains', ''));
  else if (opt('title-contains')) args.push('--title-contains', opt('title-contains'));
  if (flag('fullscreen-chart')) args.push('--fullscreen-chart');
  if (opt('symbol-box')) args.push('--symbol-box', opt('symbol-box'));
  if (opt('range')) args.push('--range', opt('range'));
  if (opt('interval')) args.push('--interval', opt('interval'));
  if (flag('reset-view')) args.push('--reset-view');
  if (opt('pan')) args.push('--pan', opt('pan'));
  if (opt('zoom-out')) args.push('--zoom-out', opt('zoom-out'));
  if (opt('indicator')) args.push('--indicator', opt('indicator'));
  if (opt('tab')) args.push('--tab', opt('tab'));
  if (opt('restore-symbol')) args.push('--restore-symbol', opt('restore-symbol'));
  if (opt('restore-tab')) args.push('--restore-tab', opt('restore-tab'));
  if (opt('hover-back') != null) args.push('--hover-back', opt('hover-back'));
  // FireAnt: the panel wants the chart, not the header and order book around it.
  args.push('--crop', opt('crop', site === 'fireant' ? 'chart' : 'full'));
  if (KEEP) args.push('--keep-open');
  if (flag('debug')) args.push('--debug');
  console.error(`real Chrome · profile ${dir} (${info.name}) · hands off the mouse for ~25s`);
  const r = spawnSync(python, args, {stdio: 'inherit'});
  process.exit(r.status ?? 1);
}
const COOKIES = opt('cookies');
const EVAL = opt('eval');

// ---------------------------------------------------------------- capture

const {child, port, browserWs} = await launch();
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = targets.find((t) => t.type === 'page');
if (!target) target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
const page = await CDP.open(target.webSocketDebuggerUrl);
const network = {allowed: [], blocked: []};
let jsResult;

try {
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  if (GUARD) {
    // Pause every request to the site at the Request stage; let reads through, fail any other
    // method unless its path was allowed. Nothing blocked here ever reaches the server.
    const host = new URL(url).host;
    page.listeners.add((m) => {
      if (m.method !== 'Fetch.requestPaused') return;
      const {requestId, request} = m.params;
      const method = request.method.toUpperCase();
      const path = new URL(request.url).pathname;
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        page.send('Fetch.continueRequest', {requestId}).catch(() => {});
      } else if (ALLOW_POST.includes(path)) {
        network.allowed.push(`${method} ${path}`);
        page.send('Fetch.continueRequest', {requestId}).catch(() => {});
      } else {
        network.blocked.push(`${method} ${path}`);
        console.error(`shoot: BLOCKED ${method} ${path} (not in --allow-post)`);
        page.send('Fetch.failRequest', {requestId, errorReason: 'BlockedByClient'}).catch(() => {});
      }
    });
    await page.send('Fetch.enable', {patterns: [{urlPattern: `*://${host}/*`, requestStage: 'Request'}]});
  }
  if (JS_ARGS) await page.send('Page.addScriptToEvaluateOnNewDocument', {source: `window.__SHOOT_ARGS = ${JS_ARGS};`});
  if (INIT_JS) await page.send('Page.addScriptToEvaluateOnNewDocument', {source: readFileSync(resolve(ROOT, INIT_JS), 'utf8')});
  await page.send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: SCALE, mobile: false});
  if (flag('dark')) await page.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: 'dark'}]});

  const loaded = page.once('Page.loadEventFired', 45000);
  await page.send('Page.navigate', {url});
  await loaded;
  await sleep(WAIT);

  if (WAIT_FOR) {
    const t0 = Date.now();
    for (;;) {
      const ok = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(WAIT_FOR)}); return !!el && el.getBoundingClientRect().width > 0; })()`);
      if (ok) break;
      if (Date.now() - t0 > 30000) die(`"${WAIT_FOR}" never appeared. Page text starts: ${(await page.eval('document.body.innerText.slice(0,300)')).replace(/\s+/g, ' ')}`);
      await sleep(250);
    }
  }
  if (COOKIES) {
    const {cookies} = await page.send('Network.getCookies', {urls: [`https://${COOKIES}`, `https://www.${COOKIES}`]});
    console.error(`cookies for ${COOKIES}: ${cookies.length}`);
    for (const c of cookies) console.error(`  ${c.domain.padEnd(24)} ${c.name.padEnd(40)} ${String(c.value).length} chars${c.session ? ' (session)' : ''}`);
  }
  if (EVAL) console.error(`eval: ${JSON.stringify(await page.eval(EVAL, true))}`);
  if (site && SITES[site].signedIn) {
    const ok = await SITES[site].signedIn(page);
    console.error(ok ? `${site}: signed in` : `${site}: NOT signed in on this browser — saved layouts will not show. Run with --profile=${PROFILE ?? localProfile()} --keep-open, sign in, then re-run.`);
  }
  if (site && SITES[site].prepare) await SITES[site].prepare(page, opt('symbol'));
  if (CLICK) {
    const [x, y] = CLICK.split(',').map(Number);
    await click(page, x, y);
    await sleep(800);
  }
  if (TYPE) {
    await type(page, TYPE);
    await sleep(2000);   // let any autocomplete refresh before Enter commits the first row
    await pressEnter(page);
    await sleep(1500);
  }
  if (WAIT_TEXT) await waitText(page, WAIT_TEXT, 30000);
  if (JS) {
    const src = readFileSync(resolve(ROOT, JS), 'utf8');
    jsResult = await page.eval(`(async () => { ${src} })()`, true);
    await sleep(1500);
  }

  let clip = null;
  if (CLIP && CLIP !== 'full') {
    if (/^\d+,\d+,\d+,\d+$/.test(CLIP)) {
      const [x, y, width, height] = CLIP.split(',').map(Number);
      clip = {x, y, width, height};
    } else if (CLIP === 'canvases') {
      clip = await page.eval(`(() => {
        const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
        // Candidate 1: the smallest element holding every sizeable <canvas> in this document.
        const cs = [...document.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().width > 50);
        let byCanvas = null;
        if (cs.length) {
          byCanvas = cs[0];
          while (byCanvas && !cs.every((c) => byCanvas.contains(c))) byCanvas = byCanvas.parentElement;
        }
        // Candidate 2: the largest <iframe>. TradingView-style widgets draw inside one, which
        // this document cannot see into; the screenshot still includes its pixels.
        const byFrame = [...document.querySelectorAll('iframe')].sort((a, b) => area(b) - area(a))[0] ?? null;
        // A side panel's sparkline canvas must not win over the chart frame: take the larger.
        const el = [byCanvas, byFrame].filter((e) => e && e !== document.body).sort((a, b) => area(b) - area(a))[0] ?? null;
        if (!el) return null;
        el.scrollIntoView({block: 'start'});
        const r = el.getBoundingClientRect();
        return {x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height, tag: el.tagName + '.' + String(el.className).slice(0, 60)};
      })()`);
      if (!clip) die('--clip=canvases found neither chart canvases nor an iframe on the page');
      console.error(`clip: ${clip.tag} ${Math.round(clip.width)}×${Math.round(clip.height)}`);
      delete clip.tag;
      await sleep(300);
    } else {
      clip = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(CLIP)});
        if (!el) return null;
        el.scrollIntoView({block: 'center', inline: 'center'});
        const r = el.getBoundingClientRect();
        return {x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height};
      })()`);
      if (!clip) die(`--clip selector "${CLIP}" matched nothing`);
      await sleep(300);
    }
  }

  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...(clip ? {clip: {...clip, scale: 1}} : {}),
  });
  const outPath = resolve(ROOT, out);
  mkdirSync(dirname(outPath), {recursive: true});
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  const meta = {
    url, finalUrl: await page.eval('location.href'), title: await page.eval('document.title'),
    capturedAt: new Date().toISOString(), viewport: {width: W, height: H, scale: SCALE},
    clip: clip ?? 'full', profile: PROFILE ?? null, browser: PROFILE ? 'google-chrome' : 'chrome-headless-shell',
    ...(GUARD ? {network: {guard: 'non-GET failed unless allowed', allowPost: ALLOW_POST, ...network}} : {}),
    ...(jsResult !== undefined ? {js: jsResult} : {}),
  };
  writeFileSync(outPath.replace(/\.png$/, '') + '.json', JSON.stringify(meta, null, 2) + '\n');
  const px = clip ? `${Math.round(clip.width * SCALE)}×${Math.round(clip.height * SCALE)}` : `${W * SCALE}×${H * SCALE}`;
  console.log(`${out}  ${px}px  ← ${meta.finalUrl}`);
} finally {
  page.close();
  if (KEEP) {
    console.log('window left open (--keep-open)');
    child.unref();
  } else {
    try { const b = await CDP.open(browserWs); await b.send('Browser.close'); b.close(); } catch { child.kill(); }
  }
}
