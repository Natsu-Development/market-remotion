/**
 * Shared plumbing for the market-review scripts: paths, the skill's rules, session time
 * in ICT, on-screen number formatting, and the only network calls the skill makes.
 *
 * Network policy (user, 2026-09-29): every call to zionle.io.vn is a GET, except
 * POST /api/stocks/filter — a read-only query the terminal's own Screener sends. `zionle()`
 * refuses any other POST before it leaves the machine. GET /api/config/{id} returns the
 * user's Telegram bot token in plain text, so callers take `metrics_filter` from it and
 * drop the rest; nothing here logs a response body.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRules} from '../../lib/rules.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const RULES_PATH = '.claude/skills/market-review/rules.json';

let RULES = null;
/** The market-review rules, engine constants inherited (scripts/lib/rules.mjs). */
export const rules = () => (RULES ??= loadRules(ROOT, {path: RULES_PATH}));

export const PATHS = {
  daily: 'content/review/vnindex.daily.json',
  filters: 'content/review/filters.json',
  snapshots: 'content/review/snapshots',
  analyze: 'content/review/analyze',
  archive: 'content/review/archive',
  cache: '.review-cache',
  shots: 'shots/review',
};

// ------------------------------------------------------------------ cli

export const cli = (argv = process.argv.slice(2)) => ({
  argv,
  flag: (n) => argv.includes(`--${n}`),
  opt: (n, d) => {
    const hit = argv.find((a) => a.startsWith(`--${n}=`));
    return hit ? hit.slice(n.length + 3) : d;
  },
  positional: argv.filter((a) => !a.startsWith('--')),
});

/** Exit 2 = the environment or the inputs are wrong, the same contract as verify.mjs. */
export const die = (msg, code = 2) => {
  console.error(msg);
  process.exit(code);
};

// ------------------------------------------------------------------ files

export const abs = (rel) => resolve(ROOT, rel);
export const readJson = (rel) => JSON.parse(readFileSync(abs(rel), 'utf8'));
export const tryJson = (rel) => {
  try { return readJson(rel); } catch { return null; }
};
export const writeJson = (rel, obj) => {
  mkdirSync(dirname(abs(rel)), {recursive: true});
  writeFileSync(abs(rel), JSON.stringify(obj, null, 2) + '\n');
  return rel;
};
/** An array of flat records, one per line: readable diffs for a file that grows by a line a day. */
export const writeRows = (rel, rows) => {
  mkdirSync(dirname(abs(rel)), {recursive: true});
  writeFileSync(abs(rel), `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
  return rel;
};
export const exists = (rel) => existsSync(abs(rel));

// ------------------------------------------------------------------ time (ICT)

const OFFSET_MS = 7 * 3600e3;
/** The wall clock in Hồ Chí Minh City: {date: 'YYYY-MM-DD', hm: 'HH:MM', dow: 0..6}. */
export const ict = (d = new Date()) => {
  const t = new Date(d.getTime() + OFFSET_MS);
  return {date: t.toISOString().slice(0, 10), hm: t.toISOString().slice(11, 16), dow: t.getUTCDay()};
};
/** The instant of `date` at `hm` ICT. */
export const ictInstant = (date, hm) => new Date(`${date}T${hm}:00+07:00`);
export const yymmdd = (date) => date.slice(2).replace(/-/g, '');
/** Monday of the ISO week holding `date`. */
export const weekStart = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400e3).toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ numbers on screen

export const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
/** Vietnamese decimal comma, no thousands separator — verify's facts check reads "1777,73" as one number. */
export const vi = (n, dp = 2) => Number(n).toFixed(dp).replace('.', ',');
/** "+1,56" / "−1,86" with a real minus sign. */
export const signed = (n, dp = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${vi(Math.abs(n), dp)}`;
/** 2026-09-11 -> "11/9". */
export const dm = (date) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d}/${m}`;
};
/** 2026-09-11 -> "11/9/2026". */
export const dmy = (date) => `${dm(date)}/${date.slice(0, 4)}`;

// ------------------------------------------------------------------ network

const UA = {'User-Agent': 'Mozilla/5.0', Accept: 'application/json'};

export const configId = () => {
  if (process.env.ZIONLE_CONFIG_ID) return process.env.ZIONLE_CONFIG_ID.trim();
  const f = abs('.zionle-config');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  die('no zionle config id — put it in .zionle-config or $ZIONLE_CONFIG_ID (CLAUDE.md, "Nguồn dữ liệu")');
};

const request = async (url, {method = 'GET', body, timeout = 45000} = {}) => {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? UA : {...UA, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new Error(`${method} ${url.replace(/config_id=[^&]+/, 'config_id=…')} failed: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 400 ? ' (config_id missing?)' : res.status === 404 && text.includes('configuration') ? ' (config_id wrong or expired)' : '';
    throw new Error(`${method} ${url.replace(/config_id=[^&]+/, 'config_id=…')} -> ${res.status}${hint}: ${text.slice(0, 160)}`);
  }
  return JSON.parse(text);
};

/**
 * A call to the user's terminal. GET unless `body` is given; a body is only allowed for the
 * screener endpoint in rules.screener.endpoint. `withId` appends ?config_id=.
 */
export const zionle = async (path, {body, withId = true, timeout} = {}) => {
  if (body !== undefined && path !== rules().screener.endpoint) {
    throw new Error(`refusing POST ${path}: the only POST this skill may send is ${rules().screener.endpoint} (user rule, 2026-09-29)`);
  }
  const url = new URL(path, 'https://zionle.io.vn');
  if (withId) url.searchParams.set('config_id', configId());
  return request(url.toString(), {method: body === undefined ? 'GET' : 'POST', body, timeout});
};

/** SSI iBoard daily bars {t, o, h, l, c, v} (points, matched volume), oldest first. No auth. */
export const ssiDaily = async (symbol, fromIso, now = new Date()) => {
  const from = Math.floor(new Date(`${fromIso}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(now.getTime() / 1000) + 86400;
  const url = `https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`;
  const body = await request(url);
  const d = body?.data;
  if (!d?.t?.length) throw new Error(`SSI returned no bars for ${symbol}: ${JSON.stringify(body).slice(0, 160)}`);
  return {
    url,
    bars: d.t.map((t, i) => ({
      t: new Date(Number(t) * 1000 + OFFSET_MS).toISOString().slice(0, 10),
      o: Number(d.o[i]), h: Number(d.h[i]), l: Number(d.l[i]), c: Number(d.c[i]), v: Number(d.v[i] ?? 0),
    })),
  };
};

/**
 * Keep only finished sessions: a bar dated today (ICT) before the session close is still
 * moving. Returns the bars and the date that was dropped, if any.
 */
export const finishedBars = (bars, now = new Date()) => {
  const {date, hm} = ict(now);
  const last = bars[bars.length - 1];
  if (last && last.t === date && hm < rules().market.sessionClose) return {bars: bars.slice(0, -1), dropped: last.t};
  return {bars, dropped: null};
};

// ------------------------------------------------------------------ images

/** [width, height] of a PNG, read from its IHDR chunk. */
export const pngSize = (rel) => {
  const b = readFileSync(abs(rel));
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${rel} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
