// node --test scripts/review/lib/sectors.test.mjs
// The weekly's sector leader (user 2026-10-10: "Get one of stock on this marjor best ranking to review 1-5 ranking"):
// the strongest stock of the #1 ICB group, falling to #2 … #5 only when the one above is already reviewed or has no chart.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sectorLeaderOf} from './sectors.mjs';

const R = {formats: {weekly: {sectors: {leader: {fromRanks: [1, 5], pick: 'strongest', count: 1}}}, daily: {}}};
const group = (rank, name, ...top) => ({rank, code: String(rank), name, short: name, top: top.map(([symbol, rs1m]) => ({symbol, rs1m})), strongest: top[0] ? {symbol: top[0][0], rs1m: top[0][1]} : null});
const S = {
  ok: true,
  groups: [
    group(1, 'Hàng hóa và dịch vụ công nghiệp', ['PVP', 96], ['GEE', 91]),
    group(2, 'Dịch vụ bán lẻ', ['PET', 96], ['FRT', 86]),
    group(3, 'Hóa chất', ['DRI', 95]),
    group(4, 'Dầu khí', ['BSR', 89]),
    group(5, 'Thực phẩm & Đồ uống', ['ANV', 93]),
    group(6, 'Ngân hàng', ['NVB', 97]),
  ],
};

test('the strongest stock of the #1 group', () => {
  const x = sectorLeaderOf({S, R, format: 'weekly'});
  assert.equal(x.symbol, 'PVP');
  assert.equal(x.groupRank, 1);
  assert.equal(x.group, 'Hàng hóa và dịch vụ công nghiệp');
  assert.equal(x.rs1m, 96);
  assert.deepEqual(x.skipped, []);
});

test('a name the user already requested falls to the next group — never to the #1 group\'s second stock', () => {
  const x = sectorLeaderOf({S, R, format: 'weekly', taken: ['PVP']});
  assert.equal(x.symbol, 'PET');
  assert.equal(x.groupRank, 2);
  assert.match(x.skipped[0].why, /already has a review scene/);
});

test('a name without a chart falls to the next group', () => {
  const x = sectorLeaderOf({S, R, format: 'weekly', taken: ['PVP'], noChart: (s) => (s === 'PET' ? 'no bars' : null)});
  assert.equal(x.symbol, 'DRI');
  assert.equal(x.skipped.length, 2);
  assert.match(x.reason, /#3/);
});

test('the pool stops at fromRanks[1]: the #6 group is never the sector leader', () => {
  const x = sectorLeaderOf({S, R, format: 'weekly', taken: ['PVP', 'PET', 'DRI', 'BSR', 'ANV']});
  assert.equal(x.symbol, null);
  assert.equal(x.skipped.length, 5);
});

test('no rule for the format, or no ranking: null', () => {
  assert.equal(sectorLeaderOf({S, R, format: 'daily'}), null);
  assert.equal(sectorLeaderOf({S: {ok: false, why: 'no cache'}, R, format: 'weekly'}), null);
  assert.equal(sectorLeaderOf({S: null, R, format: 'weekly'}), null);
});
