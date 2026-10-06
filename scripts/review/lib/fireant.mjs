/**
 * FireAnt's public market page (https://fireant.vn/thi-truong) lists, next to each index, the
 * session's advancers, unchanged and decliners: "VN-INDEX 9.307 tỷ 1779.90 +2.17 (+0.12%) ▲ 132
 * ● 54 ▼ 166". It needs no sign-in, so it is read with the headless shell (scripts/shoot.mjs
 * --eval), never the user's Chrome. The page always shows the LATEST session — intraday while the
 * market is open — so the caller checks that the index value shown equals the session's close
 * before trusting the counts (user, 2026-09-30: "see FireAnt's Biến động thị trường").
 */
import {spawnSync} from 'node:child_process';
import {ROOT} from './common.mjs';

const URL = 'https://fireant.vn/thi-truong';
const NAMES = {'VN-INDEX': 'HSX', 'HNX-INDEX': 'HNX', UPCOM: 'UPCOM'};

/** @returns {{url, fetchedAt, text, exchanges: {HSX?: {...}}} | null} */
export const fetchFireantBreadth = (outPng) => {
  const expr = `(() => document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1200))()`;
  const r = spawnSync('node', ['scripts/shoot.mjs', `--url=${URL}`, '--profile=none', '--viewport=1400x1000', '--scale=1', '--wait=7000', `--eval=${expr}`, `--out=${outPng}`], {cwd: ROOT, encoding: 'utf8', timeout: 120000});
  const line = `${r.stderr}\n${r.stdout}`.split('\n').find((l) => l.startsWith('eval: '));
  if (!line) return null;
  let text;
  try { text = JSON.parse(line.slice(6)); } catch { return null; }
  if (typeof text !== 'string') return null;
  const exchanges = {};
  for (const [label, key] of Object.entries(NAMES)) {
    const m = text.match(new RegExp(`${label.replace('-', '\\-')}\\s+[\\d.,]+\\s*tỷ\\s+([\\d.]+)\\s+([+-][\\d.]+)\\s+\\(([+-][\\d.]+)%\\)\\s+▲\\s*(\\d+)\\s+●\\s*(\\d+)\\s+▼\\s*(\\d+)`));
    if (!m) continue;
    exchanges[key] = {index: Number(m[1]), change: Number(m[2]), changePercent: Number(m[3]), up: Number(m[4]), flat: Number(m[5]), down: Number(m[6]), total: Number(m[4]) + Number(m[5]) + Number(m[6])};
  }
  return Object.keys(exchanges).length ? {url: URL, fetchedAt: new Date().toISOString(), exchanges} : null;
};

/** The counts belong to `sessionClose`'s session when the page shows that close (±0.02). */
export const matchesSession = (fa, sessionClose) => !!fa?.exchanges?.HSX && Math.abs(fa.exchanges.HSX.index - sessionClose) < 0.02;
