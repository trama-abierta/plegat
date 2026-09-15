import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import UserSidebar from '../components/UserSidebar.jsx';

const sections = [['/admin', 'Resumen'], ['/admin/equipo', 'Equipo'], ['/admin/registros', 'Registros'], ['/admin/correcciones', 'Correcciones'], ['/admin/informes', 'Informes'], ['/admin/configuracion', 'Configuración']];
const roleLabels = { tenant_admin: 'Administrador', employee: 'Empleado', auditor: 'Auditor' };

function AdminNav() {
  return <nav className="admin-side-nav" aria-label="Administración">{sections.map(([path, label]) => <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => isActive ? 'selected' : undefined}>{label}</NavLink>)}</nav>;
}

export default function AdminTeam() {
  const [members, setMembers] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [message, setMessage] = useState('Cargando equipo…');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' });
  const [saving, setSaving] = useState(false);
  const [menuUser, setMenuUser] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'employee', status: 'active', password: '' });

  const load = async () => {
    const meResponse = await fetch('/api/v1/me');
    if (!meResponse.ok) throw new Error('No se pudo cargar la sesión');
    const me = await meResponse.json();
    if (!me.tenant?.id) throw new Error('No tienes una organización asignada');
    setTenant(me.tenant);
    const response = await fetch(`/api/v1/tenants/${me.tenant.id}/members`);
    if (!response.ok) throw new Error('No se pudo cargar el equipo');
    setMembers((await response.json()).members ?? []);
    setMessage('');
  };

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    const closeOutside = (event) => { if (!event.target.closest('.event-actions')) { setMenuUser(null); setMenuPosition(null); } };
    const closeOnScroll = () => { setMenuUser(null); setMenuPosition(null); };
    document.addEventListener('click', closeOutside);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => { document.removeEventListener('click', closeOutside); window.removeEventListener('scroll', closeOnScroll, true); };
  }, []);

  const team = useMemo(() => members.filter((member) => member.employee), [members]);
  const admins = useMemo(() => members.filter((member) => !member.employee), [members]);

  async function addMember(event) {
    event.preventDefault();
    if (!tenant) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/tenants/${tenant.id}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error('No se pudo crear el usuario');
      setForm({ name: '', email: '', password: '', role: 'employee' });
      await load();
      setMessage('Usuario añadido correctamente');
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  function openEdit(member) { setMenuUser(null); setMenuPosition(null); setEditTarget(member); setEditForm({ name: member.user?.name || '', email: member.user?.email || '', role: member.role, status: member.status, password: '' }); }
  async function saveMember(event) {
    event.preventDefault(); if (!editTarget || !tenant) return; setSaving(true);
    try { const response = await fetch(`/api/v1/tenants/${tenant.id}/members/${editTarget.userId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editForm) }); if (!response.ok) throw new Error('No se pudo actualizar el usuario'); setEditTarget(null); await load(); setMessage('Usuario actualizado correctamente'); } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  const memberRows = (items) => items.length ? <div className="team-list">{items.map((member) => <div className="team-row" key={`${member.userId}-${member.tenantId}`}><div className="team-avatar">{member.user?.name?.slice(0, 1).toUpperCase()}</div><div className="team-person"><strong>{member.user?.name ?? 'Sin nombre'}</strong><span>{member.user?.email}</span></div><span className="role-badge">{roleLabels[member.role] ?? member.role}</span><span className={`member-status ${member.status}`}>{member.status === 'active' ? 'Activo' : 'Desactivado'}</span><div className="event-actions"><button type="button" className="event-menu" aria-label={`Acciones de ${member.user?.name}`} onClick={(event) => { const next = menuUser === member.userId; const rect = event.currentTarget.getBoundingClientRect(); setMenuUser(next ? null : member.userId); setMenuPosition(next ? null : { top: rect.bottom + 6, left: Math.max(8, rect.right - 190) }); }}>⋮</button>{menuUser === member.userId && <div className="event-popover" style={menuPosition || undefined}><button type="button" onClick={() => openEdit(member)}>Editar datos y permisos</button><button type="button" onClick={() => { openEdit(member); setEditForm((current) => ({ ...current, status: member.status === 'active' ? 'suspended' : 'active' })); }}>{member.status === 'active' ? 'Desactivar acceso' : 'Reactivar acceso'}</button><button type="button" onClick={() => { openEdit(member); setEditForm((current) => ({ ...current, status: 'suspended' })); }}>Dar de baja</button></div>}</div></div>)}</div> : <p className="muted team-empty">No hay usuarios en esta categoría.</p>;

  return <div className="workspace"><UserSidebar userLinks={false} showPersonal={false}><AdminNav /></UserSidebar><div className="main"><div className="eyebrow">Administración · Organización</div><h1>Equipo</h1><p>Personas con ficha laboral y usuarios con permisos administrativos de {tenant?.name ?? 'la organización'}.</p>{message && <p className="team-message" role="status">{message}</p>}<section className="card team-section"><div className="row"><div><span className="eyebrow">Fichaje</span><h3>Equipo con ficha laboral</h3></div><span className="muted">{team.length} usuarios</span></div><p className="muted">Incluye empleados y administradores que también pueden registrar su jornada.</p>{memberRows(team)}</section><section className="card team-section"><div className="row"><div><span className="eyebrow">Permisos</span><h3>Usuarios administrativos</h3></div><span className="muted">{admins.length} usuarios</span></div><p className="muted">Usuarios con acceso de auditoría sin ficha laboral ni jornada propia.</p>{memberRows(admins)}</section><section className="card team-section"><div className="row"><div><span className="eyebrow">Alta de usuario</span><h3>Añadir miembro</h3></div></div><form autoComplete="off" onSubmit={addMember} className="member-form"><input name="new_member_name" autoComplete="off" aria-label="Nombre" placeholder="Nombre y apellidos" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><input name="new_member_email" autoComplete="off" aria-label="Email" type="email" placeholder="Email del nuevo usuario" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><input name="new_member_password" autoComplete="new-password" aria-label="Contraseña" type="password" minLength="12" placeholder="Contraseña inicial del nuevo usuario" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><select name="new_member_role" aria-label="Rol" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="employee">Empleado</option><option value="auditor">Auditor (solo administración)</option><option value="tenant_admin">Administrador y empleado</option></select><button className="cta" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Añadir usuario'}</button></form></section>{editTarget && <div className="modal-backdrop" role="presentation"><div className="modal card" role="dialog" aria-modal="true" aria-labelledby="edit-member-title"><div className="row"><h2 id="edit-member-title">Gestionar usuario</h2><button className="modal-close" type="button" onClick={() => setEditTarget(null)} aria-label="Cerrar">×</button></div><p className="muted">Los fichajes y la auditoría histórica se conservan.</p><form className="auth-form" autoComplete="off" onSubmit={saveMember}><label>Nombre<input name="managed_member_name" autoComplete="off" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label><label>Email<input name="managed_member_email" autoComplete="off" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required /></label><label>Rol<select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}><option value="employee">Empleado</option><option value="auditor">Auditor (solo administración)</option><option value="tenant_admin">Administrador y empleado</option></select></label><label>Estado<select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}><option value="active">Activo</option><option value="suspended">Desactivado / dado de baja</option></select></label><label>Nueva contraseña <span className="muted">(opcional)</span><input name="managed_member_password" autoComplete="new-password" type="password" minLength="12" placeholder="Dejar vacío para conservarla" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} /></label><div className="actions"><button type="button" onClick={() => setEditTarget(null)}>Cancelar</button><button className="cta" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></form></div></div>}</div></div>;
}
