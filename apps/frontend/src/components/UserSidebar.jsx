import { NavLink } from "react-router-dom";

export default function UserSidebar({ children, userLinks = true, showPersonal = true }) {
  const linkClass = ({ isActive }) => (isActive ? "selected" : undefined);
  return (
    <aside className="side" aria-label="Secciones de la aplicación">
      {showPersonal && (
        <NavLink to="/personal" className={linkClass}>
          Mi jornada
        </NavLink>
      )}
      {userLinks && (
        <>
          <NavLink to="/solicitudes" className={linkClass}>
            Mis solicitudes
          </NavLink>
          <NavLink to="/perfil" className={linkClass}>
            Mi perfil
          </NavLink>
          <NavLink to="/historial" className={linkClass}>
            Historial
          </NavLink>
        </>
      )}
      {children}
    </aside>
  );
}
