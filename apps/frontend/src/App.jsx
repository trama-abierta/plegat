import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Landing from "./views/Landing.jsx";
import Personal from "./views/Personal.jsx";
import Admin from "./views/Admin.jsx";
import Roadmap from "./views/Roadmap.jsx";
import Login from "./views/Login.jsx";
import Register from "./views/Register.jsx";
import Logout from "./views/Logout.jsx";
import Requests from "./views/Requests.jsx";
import History from "./views/History.jsx";
import Profile from "./views/Profile.jsx";
import WorkdayEditor from "./views/WorkdayEditor.jsx";
import AdminSection from "./views/AdminSection.jsx";
import AdminCorrections from "./views/AdminCorrections.jsx";
import AdminTeam from "./views/AdminTeam.jsx";
import AdminRecords from "./views/AdminRecords.jsx";
import AdminConfig from "./views/AdminConfig.jsx";

const publicPaths = new Set(["/", "/plan", "/login", "/register", "/logout"]);

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const main = useRef(null);
  const path = location.pathname;
  const isPublic = publicPaths.has(path);
  const publicHeader = isPublic || (path === "/personal" && !profile?.user);

  useEffect(() => {
    fetch("/api/v1/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setProfile(data);
        if (!data && !publicPaths.has(window.location.pathname) && window.location.pathname !== "/personal") navigate("/login", { replace: true });
      })
      .catch(() => setProfile(null));
  }, [navigate, path]);

  useEffect(() => {
    setProfileOpen(false);
    if (path === "/logout") setProfile(null);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    main.current?.focus({ preventScroll: true });
  }, [path]);

  const role = profile?.user?.platformRole ?? profile?.membership?.role;
  const attendanceLink = profile?.employee ? [["/personal", "Mi jornada"]] : [];
  const appLinks = role === "platform_admin"
    ? [...attendanceLink, ["/admin", "Administración"]]
    : role === "tenant_admin"
      ? [...attendanceLink, ["/admin", "Administración"]]
      : role === "auditor"
        ? [["/admin", "Auditoría"], ["/plan", "Guía"]]
        : attendanceLink;

  function logout() { setProfileOpen(false); navigate("/logout"); }

  return <>
    <a className="skip-link" href="#content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Saltar al contenido</a>
    <header className={publicHeader ? "public-header" : "app-header"}>
      <Link to="/" className="brand" aria-label="Plegat, inicio"><img src="/plegat.svg" alt="" /><span className="brand-name">Plegat</span></Link>
      <nav aria-label={publicHeader ? "Navegación pública" : "Navegación de la aplicación"}>
        {(publicHeader ? [["/", "Producto"], ["/plan", "Cómo funciona"]] : appLinks).map(([href, label]) => <Link key={href} to={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined}>{label}</Link>)}
      </nav>
      {publicHeader ? (profile?.user ? <Link className="login-button" to="/personal">Ir a la aplicación</Link> : <><Link className="cta header-cta" to="/register">Crear organización</Link><Link className="login-button" to="/login">Entrar</Link></>) : profile?.user ? <div className="profile-menu"><button className="profile-trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="profile-avatar">{profile.user.name?.slice(0, 1).toUpperCase()}</span><span><strong>{profile.user.name}</strong><small>{profile.tenant?.name ?? "Plataforma"}</small></span><span aria-hidden="true">⌄</span></button>{profileOpen && <div className="profile-popover"><div><strong>{profile.user.name}</strong><small>{profile.user.email}</small></div><div className="popover-org">{profile.tenant?.name ?? "Cuenta de plataforma"}</div><button type="button" onClick={logout}>Cerrar sesión</button></div>}</div> : <Link className="login-button" to="/login">Entrar</Link>}
      <div className="swatches" aria-hidden="true"><i style={{ background: "#203b32" }} /><i style={{ background: "#aabb81" }} /><i style={{ background: "#ded4bd" }} /></div>
    </header>
    <div className="note">ENTORNO LOCAL · DATOS FICTICIOS DE PRUEBA · PERSISTEN EN POSTGRESQL CON COMPOSE</div>
    <main id="content" ref={main} tabIndex={-1}><Routes><Route path="/" element={<Landing />} /><Route path="/personal" element={<Personal />} /><Route path="/solicitudes" element={<Requests />} /><Route path="/historial" element={<History />} /><Route path="/jornadas/nueva" element={<WorkdayEditor />} /><Route path="/jornadas/:date/editar" element={<WorkdayEditor />} /><Route path="/perfil" element={<Profile />} /><Route path="/admin" element={<Admin />} /><Route path="/admin/equipo" element={<AdminTeam />} /><Route path="/admin/registros" element={<AdminRecords />} /><Route path="/admin/correcciones" element={<AdminCorrections />} /><Route path="/admin/informes" element={<AdminSection section="Informes" />} /><Route path="/admin/configuracion" element={<AdminConfig />} /><Route path="/plan" element={<Roadmap />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} /><Route path="/logout" element={<Logout />} /><Route path="*" element={<Landing />} /></Routes></main>
    <footer>Plegat · La teva jornada, al dia. <span>Demostración visual en desarrollo.</span></footer>
  </>;
}

export default function App() { return <BrowserRouter><Shell /></BrowserRouter>; }
