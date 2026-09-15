import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setMessage('Entrando…');
    try {
      const response = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.message ?? 'No se pudo iniciar sesión'); return; }
      sessionStorage.setItem('plegat_authenticated', '1');
      const returnTo = new URLSearchParams(location.search).get('oauth_return');
      if (returnTo?.startsWith('/oauth/authorize')) {
        const apiOrigin = import.meta.env.VITE_API_ORIGIN || (window.location.port === '5173' ? `${window.location.protocol}//${window.location.hostname}:3000` : window.location.origin);
        window.location.assign(`${apiOrigin}${returnTo}`);
      }
      else navigate(data.user.platformRole === 'platform_admin' ? '/admin' : '/personal');
    } catch { setMessage('No se pudo conectar con el servidor. Comprueba que el backend está iniciado.'); }
  }
  return <div className="auth-shell"><div className="auth-card card"><div className="eyebrow">Plegat · acceso seguro</div><h1>Volver a tu jornada.</h1><p>Entra con tu cuenta para fichar o administrar tu organización.</p><form onSubmit={submit} className="auth-form"><label>Email<input type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /></label><button className="cta" type="submit">Entrar</button><small role="status">{message}</small></form><p className="auth-switch">¿Aún no tienes organización? <Link to="/register">Crear empresa</Link></p></div></div>;
}
