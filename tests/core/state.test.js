import test from 'node:test';
import assert from 'node:assert/strict';
import { State, createState, DEFAULT_STATE } from '../../src/core/State.js';

test('state exposes the documented runtime keys', () => {
  const state = new State();
  const values = state.get();
  for (const key of [
    'breath',
    'colorA',
    'colorB',
    'emotionBias',
    'silenceTolerance',
    'tempoTolerance',
    'morphSoftness',
    'colorDriftSpeed',
    'silenceWeight',
    'morphProgress',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(values, key), `missing ${key}`);
  }
});

test('get returns a frozen snapshot that cannot mutate the state', () => {
  const state = new State();
  const values = state.get();
  assert.ok(Object.isFrozen(values));
  assert.throws(() => {
    'use strict';
    values.breath = 0.99;
  }, TypeError);
  assert.equal(state.get().breath, DEFAULT_STATE.breath);
});

test('set shallow-merges and returns the state for chaining', () => {
  const state = new State();
  const returned = state.set({ breath: 0.4, emotionBias: 0.75 });
  assert.equal(returned, state);
  assert.equal(state.get().breath, 0.4);
  assert.equal(state.get().emotionBias, 0.75);
  assert.equal(state.get().colorA, DEFAULT_STATE.colorA);
});

test('subscribers receive the new values and the applied patch', () => {
  const state = new State();
  const seen = [];
  state.subscribe((values, patch) => seen.push({ values, patch }));
  state.set({ breath: 0.25 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].values.breath, 0.25);
  assert.deepEqual(seen[0].patch, { breath: 0.25 });
});

test('unsubscribing stops notifications', () => {
  const state = new State();
  let count = 0;
  const unsubscribe = state.subscribe(() => {
    count += 1;
  });
  state.set({ breath: 0.1 });
  unsubscribe();
  state.set({ breath: 0.2 });
  assert.equal(count, 1);
});

test('reset restores the defaults and notifies subscribers', () => {
  const state = new State();
  let notified = false;
  state.subscribe(() => {
    notified = true;
  });
  state.set({ breath: 0.9 });
  state.reset();
  assert.equal(state.get().breath, DEFAULT_STATE.breath);
  assert.ok(notified);
});

test('nested objects are rejected to keep state flat', () => {
  const state = new State();
  assert.throws(() => state.set({ breath: { value: 1 } }), TypeError);
  assert.throws(() => state.set({ list: [1, 2, 3] }), TypeError);
});

test('non-finite numbers are rejected', () => {
  const state = new State();
  assert.throws(() => state.set({ breath: Number.NaN }), TypeError);
  assert.throws(() => state.set({ breath: Number.POSITIVE_INFINITY }), TypeError);
});

test('a non-object patch is rejected', () => {
  const state = new State();
  assert.throws(() => state.set(null), TypeError);
  assert.throws(() => state.set(42), TypeError);
});

test('a non-function subscriber is rejected', () => {
  const state = new State();
  assert.throws(() => state.subscribe('nope'), TypeError);
});

test('one failing subscriber does not stop the others', () => {
  const state = new State();
  let reached = false;
  state.subscribe(() => {
    throw new Error('boom');
  });
  state.subscribe(() => {
    reached = true;
  });
  assert.throws(() => state.set({ breath: 0.3 }), /boom/);
  assert.ok(reached);
});

test('createState applies initial overrides', () => {
  const state = createState({ breath: 0.7 });
  assert.equal(state.get().breath, 0.7);
});

test('dispose drops every subscriber', () => {
  const state = new State();
  let count = 0;
  state.subscribe(() => {
    count += 1;
  });
  state.dispose();
  state.set({ breath: 0.5 });
  assert.equal(count, 0);
});
