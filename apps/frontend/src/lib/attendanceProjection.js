const read = key => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

/** Returns a derived view of attendance. Original events remain untouched. */
export function effectiveAttendanceEvents(events = [], requests = read('plegat_correction_requests') || []) {
  let result = events.map(event => ({ ...event }));
  const approved = requests.filter(request => request.status === 'approved');

  for (const request of approved) {
    if (request.kind === 'create_workday' || request.kind === 'edit_workday') {
      const day = request.originalTime?.slice(0, 10);
      if (!day) continue;
      result = result.filter(event => event.occurredAt?.slice(0, 10) !== day);
      const proposed = request.proposedEvents || request.proposal?.proposedEvents || request.proposal?.events || [];
      result.push(...proposed.map(event => ({ ...event, derivedFromRequestId: request.id })));
      continue;
    }
    if (request.kind === 'delete') {
      const affected = new Set([request.eventId, ...(request.affectedEventIds || [])]);
      result = result.filter(event => !affected.has(event.id));
    }
    if (request.kind === 'modify' && request.eventId && request.proposedTime) {
      result = result.map(event => event.id === request.eventId
        ? { ...event, occurredAt: request.proposedTime, derivedFromRequestId: request.id }
        : event);
    }
  }
  return result;
}

export default effectiveAttendanceEvents;
