import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    sessionStorage.removeItem("plegat_authenticated");
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin", signal: controller.signal })
      .catch(() => null)
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) navigate("/", { replace: true });
      });
    return () => { cancelled = true; };
  }, [navigate]);

  return <div className="auth-shell"><div className="auth-card card"><p>Cerrando sesión…</p></div></div>;
}
