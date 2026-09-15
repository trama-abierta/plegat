import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES, applyAttendanceEvent, elapsedWorkMs, nextAttendanceState } from '../apps/backend/src/modules/attendance.js';

test('accepts a working day with a non-computable break', () => {
  let state = { status: 'outside', revision: 0 };
  const events = [];
  for (const type of [EVENT_TYPES.CLOCK_IN, EVENT_TYPES.BREAK_START, EVENT_TYPES.BREAK_END, EVENT_TYPES.CLOCK_OUT]) {
    const result = applyAttendanceEvent(state, { type, occurredAt: '2026-09-09T08:00:00.000Z' }, state.events ?? events);
    state = result;
  }
  assert.equal(state.status, 'outside');
  assert.equal(state.revision, 4);
  assert.deepEqual(state.events.map(event => event.sequence), [1, 2, 3, 4]);
});

test('rejects clock out before clock in', () => {
  assert.throws(() => nextAttendanceState('outside', EVENT_TYPES.CLOCK_OUT), /Transición no permitida/);
});

test('excludes a break from effective work duration', () => {
  const events = [
    { type: 'clock_in', occurredAt: '2026-09-09T08:00:00.000Z' },
    { type: 'break_start', occurredAt: '2026-09-09T12:00:00.000Z' },
    { type: 'break_end', occurredAt: '2026-09-09T12:30:00.000Z' },
    { type: 'clock_out', occurredAt: '2026-09-09T16:00:00.000Z' },
  ];
  assert.equal(elapsedWorkMs(events), 7.5 * 60 * 60 * 1000);
});
