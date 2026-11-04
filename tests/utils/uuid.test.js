import test from 'node:test';
import assert from 'node:assert/strict';
import { createUuid, createSeededUuidFactory, isValidUuid } from '../../src/utils/UUID.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('createUuid returns a well-formed uuid', () => {
  const id = createUuid();
  assert.match(id, UUID_PATTERN);
  assert.ok(isValidUuid(id));
});

test('consecutive uuids differ', () => {
  const a = createUuid();
  const b = createUuid();
  assert.notEqual(a, b);
});

test('a seeded uuid is deterministic', () => {
  assert.equal(createUuid({ seed: 42 }), createUuid({ seed: 42 }));
  assert.notEqual(createUuid({ seed: 42 }), createUuid({ seed: 43 }));
});

test('the seeded factory replays the same sequence', () => {
  const a = createSeededUuidFactory('ritual');
  const b = createSeededUuidFactory('ritual');
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const id of seqA) assert.match(id, UUID_PATTERN);
});

test('the seeded factory produces unique ids', () => {
  const next = createSeededUuidFactory(1);
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) ids.add(next());
  assert.equal(ids.size, 200);
});

test('different seeds produce different sequences', () => {
  const a = createSeededUuidFactory(1);
  const b = createSeededUuidFactory(2);
  assert.notEqual(a(), b());
});

test('isValidUuid rejects malformed input', () => {
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(12345), false);
});
