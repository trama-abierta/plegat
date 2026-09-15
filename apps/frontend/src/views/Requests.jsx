import { useEffect, useMemo, useState } from 'react';
import UserSidebar from '../components/UserSidebar.jsx';

const labels = { clock_in: 'Entrada', break_start: 'Inicio de pausa', break_end: 'Reanudación', clock_out: 'Salida' };
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = value => String(value).padStart(2, '0');
const dateKey = value => { const date = new Date(value); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
const statusLabels = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', withdrawn: 'Solicitud retirada' };

export default function Requests() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(dateKey(today));
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [menuRequest, setMenuRequest] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [version, setVersion] = useState(0);
  const [remoteRequests, setRemoteRequests] = useState(null);
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  useEffect(() => { fetch('/api/v1/me/corrections').then(r => r.ok ? r.json() : null).then(data => { if (data?.requests) setRemoteRequests(data.requests); }).catch(() => {}); }, [version]);
  useEffect(() => { const close = event => { if (!event.target.closest('.event-actions')) { setMenuRequest(null); setMenuPosition(null); } }; const scroll = () => { setMenuRequest(null); setMenuPosition(null); }; document.addEventListener('click', close); window.addEventListener('scroll', scroll, true); return () => { document.removeEventListener('click', close); window.removeEventListener('scroll', scroll, true); }; }, []);
  const requests = useMemo(() => (remoteRequests || []).slice().sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at)), [remoteRequests]);
  const events = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('plegat_demo_attendance') || '{"events":[]}').events || []; } catch { return []; }
  }, []);
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
      const day = index - offset + 1;
      return day < 1 || day > count ? null : new Date(month.getFullYear(), month.getMonth(), day);
    });
  }, [month]);
  const counts = useMemo(() => requests.reduce((map, request) => { const key = dateKey(request.originalTime); map[key] = (map[key] || 0) + 1; return map; }, {}), [requests]);
  const displayedRequests = useMemo(() => requests.slice().sort((a, b) => { const value = request => request[sort.key] || request[sort.key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] || ''; const comparison = String(value(a)).localeCompare(String(value(b)), 'es', { numeric: true }); return sort.direction === 'asc' ? comparison : -comparison; }), [requests, sort]);
  const toggleSort = key => setSort(current => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  const eventFor = request => events.find(event => event.id === request.eventId);
  const moveMonth = delta => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  function withdraw(event) {
    event.preventDefault();
    if (!withdrawTarget || !withdrawReason.trim()) return;
    if (remoteRequests) { fetch(`/api/v1/me/corrections/${withdrawTarget.id}/withdraw`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: withdrawReason.trim() }) }).then(() => { setRemoteRequests(null); setWithdrawTarget(null); setWithdrawReason(''); setVersion(value => value + 1); }); return; }
    const saved = requests.map(request => request.id === withdrawTarget.id ? { ...request, status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawnBy: 'usuario actual', withdrawalReason: withdrawReason.trim() } : request);
    localStorage.setItem('plegat_correction_requests', JSON.stringify(saved));
    setWithdrawTarget(null); setWithdrawReason(''); setMenuRequest(null); setMenuPosition(null); setVersion(value => value + 1);
  }

 return <div className="workspace requests-page"><UserSidebar /><div className="main"><div className="eyebrow">Seguimiento personal</div><h1>Mis solicitudes</h1><p>Consulta los cambios de tus jornadas y su estado de revisión.</p><div className="card changes-card"><div className="row"><div><span className="eyebrow">Todo el histórico</span><h3>{displayedRequests.length} {displayedRequests.length === 1 ? 'solicitud' : 'solicitudes'}</h3></div><span className="muted">Más recientes primero · Los originales se conservan</span></div>{displayedRequests.length === 0 ? <p className="empty-state">No hay solicitudes registradas.</p> : <div className="tablewrap"><table><thead><tr><th><button type="button" className="table-sort" onClick={() => toggleSort("createdAt")}>Fecha y hora de solicitud ↕</button></th><th><button type="button" className="table-sort" onClick={() => toggleSort("kind")}>Tipo ↕</button></th><th><button type="button" className="table-sort" onClick={() => toggleSort("eventType")}>Evento ↕</button></th><th><button type="button" className="table-sort" onClick={() => toggleSort("originalTime")}>Fecha y hora del evento ↕</button></th><th><button type="button" className="table-sort" onClick={() => toggleSort("status")}>Estado ↕</button></th><th>Motivo</th><th>Actualizada</th><th>Aprobada/revisada por</th><th aria-label="Acciones" /></tr></thead><tbody>{displayedRequests.map(request => { const event = eventFor(request); return <tr key={request.id}><td>{new Date(request.createdAt || request.created_at).toLocaleString('es-ES')}</td><td>{request.kind === 'delete' || request.kind === 'delete_workday' ? 'Eliminación' : 'Modificación'}</td><td>{labels[request.eventType] || event?.type || (request.kind === 'delete_workday' ? 'Jornada completa' : 'Fichaje')}</td><td>{new Date(request.originalTime || request.original_time).toLocaleString('es-ES')}</td><td><span className={`tag ${request.status === 'approved' ? 'tag-approved' : ''}`}>{statusLabels[request.status] || request.status}</span></td><td>{request.reason}</td><td>{new Date(request.withdrawnAt || request.withdrawn_at || request.approvedAt || request.approved_at || request.createdAt || request.created_at).toLocaleString('es-ES')}</td><td>{request.reviewerName || request.reviewer_name || request.reviewedBy || request.reviewed_by || '—'}</td><td className="event-actions">{request.status === 'pending' && <><button type="button" className="event-menu" aria-label="Acciones de la solicitud" aria-expanded={menuRequest?.id === request.id} onClick={event => { const next = menuRequest?.id === request.id; const rect = event.currentTarget.getBoundingClientRect(); setMenuRequest(next ? null : request); setMenuPosition(next ? null : { top: rect.bottom + 6, left: Math.max(8, rect.right - 150) }); }}>⋮</button>{menuRequest?.id === request.id && <div className="event-popover" style={menuPosition || undefined}><button type="button" onClick={() => { setWithdrawTarget(request); setWithdrawReason(''); setMenuRequest(null); setMenuPosition(null); }}>Retirar solicitud</button></div>}</>}</td></tr>; })}</tbody></table></div>}</div></div>{withdrawTarget && <div className="modal-backdrop" role="presentation"><div className="modal card" role="dialog" aria-modal="true" aria-labelledby="withdraw-request-title"><div className="row"><h2 id="withdraw-request-title">Retirar solicitud</h2><button className="modal-close" type="button" aria-label="Cerrar" onClick={() => setWithdrawTarget(null)}>×</button></div><p>La solicitud se conservará para auditoría, pero dejará de estar pendiente.</p><form className="auth-form" onSubmit={withdraw}><label>Motivo de retirada<textarea value={withdrawReason} onChange={event => setWithdrawReason(event.target.value)} rows="3" required /></label><div className="actions"><button type="button" onClick={() => setWithdrawTarget(null)}>Cancelar</button><button className="cta" type="submit">Retirar solicitud</button></div></form></div></div>}</div>;
}
