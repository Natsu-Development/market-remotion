// node --test scripts/review/lib/requested.test.mjs — the "Soi thêm mã" box: which key a reel's requests live under, and
// which names its list shows (lib/requested.mjs). A synthetic rules object, so the weekly's work on rules.json cannot
// break these.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestKey, requestPool, requestsPath} from './requested.mjs';

const R = {
  screener: {scenes: {spike: {photo: 'Volume spike'}, rs: {photo: 'RS Strong'}, uptrend: {photo: 'Uptrend'}}, requested: {listMinFilters: 2}},
  formats: {daily: {}, weekly: {screener: {scenes: {breakout: {photo: 'Momentum breakout'}, breakdown: {photo: 'Momentum breakdown'}}}}},
};
const members = {spike: ['AAA', 'BBB'], rs: ['AAA', 'BBB', 'CCC'], uptrend: ['AAA', 'CCC'], breakout: ['DDD', 'EEE'], breakdown: ['EEE', 'FFF']};
const rows = new Map([['AAA', {rs_1m: 80}], ['BBB', {rs_1m: 95}], ['CCC', {rs_1m: 90}], ['DDD', {rs_1m: 70}], ['EEE', {rs_1m: 20}], ['FFF', {rs_1m: 60}]]);

test('the daily keeps the bare date; another format gets its own key and file', () => {
  assert.equal(requestKey('daily', '2026-10-06'), '2026-10-06');
  assert.equal(requestKey(undefined, '2026-10-06'), '2026-10-06');
  assert.equal(requestKey('weekly', '2026-10-06'), '2026-10-06-weekly');
  assert.equal(requestsPath(requestKey('weekly', '2026-10-06')), 'content/review/requests/2026-10-06-weekly.json');
});

test('the daily lists names in at least two of the shared three filters, most filters first, then RS 1M', () => {
  const r = requestPool({R, format: 'daily', members, rows, taken: ['AAA']});
  assert.equal(r.own, false);
  assert.equal(r.min, 2);
  assert.deepEqual(r.scenes.map((s) => s.label), ['Volume spike', 'RS Strong', 'Uptrend']);
  assert.deepEqual(r.pool.map((p) => p.sym), ['AAA', 'BBB', 'CCC']);
  assert.deepEqual(r.pool[0].filters, ['Volume spike', 'RS Strong', 'Uptrend']);
  assert.equal(r.pool[0].reviewed, true);
  assert.ok(!r.pool.some((p) => ['DDD', 'EEE', 'FFF'].includes(p.sym)), 'the weekly Momentum names stay off the daily list');
});

test("a format with its own scenes lists THEIR names, every one in at least one filter", () => {
  const r = requestPool({R, format: 'weekly', members, rows});
  assert.equal(r.own, true);
  assert.equal(r.min, 1);
  assert.deepEqual(r.scenes.map((s) => s.label), ['Momentum breakout', 'Momentum breakdown']);
  assert.deepEqual(r.pool.map((p) => p.sym), ['EEE', 'DDD', 'FFF']);
  assert.deepEqual(r.pool[0].filters, ['Momentum breakout', 'Momentum breakdown']);
});
