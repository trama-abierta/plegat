import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import UserSidebar from '../components/UserSidebar.jsx';

const sections = [['/admin', 'Resumen'], ['/admin/equipo', 'Equipo'], ['/admin/registros', 'Registros'], ['/admin/correcciones', 'Correcciones'], ['/admin/informes', 'Informes'], ['/admin/configuracion', 'Configuración']];
const statuses = { in_progress: 'En curso', closed: 'Cerrada', incomplete: 'Incompleta', incident: 'Incidencia', pending_review: 'Pendiente de revisión' };
const events = { clock_in: 'Entrada', clock_out: 'Salida', break_start: 'Inicio de pausa', break_end: 'Fin de pausa' };
const requestStatuses = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', withdrawn: 'Retirada' };
const requestKinds = { delete: 'Eliminar fichaje', delete_workday: 'Eliminar jornada completa', modify: 'Modificar fichaje', create_workday: 'Crear jornada', edit_workday: 'Editar jornada' };
const duration = value => `${Math.floor((value || 0) / 3600000)} h ${Math.floor(((value || 0) % 3600000) / 60000)} min`;
const time = value => value ? new Date(value).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '—';
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-ES');
async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los registros.');
  return data;
}

function RecordDetail({ tenantId, record, onClose }) {
  const dialog = useRef(null);
  const requestDialog = useRef(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const previousFocus = document.activeElement;
    dialog.current?.showModal();
    fetch(`/api/v1/tenants/${encodeURIComponent(tenantId)}/attendance/${encodeURIComponent(record.employeeId)}/${record.date}`, { signal: controller.signal })
      .then(readResponse).then(setDetail).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => { controller.abort(); previousFocus?.focus(); };
  }, [tenantId, record.employeeId, record.date]);
  useEffect(() => {
    if (selectedRequest) requestDialog.current?.showModal();
  }, [selectedRequest]);
  const closeRequest = () => {
    requestDialog.current?.close();
    setSelectedRequest(null);
  };
  return <><dialog ref={dialog} className="records-dialog card" aria-labelledby="record-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}><div className="records-dialog-scroll">
    <div className="row"><h2 id="record-title">Detalle de jornada</h2><button type="button" className="modal-close" aria-label="Cerrar detalle" onClick={onClose}>×</button></div>
    <p><strong>{record.employee.name}</strong> · {dateLabel(record.date)}</p>
    {error && <p role="alert">{error}</p>}
    {!detail && !error && <p role="status">Cargando detalle…</p>}
    {detail && <><div className="records-summary"><span className="tag">{statuses[detail.status]}</span><span>Trabajo: <strong>{duration(detail.workedMs)}</strong></span><span>Pausas: <strong>{duration(detail.breakMs)}</strong></span></div>
      <p className="muted">Horas en Europe/Madrid. En jornadas en curso, el tramo abierto se actualiza hasta este momento.</p>
      <div className="records-event-columns">{[['Fichajes efectivos', detail.effectiveEvents], ['Fichajes originales', detail.originalEvents]].map(([title, list]) => <section key={title}><h3>{title}</h3>{list?.length ? <ol className="records-events">{list.map((event, index) => <li key={event.id || index}><span>{events[event.type] || event.type}</span><strong>{new Date(event.occurredAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</strong></li>)}</ol> : <p className="muted">Sin fichajes.</p>}</section>)}</div>
      <section><div className="row related-requests-heading"><h3>Solicitudes relacionadas</h3>{detail.requests?.length ? <span className="muted">{detail.requests.length}</span> : null}</div>{detail.requests?.length ? <ul className="records-requests">{detail.requests.map(request => <li key={request.id}><div className="request-list-head"><strong>{requestKinds[request.kind] || request.kind}</strong><span className={`tag ${request.status === 'approved' ? 'tag-approved' : request.status === 'rejected' ? 'tag-incident' : ''}`}>{requestStatuses[request.status] || request.status}</span><button type="button" className="create-day-link" onClick={() => setSelectedRequest(request)}>Ver detalle</button></div><p className="request-list-meta">{request.eventType ? events[request.eventType] : request.kind.includes('workday') ? 'Jornada completa' : 'Fichaje'}{request.originalTime ? ` · ${new Date(request.originalTime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : ''}</p>{request.reason && <p className="request-list-reason">{request.reason}</p>}</li>)}</ul> : <p className="muted">Sin solicitudes relacionadas.</p>}</section>
    </>}
  </div></dialog>{selectedRequest && <dialog ref={requestDialog} className="records-dialog card request-dialog" aria-labelledby="request-title" onCancel={closeRequest} onClick={event => { if (event.target === requestDialog.current) closeRequest(); }}><div className="records-dialog-scroll">
    <div className="row"><h2 id="request-title">Detalle de solicitud</h2><button type="button" className="modal-close" onClick={closeRequest} aria-label="Cerrar detalle">×</button></div>
    <p><strong>{requestKinds[selectedRequest.kind] || selectedRequest.kind}</strong> · {selectedRequest.eventType ? `${events[selectedRequest.eventType]} · ` : ''}{selectedRequest.originalTime ? new Date(selectedRequest.originalTime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : dateLabel(record.date)}</p>
    <div className="request-detail-box"><div className="request-detail-grid">
      <div><span className="muted">Qué se solicita</span><p>{selectedRequest.kind === 'delete_workday' ? 'Eliminar toda la jornada y recalcular sus eventos afectados' : selectedRequest.kind === 'delete' ? `Eliminar ${events[selectedRequest.eventType] || 'el fichaje'}${(selectedRequest.affectedEvents || []).length > 1 ? ' y sus eventos afectados' : ''}` : requestKinds[selectedRequest.kind] || selectedRequest.kind}</p></div>
      <div><span className="muted">Motivo</span><p>{selectedRequest.reason || '—'}</p></div>
      <div><span className="muted">Original</span><p>{selectedRequest.originalTime ? new Date(selectedRequest.originalTime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '—'}</p></div>
      <div><span className="muted">Propuesta</span><p>{selectedRequest.proposedTime ? new Date(selectedRequest.proposedTime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : selectedRequest.kind.includes('workday') ? `${selectedRequest.proposal?.proposedEvents?.length || selectedRequest.proposal?.eventIds?.length || 0} eventos propuestos · jornada cerrada` : 'Eliminar y recalcular eventos afectados'}</p></div>
    </div>
    {(selectedRequest.affectedEvents?.length || selectedRequest.proposal?.affectedEvents?.length) ? <div><span className="muted">Eventos afectados</span><ul className="correction-events">{(selectedRequest.affectedEvents || selectedRequest.proposal.affectedEvents).map((item, index) => <li key={item.id || index}>{index ? '↳ Afectado' : 'Objetivo'} · {events[item.type] || item.type} · {new Date(item.occurredAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</li>)}</ul></div> : null}
    </div>
    {selectedRequest.reviewedBy && <small>Revisada por {selectedRequest.reviewerName || selectedRequest.reviewedBy} el {new Date(selectedRequest.reviewedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.</small>}
  </div></dialog>}</>;
}

export default function AdminRecords() {
  const [tenantId, setTenantId] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [draft, setDraft] = useState({ from: '', to: '', status: '', search: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/me', { signal: controller.signal }).then(readResponse).then(profile => {
      if (!profile.tenant?.id) throw new Error('No hay una organización disponible para consultar registros.');
      setTenantId(profile.tenant.id);
    }).catch(error => { if (error.name !== 'AbortError') { setProfileError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), pageSize: '20', sort: 'date', order: 'desc' });
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    setLoading(true); setError('');
    fetch(`/api/v1/tenants/${encodeURIComponent(tenantId)}/attendance?${query}`, { signal: controller.signal })
      .then(readResponse).then(data => { setData(data); setLoading(false); })
      .catch(error => { if (error.name !== 'AbortError') { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [tenantId, filters, page, version]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));
  const change = event => setDraft(current => ({ ...current, [event.target.name]: event.target.value }));
  function apply(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setError('La fecha inicial debe ser anterior o igual a la final.'); return; }
    setPage(1); setFilters({ ...draft, search: draft.search.trim() });
  }
  return <div className="workspace"><UserSidebar userLinks={false} showPersonal={false}><nav className="admin-side-nav" aria-label="Administración">{sections.map(([path, label]) => <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => isActive ? 'selected' : undefined}>{label}</NavLink>)}</nav></UserSidebar>
    <div className="main"><div className="eyebrow">Administración · Organización</div><h1>Registros</h1><p>Consulta las jornadas del equipo y su trazabilidad.</p>
      <form className="card records-filters" onSubmit={apply}><label>Buscar persona<input type="search" name="search" value={draft.search} onChange={change} placeholder="Nombre o correo" /></label><label>Desde<input type="date" name="from" value={draft.from} onChange={change} /></label><label>Hasta<input type="date" name="to" value={draft.to} onChange={change} /></label><label>Estado<select name="status" value={draft.status} onChange={change}><option value="">Todos</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit" className="cta">Filtrar</button></form>
      {(profileError || error) && <div className="card records-error" role="alert"><p>{profileError || error}</p>{!profileError && <button type="button" onClick={() => setVersion(value => value + 1)}>Reintentar</button>}</div>}
      <div className="card records-card" aria-busy={loading}><div className="row"><h3>Jornadas del equipo</h3><span className="muted">{data?.total ?? 0} registros</span></div>
        {loading ? <p role="status" className="empty-state">Cargando registros…</p> : !error && !profileError && !data?.rows?.length ? <p className="empty-state">No hay registros con estos filtros.</p> : !error && !profileError && <><div className="tablewrap"><table><thead><tr><th>Persona</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Pausas</th><th>Trabajo</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{data?.rows?.map(record => <tr key={record.id || `${record.employeeId}:${record.date}`}><td><strong>{record.employee.name}</strong><small className="records-email">{record.employee.email}</small></td><td>{dateLabel(record.date)}</td><td>{time(record.clockIn)}</td><td>{time(record.clockOut)}</td><td>{duration(record.breakMs)}</td><td>{duration(record.workedMs)}</td><td><span className={`tag ${record.status === 'closed' ? 'tag-approved' : record.status === 'in_progress' ? '' : 'tag-incident'}`}>{statuses[record.status] || record.status}</span></td><td><button type="button" className="create-day-link" aria-label={`Ver jornada de ${record.employee.name} del ${dateLabel(record.date)}`} onClick={() => setSelected(record)}>Ver detalle</button></td></tr>)}</tbody></table></div><div className="records-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Siguiente</button></div></>}
      </div><p className="muted">Horas en Europe/Madrid. Las jornadas abiertas reflejan el tiempo transcurrido hasta la última consulta.</p>
    </div>{selected && <RecordDetail tenantId={tenantId} record={selected} onClose={() => setSelected(null)} />}
  </div>;
}
