/**
 * Builds content/vnindex-monthly.json.
 *
 * The anchors below are approximate VNINDEX monthly closes at the turning
 * points the reel actually argues about; months in between are interpolated in
 * log space and given a deterministic intramonth range so the candles read as
 * a real series rather than a smooth curve. Swap ANCHORS (or replace the
 * generated JSON wholesale with a real export) to retarget the chart.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ANCHORS = [
  ['2013-01', 460], ['2013-12', 505],
  ['2014-09', 640], ['2014-12', 545],
  ['2015-07', 640], ['2015-12', 579],
  ['2016-12', 665],
  ['2017-12', 984],
  ['2018-04', 1204], ['2018-07', 935], ['2018-12', 893],
  ['2019-11', 1024], ['2019-12', 961],
  ['2020-03', 660], ['2020-07', 798], ['2020-12', 1103],
  ['2021-07', 1310], ['2021-12', 1498],
  ['2022-01', 1528], ['2022-06', 1197], ['2022-11', 874], ['2022-12', 1007],
  ['2023-09', 1245], ['2023-12', 1130],
  ['2024-06', 1300], ['2024-12', 1267],
  ['2025-04', 1230], ['2025-08', 1520], ['2025-12', 1680],
  ['2026-04', 1790], ['2026-08', 1933], ['2026-09', 1878],
];

const idx = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};
const label = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

// Deterministic hash-based noise so the file regenerates byte-identically.
const noise = (i, salt) => {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  return ((h >>> 8) % 10000) / 10000; // 0..1
};

const first = idx(ANCHORS[0][0]);
const last = idx(ANCHORS.at(-1)[0]);

const closeAt = (i) => {
  let a = ANCHORS[0], b = ANCHORS.at(-1);
  for (let k = 0; k < ANCHORS.length - 1; k++) {
    if (i >= idx(ANCHORS[k][0]) && i <= idx(ANCHORS[k + 1][0])) {
      a = ANCHORS[k]; b = ANCHORS[k + 1];
      break;
    }
  }
  const ia = idx(a[0]), ib = idx(b[0]);
  if (ib === ia) return a[1];
  const t = (i - ia) / (ib - ia);
  // Smoothstep in log space: trends bend the way price actually does.
  const s = t * t * (3 - 2 * t);
  const v = Math.exp(Math.log(a[1]) * (1 - s) + Math.log(b[1]) * s);
  // Wobble, scaled down near anchors so the turning points stay exact.
  const wob = (noise(i, 1) - 0.5) * 0.035 * Math.sin(Math.PI * t);
  return v * (1 + wob);
};

const candles = [];
let prevClose = closeAt(first);
for (let i = first; i <= last; i++) {
  const c = closeAt(i);
  const o = prevClose;
  const body = Math.abs(c - o);
  const up = c >= o;
  const wickHi = body * (0.3 + noise(i, 2) * 0.9) + c * 0.006;
  const wickLo = body * (0.3 + noise(i, 3) * 0.9) + c * 0.006;
  const h = Math.max(o, c) + wickHi;
  const l = Math.min(o, c) - wickLo;
  // Volume rises with range and trends up over the decade.
  const drift = 0.55 + ((i - first) / (last - first)) * 0.9;
  const v = (0.35 + (body / c) * 6 + noise(i, 4) * 0.7) * drift;
  candles.push({
    t: label(i),
    o: +o.toFixed(2),
    h: +h.toFixed(2),
    l: +l.toFixed(2),
    c: +c.toFixed(2),
    v: +v.toFixed(3),
    up,
  });
  prevClose = c;
}

mkdirSync(resolve(ROOT, 'content'), {recursive: true});
const out = resolve(ROOT, 'content/vnindex-monthly.json');
writeFileSync(out, JSON.stringify(candles, null, 0) + '\n');
// LEGACY. Since 2026-09-23 the chart series is real data (fetch-market.mjs --source=ssi
// --replace-series). This reconstruction stays only as an offline stand-in, and it says so
// in the provenance file the footer and the docs read — it is never named as a source.
writeFileSync(out.replace(/\.json$/, '.meta.json'), JSON.stringify({
  source: 'reconstructed', sourceLabel: 'chuỗi dựng lại (make-series.mjs)', symbol: 'VNINDEX',
  resolution: 'monthly', reconstructed: true, fetchedAt: new Date().toISOString(),
  from: candles[0].t, to: candles[candles.length - 1].t, bars: candles.length,
  volumeUnit: 'arbitrary', note: 'interpolated between real turning points with deterministic noise; shape only',
}, null, 2) + '\n');
console.warn('WARNING: this is a RECONSTRUCTION. For real data: node scripts/fetch-market.mjs --symbol=VNINDEX --source=ssi --replace-series');
console.log(`wrote ${candles.length} monthly candles -> content/vnindex-monthly.json`);
console.log(`range ${candles[0].t} .. ${candles.at(-1).t}`);
const peak = candles.reduce((m, c) => (c.h > m.h ? c : m));
console.log(`series high ${peak.h} at ${peak.t}`);
