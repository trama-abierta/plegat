/* global test, expect */
import {getNextAction, hasPendingChanges, summarize, todayEvents} from '../src/attendance/attendance';

test('selects valid next action', () => {
  expect(getNextAction({events: []})).toBe('clock_in');
  expect(getNextAction({events: [{type: 'clock_in'}]})).toBe('break_start');
  expect(getNextAction({events: [{type: 'break_start'}]})).toBe('break_end');
  expect(getNextAction({events: [{type: 'clock_out'}]})).toBe('clock_in');
});

test('keeps pending corrections as a warning only', () => {
  expect(hasPendingChanges([{status: 'pending'}])).toBe(true);
  expect(hasPendingChanges([{status: 'approved'}])).toBe(false);
});

test('summarizes two same-day segments together', () => {
  const now = new Date('2026-09-15T17:00:00+02:00').getTime();
  const events = [
    {type: 'clock_in', occurredAt: '2026-09-15T09:00:00+02:00'},
    {type: 'clock_out', occurredAt: '2026-09-15T12:00:00+02:00'},
    {type: 'clock_in', occurredAt: '2026-09-15T13:00:00+02:00'},
  ];
  expect(summarize(todayEvents(events, now), now).workedMs).toBe(7 * 60 * 60 * 1000);
});
