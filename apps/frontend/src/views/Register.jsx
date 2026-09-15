import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', tenantName: '', slug: '', timeZone: 'Europe/Madrid' });
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setMessage('Creando organización…');
    try {
      const response = await fetch('/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.message ?? 'No se pudo crear la organización'); return; }
      sessionStorage.setItem('plegat_authenticated', '1'); navigate('/admin');
    } catch { setMessage('No se pudo conectar con el servidor. Comprueba que el backend está iniciado.'); }
  }
  return <div className="auth-shell"><div className="auth-card card"><div className="eyebrow">Plegat · nueva organización</div><h1>Empieza a poner orden.</h1><p>Tu cuenta será administradora de la nueva empresa desde el primer momento.</p><form onSubmit={submit} className="auth-form"><label>Tu nombre<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Email<input type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label><label>Contraseña<input type="password" minLength="12" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /><small>Mínimo 12 caracteres.</small></label><label>Nombre de la empresa<input value={form.tenantName} onChange={event => setForm({ ...form, tenantName: event.target.value })} required /></label><label>Identificador de empresa<input pattern="[a-z0-9-]+" value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value.toLowerCase() })} placeholder="mi-empresa" required /></label><button className="cta" type="submit">Crear organización</button><small role="status">{message}</small></form><p className="auth-switch">¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></p></div></div>;
}
