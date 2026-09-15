import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../apps/backend/src/store.js';

test('postgres store persists an attendance event and returns its server state', async () => {
  const calls = [];
  const db = {
    async query(text, values) {
      calls.push({ text, values });
      if (text.includes('FROM attendance_states')) return { rows: [{ status: 'outside', revision: 0 }] };
      if (text.includes('INSERT INTO attendance_events')) return { rows: [{ id: 'event-1', type: 'clock_in', occurred_at: '2026-09-09T08:00:00.000Z', sequence: 1 }] };
      if (text.includes('INSERT INTO attendance_states')) return { rows: [{ status: 'working', revision: 1 }] };
      return { rows: [] };
    },
  };
  const store = createStore({ db, seed: false });
  const result = await store.record('employee-1', 'clock_in', '2026-09-09T08:00:00.000Z', 'key-1');
  assert.equal(result.state.status, 'working');
  assert.equal(result.event.type, 'clock_in');
  assert.ok(calls.some(call => call.text.includes('INSERT INTO attendance_events')));
  assert.ok(calls.some(call => call.text.includes('INSERT INTO attendance_states')));
});
