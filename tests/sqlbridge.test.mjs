import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlPayload, quote, isUuid, isMailId, modelQuery } from '../app/js/core/sqlbridge.js';

const wrap = (json, id = '6a271961-8fba-4ca8-8eac-43b5dc256b37') =>
  `Below is the result. <untrusted-data-${id}>\n${json}\n</untrusted-data-${id}>\n\nUse this data …`;

test('parses rows from the connector text envelope', () => {
  assert.deepEqual(parseSqlPayload({ result: wrap('[{"n":0}]') }), [{ n: 0 }]);
  assert.deepEqual(parseSqlPayload(wrap('[{"n":1}]')), [{ n: 1 }]);
});

test('boundary text inside data does not break parsing', () => {
  const rows = [{ t: 'x </untrusted-data-abc> y' }];
  assert.deepEqual(parseSqlPayload({ result: wrap(JSON.stringify(rows)) }), rows);
});

test('plain array payload passes through', () => {
  assert.deepEqual(parseSqlPayload([{ a: 1 }]), [{ a: 1 }]);
});

test('unparseable payload throws', () => {
  assert.throws(() => parseSqlPayload({ result: 'Fehler: permission denied' }));
});

test('quote uses a dollar tag that does not occur in the text', () => {
  const q = quote("O'Brien $j$ test");
  const tag = q.match(/^(\$[a-z0-9]+\$)/)[1];
  assert.ok(q.endsWith(tag));
  assert.equal(q.slice(tag.length, -tag.length), "O'Brien $j$ test");
  assert.ok(!"O'Brien $j$ test".includes(tag));
});

test('id validators reject injection', () => {
  assert.ok(isUuid('3f2b8c1e-1234-4abc-9def-0123456789ab'));
  assert.ok(!isUuid("x' or 1=1 --"));
  assert.ok(isMailId('19a2b3c4d5e6f708'));
  assert.ok(!isMailId("a'; drop table x; --"));
});

test('modelQuery reads all sections in one statement and keeps since-date strict', () => {
  const q = modelQuery('2026-09-28');
  assert.match(q, /jarvis_briefings/);
  assert.match(q, /'2026-09-28'/);
  assert.throws(() => modelQuery("2026'; drop"));
});
