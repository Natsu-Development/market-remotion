#!/usr/bin/env node
/**
 * Contact sheets of the frames where a reel's camera or entrances can go wrong — so the director looks at
 * the moves, not only at the settled still of each beat that the review page shows — and a frame-by-frame
 * check of every photo scene's plates and camera.
 *
 *   node scripts/frame-audit.mjs DailyReview                      → out/audit/review-daily/<scene>.jpg (+ frames/)
 *   node scripts/frame-audit.mjs Channel --scenes=channel-hook,channel-action
 *   node scripts/frame-audit.mjs DailyReview --tag=before         → out/audit/review-daily-before/…
 *   node scripts/frame-audit.mjs DailyReview --props=<reel.json>  render a reel file that is not on disk under its id
 *   node scripts/frame-audit.mjs DailyReview --scale=0.5 --cols=3 --full
 *   node scripts/frame-audit.mjs DailyReview --check              no rendering: measure every frame (see check())
 *
 * Per scene the sheets show: the panel's entrance (the reveal sweep of a photo, the first rows of a board),
 * every beat start and 6, 12, … 48 frames after it (a camera move and the marks that pop with it), each
 * beat's mid-hold and last frame, and the scene's last settled frame before the fade. ONE bundle and ONE
 * browser serve every still (~0.2 s a frame), unlike `npx remotion still`, which bundles each time.
 *
 * What to look for on a sheet (user 2026-10-01: "not be overlap or cut by zoom-in or zoom-out, but has
 * smooth animation"): a plate or mark cut by the panel edge mid-move, two plates on top of each other, a
 * plate over the candle it points at, a mark of the current beat outside the view, a camera that lunges
 * past its target or shows the cut-away toolbar, a jump between two neighbouring samples.
 * The sheet crops each frame to the panel (plus the headline under it); `--full` keeps the whole frame.
 * The sheets need PIL from the video-factory venv (`$TTS_PYTHON`, as for the voice).
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {reels} from './lib/reels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const flag = (n) => argv.includes(`--${n}`);
const id = argv.find((a) => !a.startsWith('--'));
const REG = reels(ROOT);
if (!id || !REG.has(id)) {
  console.error(`Usage: node scripts/frame-audit.mjs <${[...REG.keys()].join(' | ')}> [--check] [--scenes=a,b] [--tag=t] [--props=reel.json] [--scale=0.5] [--cols=3] [--full]`);
  process.exit(2);
}
const contentPath = REG.get(id);
const props = opt('props');
const reel = JSON.parse(readFileSync(resolve(ROOT, props ?? contentPath), 'utf8'));
const content = reel.reel ?? reel;
const name = basename(contentPath, '.json');
const tag = opt('tag');
const OUT = resolve(ROOT, opt('out', `out/audit/${name}${tag ? `-${tag}` : ''}`));
const SCALE = Number(opt('scale', '0.5'));
const COLS = Number(opt('cols', '3'));
const only = opt('scenes') ? new Set(opt('scenes').split(',')) : null;
const FPS = 30;

/** Scene-local frames worth looking at. */
const samplesOf = (scene) => {
  const dur = Math.round(scene.duration * FPS);
  const starts = scene.beats.map((b) => Math.round(b.at * FPS));
  const out = new Map();
  const add = (f, label) => {
    const k = Math.max(0, Math.min(dur - 1, Math.round(f)));
    if (!out.has(k)) out.set(k, label);
  };
  // Entrance: the panel rises in (2–24), a photo's reveal sweeps 4–44 and its first marks pop from ~34.
  for (const f of [2, 12, 24, 36]) add(f, `in +${f}`);
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : dur - 15;
    for (const d of [0, 6, 12, 18, 24, 30, 36, 48]) if (s + d < end) add(s + d, `b${k} +${d}`);
    add((s + end) / 2, `b${k} hold`);
    add(end - 1, `b${k} end`);
  });
  add(dur - 15, 'last');
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([frame, label]) => ({frame, label}));
};

let cursor = 0;
const timeline = content.scenes.map((s) => {
  const from = cursor;
  cursor += Math.round(s.duration * FPS);
  return {scene: s, from};
});
const jobs = timeline.filter(({scene}) => !only || only.has(scene.id));
if (!jobs.length) {
  console.error(`no scene matches --scenes=${opt('scenes')}`);
  process.exit(2);
}

if (flag('check')) process.exit(await check());

const {bundle} = await import('@remotion/bundler');
const {openBrowser, renderStill, selectComposition} = await import('@remotion/renderer');

const t0 = Date.now();
console.log(`bundling ${ROOT}/src/index.ts …`);
const serveUrl = await bundle({entryPoint: resolve(ROOT, 'src/index.ts'), publicDir: resolve(ROOT, 'public')});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
const inputProps = props ? {reel: content} : {};
const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser});

const manifest = [];
let n = 0;
for (const {scene, from} of jobs) {
  const dir = resolve(OUT, 'frames', scene.id);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(dir, {recursive: true});
  const samples = samplesOf(scene);
  for (const s of samples) {
    const file = resolve(dir, `${String(s.frame).padStart(4, '0')}.jpg`);
    await renderStill({composition, serveUrl, output: file, frame: from + s.frame, imageFormat: 'jpeg', jpegQuality: 82, scale: SCALE, inputProps, puppeteerInstance: browser, overwrite: true});
    s.file = file;
    n++;
  }
  manifest.push({id: scene.id, type: scene.visual.type, from, samples});
  process.stdout.write(`  ${scene.id.padEnd(24)} ${samples.length} frames\n`);
}
await browser.close({silent: true});
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify({id, scale: SCALE, fps: FPS, scenes: manifest}, null, 1));

// Contact sheets with PIL (the video-factory venv): crop to the panel + headline, label every tile.
const PY = process.env.TTS_PYTHON ?? resolve(ROOT, '../video-factory/.venv/bin/python');
const py = `
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
m = json.load(open(sys.argv[1])); out = sys.argv[2]; cols = int(sys.argv[3]); full = sys.argv[4] == '1'
sc = m['scale']
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 18)
for s in m['scenes']:
    tiles = []
    for smp in s['samples']:
        im = Image.open(smp['file']).convert('RGB')
        if not full:
            # image panel: y 500..1252; drawn panel: y 640..1200; headline to ~1440 (full-resolution px)
            im = im.crop((int(20*sc), int(470*sc), int(1060*sc), int(1460*sc)))
        tiles.append((smp, im))
    if not tiles: continue
    tw, th = tiles[0][1].size
    per = cols * 4
    for page in range(math.ceil(len(tiles) / per)):
        chunk = tiles[page*per:(page+1)*per]
        rows = math.ceil(len(chunk) / cols)
        sheet = Image.new('RGB', (cols*tw + (cols+1)*8, rows*(th+30) + 8), (30, 30, 34))
        d = ImageDraw.Draw(sheet)
        for i, (smp, im) in enumerate(chunk):
            x = 8 + (i % cols) * (tw + 8); y = 8 + (i // cols) * (th + 30)
            d.text((x, y), f"{smp['label']}  ·  f{smp['frame']}", fill=(255, 210, 90), font=font)
            sheet.paste(im, (x, y + 24))
        name = s['id'] + ('' if page == 0 else f'-{page+1}') + '.jpg'
        sheet.save(f"{out}/{name}", quality=85)
        print(f"{out}/{name}")
`;
if (!existsSync(PY)) {
  console.error(`frames are in ${OUT}/frames, but no python at ${PY} for the sheets (set TTS_PYTHON to the video-factory venv)`);
  process.exit(1);
}
const r = spawnSync(PY, ['-c', py, resolve(OUT, 'manifest.json'), OUT, String(COLS), flag('full') ? '1' : '0'], {encoding: 'utf8'});
if (r.status !== 0) {
  console.error(r.stderr || r.error);
  process.exit(1);
}
console.log(r.stdout.trim());
console.log(`${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}`);

/**
 * --check: no rendering. Every frame of every photo scene goes through src/lib/photoLayout.ts — the module
 * ImagePanel draws with — and the plates, marks and camera are measured:
 *   cut      a plate (≥ 50% visible) not wholly inside the camera's frame
 *   overlap  two plates (both ≥ 50% visible) covering each other by more than 1% of the smaller one
 *            (the lines of one stacked caption touch on purpose and are not counted)
 *   covers   a plate over another mark's ringed candle or arrow head
 *   outside  a mark the shot has to show (not a free caption) out of frame once the move has settled
 *   painted  the camera showing past the painted region of the photo
 *   jump     a plate moving on screen more than 6 px a frame faster than the photo under it (a push, not a move)
 *   beyond   (note) a mark drawn past the photo's own edge — the scaffold's to move; not counted as a defect
 * and per camera move the peak speed (px/frame on screen at the frame's centre, log-zoom included).
 * Exit 1 when any defect is found.
 */
async function check() {
  process.removeAllListeners('warning');
  const L = await import(pathToFileURL(resolve(ROOT, 'src/lib/photoLayout.ts')).href);
  const {spring} = await import('remotion');
  const pop = (f, delay) => spring({frame: f - delay, fps: FPS, config: {damping: 14, mass: 0.5, stiffness: 120}});
  const theme = readFileSync(resolve(ROOT, 'src/theme.ts'), 'utf8');
  const box = theme.match(/imagePanel:\s*\{[^}]*width:\s*(\d+),\s*height:\s*(\d+)/);
  const BW = Number(box[1]), BH = Number(box[2]);
  const pngSize = (rel) => {
    const b = readFileSync(resolve(ROOT, 'public', rel));
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
  const inter = (a, b) => ({x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)});
  let defects = 0;
  for (const {scene} of jobs) {
    const v = scene.visual;
    if (v.type !== 'image') continue;
    const H = v.caption ? BH - 48 : BH;
    const g = L.photoGeometry(pngSize(v.src), v.crop, BW, H, v.fit ?? 'cover', v.focus ?? 'center');
    const anns = v.annotations ?? [];
    const fitted = v.shots?.length ? L.fitShots(v.shots, anns, g) : null;
    const dur = Math.round(scene.duration * FPS);
    const starts = scene.beats.map((b) => Math.round(b.at * FPS));
    const found = new Map();
    const note = (kind, f, what) => {
      const key = `${kind}|${what}`;
      const hit = found.get(key);
      if (hit) { hit.last = f; hit.n++; } else found.set(key, {kind, what, first: f, last: f, n: 1});
    };
    let prev = null;
    const speeds = [];
    for (let f = 0; f < dur; f++) {
      if (!fitted) break; // a photo without shots only pushes in slowly; nothing to measure
      let bi = 0;
      for (let k = 0; k < starts.length; k++) if (f >= starts[k]) bi = k;
      const beatFrame = f - starts[bi];
      const cam = L.camAt(fitted, bi, starts, f, g);
      const view = L.viewOf(cam, g);
      const ui = L.uiOf(cam.z);
      const live = L.markStates(anns, bi, beatFrame, (beat) => L.settleDelay(fitted, beat, starts), pop);
      const plates = L.framePlates(live, g, view, ui, L.reserveOf(fitted, bi, beatFrame, starts));
      const vis = [...plates.values()].filter((p) => p.alpha * p.placed.opacity >= 0.5);
      const label = (p) => `"${p.spec.text}"`;
      for (const p of vis) {
        const r = p.placed.rect;
        if (r.x < view.x0 - 0.5 || r.y < view.y0 - 0.5 || r.x + r.w > view.x1 + 0.5 || r.y + r.h > view.y1 + 0.5) note('cut', f, label(p));
      }
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        if (L.stacked(vis[i].spec, vis[j].spec)) continue;
        const o = area(inter(vis[i].placed.rect, vis[j].placed.rect));
        if (o > 0.01 * Math.min(area(vis[i].placed.rect), area(vis[j].placed.rect))) note('overlap', f, `${label(vis[i])} × ${label(vis[j])}`);
      }
      for (const st of live) {
        if (st.s < 0.9 || st.gone > 0) continue;
        const ob = L.obstacleOf(st.a, st.k, g, ui, 1);
        if (!ob) continue;
        for (const p of vis) if (p.spec.key !== st.k && area(inter(p.placed.rect, ob.rect)) > 0.15 * area(ob.rect)) note('covers', f, `${label(p)} over ${st.a.kind} #${st.k}`);
      }
      const si = L.shotIndexAt(fitted, bi);
      const settled = f >= L.shotStart(fitted[si], starts) + (si > 0 ? L.moveLength(fitted, si, starts) : 0);
      if (settled) {
        for (const a of L.marksForShot(fitted, si, anns)) {
          const st = live.find((x) => x.a === a);
          if (!st || st.s < 0.9 || st.gone > 0) continue;
          const X = (fx) => g.full.x + fx * g.full.w, Y = (fy) => g.full.y + fy * g.full.h;
          const pts = a.kind === 'box' ? [[X(a.x), Y(a.y)], [X(a.x + a.w), Y(a.y + a.h)]]
            : a.kind === 'circle' ? [[X(a.x), Y(a.y)]]
            : a.kind === 'arrow' ? [[X(a.from[0]), Y(a.from[1])], [X(a.to[0]), Y(a.to[1])]]
            : a.kind === 'hline' ? [[(view.x0 + view.x1) / 2, Y(a.y)]]
            : a.kind === 'vline' ? [[X(a.x), (view.y0 + view.y1) / 2]]
            : [];
          // Clipped to the painted photo: a mark drawn past the photo's own edge is the scaffold's to move, not the camera's.
          const cl = ([x, y]) => [Math.min(Math.max(x, g.shown.x), g.shown.x + g.shown.w), Math.min(Math.max(y, g.shown.y), g.shown.y + g.shown.h)];
          if (pts.some(([x, y]) => x < g.shown.x - 1 || x > g.shown.x + g.shown.w + 1 || y < g.shown.y - 1 || y > g.shown.y + g.shown.h + 1)) note('beyond', f, `${a.kind} #${anns.indexOf(a)} reaches past the photo's edge (scaffold)`);
          if (pts.map(cl).some(([x, y]) => x < view.x0 - 1 || x > view.x1 + 1 || y < view.y0 - 1 || y > view.y1 + 1)) note('outside', f, `${a.kind} #${anns.indexOf(a)}${a.label ? ` "${a.label}"` : ''}`);
        }
      }
      const rx0 = -cam.tx / cam.z, rx1 = (BW - cam.tx) / cam.z, ry0 = -cam.ty / cam.z, ry1 = (H - cam.ty) / cam.z;
      const fitsX = cam.z * g.shown.w <= BW + 1, fitsY = cam.z * g.shown.h <= H + 1;
      if ((!fitsX && (rx0 < g.shown.x - 0.5 || rx1 > g.shown.x + g.shown.w + 0.5)) || (!fitsY && (ry0 < g.shown.y - 0.5 || ry1 > g.shown.y + g.shown.h + 0.5))) note('painted', f, 'view past the painted region');
      // Motion: screen speed of the photo point at the frame's centre (log-zoom included), and plates'
      // own motion: a plate "jumps" when it moves faster on screen than the photo under it by more than
      // 6 px in a frame — a plate held at the frame's edge moves slower than the photo, a plate riding the
      // photo moves with it.
      const cx = (BW / 2 - cam.tx) / cam.z, cy = (H / 2 - cam.ty) / cam.z;
      if (prev) {
        const sx = cx * prev.cam.z + prev.cam.tx, sy = cy * prev.cam.z + prev.cam.ty;
        const zoomPx = Math.abs(Math.log(cam.z / prev.cam.z)) * Math.hypot(BW, H) / 2;
        const shot = fitted[L.shotIndexAt(fitted, bi)];
        if (!(shot.cut && f === L.shotStart(shot, starts))) speeds.push({f, beat: bi, v: Math.hypot(sx - BW / 2, sy - H / 2) + zoomPx});
        for (const p of vis) {
          const q = prev.plates.get(p.spec.key);
          if (!q || q.alpha * q.placed.opacity < 0.5) continue;
          const scr = (r, c) => [r.x * c.z + c.tx, r.y * c.z + c.ty];
          const [ax, ay] = scr(p.placed.rect, cam), [bx, by] = scr(q.placed.rect, prev.cam);
          const [lx, ly] = scr(q.placed.rect, cam);
          if (Math.hypot(ax - bx, ay - by) > Math.hypot(lx - bx, ly - by) + 6) note('jump', f, label(p));
        }
      }
      prev = {cam, plates};
    }
    const peak = new Map();
    for (const s of speeds) peak.set(s.beat, Math.max(peak.get(s.beat) ?? 0, s.v));
    const motion = [...peak.entries()].map(([b, x]) => `b${b} ${x.toFixed(1)}`).join(' · ');
    const list = [...found.values()];
    const nDef = list.filter((d) => d.kind !== 'beyond').length;
    defects += nDef;
    console.log(`${scene.id.padEnd(24)} ${nDef ? `${nDef} defect(s)` : 'clean'}   peak camera px/frame: ${motion || '—'}`);
    for (const d of list) console.log(`    ${d.kind.padEnd(8)} f${d.first}${d.last !== d.first ? `–${d.last}` : ''} (${d.n} frames)  ${d.what}`);
  }
  console.log(defects ? `\n${defects} defect(s)` : '\nno defects');
  return defects ? 1 : 0;
}
