export const EVENT_TYPES = Object.freeze({
  CLOCK_IN: 'clock_in',
  BREAK_START: 'break_start',
  BREAK_END: 'break_end',
  CLOCK_OUT: 'clock_out',
});

const transitions = {
  outside: { clock_in: 'working' },
  working: { break_start: 'on_break', clock_out: 'outside' },
  on_break: { break_end: 'working', clock_out: 'outside' },
};

export function nextAttendanceState(current, eventType) {
  const next = transitions[current]?.[eventType];
  if (!next) {
    const error = new Error(`Transición no permitida: ${current} → ${eventType}`);
    error.code = 'INVALID_TRANSITION';
    throw error;
  }
  return next;
}

export function applyAttendanceEvent(state, event, events = []) {
  const nextState = nextAttendanceState(state.status, event.type);
  return {
    status: nextState,
    revision: state.revision + 1,
    events: [...events, { ...event, sequence: state.revision + 1 }],
  };
}

export function elapsedWorkMs(events, now = Date.now()) {
  let started = null;
  let total = 0;
  for (const event of events) {
    const at = new Date(event.occurredAt).getTime();
    if (event.type === EVENT_TYPES.CLOCK_IN || event.type === EVENT_TYPES.BREAK_END) started = at;
    if ((event.type === EVENT_TYPES.BREAK_START || event.type === EVENT_TYPES.CLOCK_OUT) && started !== null) {
      total += Math.max(0, at - started);
      started = event.type === EVENT_TYPES.CLOCK_OUT ? null : at;
    }
  }
  if (started !== null) total += Math.max(0, now - started);
  return total;
}
