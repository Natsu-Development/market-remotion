// Runs INSIDE the terminal's Screener page, through scripts/shoot.mjs --js (wrapped in an async
// function; its return value lands in the photo's sidecar as `js`). Arguments arrive as
// window.__SHOOT_ARGS (shoot.mjs --js-args):
//   {filter: 'Volume spike', sort: 'VOL/SMA', keep: ['SYMBOL', 'VOL/SMA', ...], rows: 10, zoom: 1.5}
// It clicks the saved filter by its name, sorts by one column (descending), hides the columns the
// scene does not talk about, enlarges the table and scrolls it to the top. The data is the
// terminal's own; nothing is typed into it and no filter is changed or saved.
// It fails loudly when the page no longer looks the way it was measured (2026-09-29).
const A = window.__SHOOT_ARGS ?? {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const bare = (s) => norm(s).replace(/[▲▼↕]/g, '').trim();
const results = () => {
  const m = document.body.innerText.match(/Results\s+(\d+)\s+stocks/);
  return m ? Number(m[1]) : null;
};
const until = async (cond, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (cond()) return true;
  return false;
};
const fail = (msg) => { throw new Error(`screener.js: ${msg}`); };

// 1. The saved filter, by its exact name among the "Saved:" buttons.
if (!(await until(() => results() !== null))) fail('no "Results N stocks" line — the page did not load');
const all = results();
const button = [...document.querySelectorAll('button')].find((b) => norm(b.innerText) === A.filter);
if (!button) fail(`no saved filter called "${A.filter}"`);
button.click();
if (!(await until(() => results() !== null && results() !== all))) fail(`the result count stayed at ${all} after clicking "${A.filter}"`);
await sleep(1200);
const count = results();

// 2. Sort descending by one column. The header labels are buttons inside the cells (measured
//    2026-09-29: a click on the cell itself does nothing); numeric columns sort descending first.
const headerCell = () => [...document.querySelectorAll('thead th')].find((th) => bare(th.innerText) === A.sort);
const sortButton = () => headerCell()?.querySelector('button') ?? headerCell();
if (!headerCell()) fail(`no column "${A.sort}"; columns: ${[...document.querySelectorAll('thead th')].map((t) => bare(t.innerText)).join(', ')}`);
sortButton().click();
await sleep(900);
if (norm(headerCell().innerText).includes('▲')) { sortButton().click(); await sleep(900); }
const arrow = norm(headerCell().innerText).match(/[▲▼]/)?.[0] ?? '?';
if (arrow !== '▼') fail(`"${A.sort}" did not sort descending (header reads "${norm(headerCell().innerText)}")`);

// 3. Keep only the columns the scene talks about (the first, unnamed column holds the row's badge).
const names = [...document.querySelectorAll('thead th')].map((th) => bare(th.innerText));
const hide = names.map((n, i) => (n && !(A.keep ?? names).includes(n) ? i + 1 : null)).filter(Boolean);
const style = document.createElement('style');
style.textContent = hide.map((k) => `thead th:nth-child(${k}), tbody td:nth-child(${k})`).join(',\n') + ' { display: none !important; }';
if (hide.length) document.head.appendChild(style);

// 4. The search box sits between the result count and the table; the photo does not need it.
// Walk up from the search input to the row that also holds the "Chart" button, and hide that row.
let searchRow = document.querySelector('input[placeholder^="Search symbol"]');
while (searchRow && ![...searchRow.querySelectorAll('button')].some((b) => norm(b.innerText) === 'Chart')) searchRow = searchRow.parentElement;
if (searchRow && !searchRow.querySelector('table')) searchRow.style.display = 'none';

// 5. Bigger type for a phone-sized frame. shoot.mjs then captures the whole page (clip=full).
if (A.zoom) document.documentElement.style.zoom = String(A.zoom);
await sleep(700);
const table = document.querySelector('table');
if (!table) fail('no results table');

// 6. Where everything is, in page CSS pixels of the zoomed layout — the space the full-page
//    capture uses (measured 2026-09-29). scripts/review/shots.mjs divides by the PNG's size.
const px = (r) => ({x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height)});
const frac = px;
const countLine = [...document.querySelectorAll('div, span, h2, h3')].find((e) => /^Results\s+\d+\s+stocks$/.test(norm(e.innerText)));
const chip = button;
const visible = (el) => getComputedStyle(el).display !== 'none';
const heads = [...document.querySelectorAll('thead th')];
const cols = Object.fromEntries(heads.filter(visible).map((th) => [bare(th.innerText), frac(th.getBoundingClientRect())]).filter(([n]) => n));
const rows = [...document.querySelectorAll('tbody tr')].slice(0, A.rows ?? 10).map((tr) => {
  const symbol = (tr.innerText.match(/\b[A-Z0-9]{3}\b/) ?? [null])[0];
  const tds = [...tr.querySelectorAll('td')];
  const cells = tds.map((td, i) => ({col: bare(heads[i]?.innerText), text: norm(td.innerText).slice(0, 60), rect: frac(td.getBoundingClientRect()), shown: visible(td)})).filter((c) => c.shown);
  return {symbol, rect: frac(tr.getBoundingClientRect()), cells: cells.map(({shown, ...c}) => c)};
});
// The table's own buttons (Columns, Export CSV) — the scaffold lays a label over them.
const ui = [...document.querySelectorAll('button')].filter((b) => /^(Columns \(\d+\)|Export CSV)$/.test(norm(b.innerText))).map((b) => ({text: norm(b.innerText), ...frac(b.getBoundingClientRect())}));
return {
  filter: A.filter,
  results: count,
  sortedBy: A.sort,
  arrow,
  columns: names.filter((n, i) => n && !hide.includes(i + 1)),
  header: frac(document.querySelector('thead').getBoundingClientRect()),
  table: frac(table.getBoundingClientRect()),
  countLine: countLine ? frac(countLine.getBoundingClientRect()) : null,
  cols,
  ui,
  chip: frac(chip.getBoundingClientRect()),
  rows,
  page: {w: Math.round(document.documentElement.getBoundingClientRect().width), h: Math.round(document.documentElement.getBoundingClientRect().height), zoom: A.zoom ?? 1},
  units: 'CSS px of the page as captured (full page)',
};
