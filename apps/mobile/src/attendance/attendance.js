import {apiFetch} from '../api/client';

function idempotencyKey() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getAttendance() {
  const response = await apiFetch('/api/v1/me/attendance');
  if (!response.ok) throw new Error('No se pudo cargar la jornada');
  return response.json();
}

export function getNextAction(attendance = {}) {
  const last = attendance.events?.at(-1)?.type;
  if (!last || last === 'clock_out') return 'clock_in';
  if (last === 'clock_in' || last === 'break_end') return 'break_start';
  if (last === 'break_start') return 'break_end';
  return 'clock_in';
}

export async function recordEvent(type) {
  const response = await apiFetch('/api/v1/me/events', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'idempotency-key': idempotencyKey()},
    body: JSON.stringify({type}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'No se pudo registrar el fichaje');
  return data;
}

export function hasPendingChanges(requests = []) {
  return requests.some(request => request.status === 'pending');
}

export function todayEvents(events = [], now = Date.now()) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(now));
  const sameDay = events.filter(event => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(event.occurredAt)) === day);
  return sameDay.length ? sameDay : events.slice(events.reduce((index, event, current) => event.type === 'clock_out' ? current : index, -1) + 1);
}

export function summarize(events = [], now = Date.now()) {
  let workStart = null; let breakStart = null; let workedMs = 0; let pausedMs = 0; let pauses = 0;
  for (const event of events) {
    const at = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(at)) continue;
    if (event.type === 'clock_in' || event.type === 'break_end') workStart = at;
    if (event.type === 'break_start' && workStart !== null) { workedMs += Math.max(0, at - workStart); workStart = null; breakStart = at; pauses += 1; }
    if (event.type === 'break_end' && breakStart !== null) { pausedMs += Math.max(0, at - breakStart); breakStart = null; }
    if (event.type === 'clock_out') { if (workStart !== null) workedMs += Math.max(0, at - workStart); if (breakStart !== null) pausedMs += Math.max(0, at - breakStart); workStart = null; breakStart = null; }
  }
  if (workStart !== null) workedMs += Math.max(0, now - workStart);
  if (breakStart !== null) pausedMs += Math.max(0, now - breakStart);
  return {workedMs, pausedMs, pauses};
}
