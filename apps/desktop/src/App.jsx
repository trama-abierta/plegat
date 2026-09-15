import { useEffect, useMemo, useState } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  apiFetch,
  beginLogin,
  completeLogin,
  apiOrigin,
  webOrigin,
  signOut,
  restoreSession,
} from "./oauth.js";

const labels = {
  clock_in: "Iniciar jornada",
  break_start: "Iniciar pausa",
  break_end: "Reanudar jornada",
  clock_out: "Terminar jornada",
};

let callbackInFlight = false;
let lastCallback = "";

function stateLabel(state, events = []) {
  // Pending correction requests never alter the desktop state. The API may
  // expose a pending_review marker, so derive the visible state from the
  // original event stream in that case.
  const status = state?.status === "pending_review" ? "outside" : state?.status;
  if (!state || status === "outside")
    return events.at(-1)?.type === "clock_out"
      ? "Jornada cerrada"
      : "Sin iniciar";
  if (status === "working") return "Trabajando";
  if (status === "on_break") return "En pausa";
  return status || "Sin iniciar";
}

function statusIcon(status) {
  if (status === "Trabajando") return "🟢";
  if (status === "En pausa") return "☕";
  if (status === "Jornada cerrada") return "✅";
  return "⚪";
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function summarize(events = [], now = Date.now()) {
  let workStart = null;
  let breakStart = null;
  let worked = 0;
  let paused = 0;
  let pauses = 0;
  for (const event of events) {
    const at = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(at)) continue;
    if (event.type === "clock_in" || event.type === "break_end") workStart = at;
    if (event.type === "break_start" && workStart !== null) {
      worked += Math.max(0, at - workStart); workStart = null; breakStart = at; pauses += 1;
    }
    if (event.type === "break_end" && breakStart !== null) {
      paused += Math.max(0, at - breakStart); breakStart = null;
    }
    if (event.type === "clock_out") {
      if (workStart !== null) worked += Math.max(0, at - workStart);
      if (breakStart !== null) paused += Math.max(0, at - breakStart);
      workStart = null; breakStart = null;
    }
  }
  if (workStart !== null) worked += Math.max(0, now - workStart);
  if (breakStart !== null) paused += Math.max(0, now - breakStart);
  return { worked, paused, pauses };
}

function currentSessionEvents(events = []) {
  // The API returns the employee's complete history. A desktop summary must
  // only include the active session: everything after the latest clock-out.
  const lastOut = events.reduce((index, event, current) => event.type === "clock_out" ? current : index, -1);
  return events.slice(lastOut + 1);
}

function madridDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function lastCompletedSegment(events = []) {
  // Pair the latest clock-out with the clock-in that opened that segment.
  // This distinguishes a same-day split shift from a multi-day shift that
  // happened to finish today.
  let start = null;
  let completed = null;
  for (const event of events) {
    if (event.type === "clock_in") start = event.occurredAt;
    if (event.type === "clock_out" && start) {
      completed = { start, end: event.occurredAt };
      start = null;
    }
  }
  return completed;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const status = stateLabel(attendance?.state, attendance?.events);
  const lastCompleted = useMemo(() => lastCompletedSegment(attendance?.events || []), [attendance]);
  const canReopenToday = status === "Jornada cerrada" && madridDate(lastCompleted?.start) === madridDate(Date.now());
  const nextType = useMemo(() => {
    const last = attendance?.events?.at(-1)?.type;
    if (!last || last === "clock_out") return "clock_in";
    if (last === "clock_in" || last === "break_end") return "break_start";
    if (last === "break_start") return "break_end";
    return "clock_in";
  }, [attendance]);
  const activeEvents = useMemo(() => {
    const events = attendance?.events || [];
    // A split shift can contain several closed segments on the same local
    // day. Keep all of today's events so the counter represents the whole
    // workday instead of only the segment after the latest clock-out.
    const today = madridDate(now);
    const todayEvents = events.filter((event) => madridDate(event.occurredAt) === today);
    return todayEvents.length ? todayEvents : currentSessionEvents(events);
  }, [attendance, now]);
  const summary = useMemo(() => summarize(activeEvents, now), [activeEvents, now]);
  const dragWindow = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(() => { load(); }, 10_000);
    return () => clearInterval(timer);
  }, [session]);

  async function load() {
    try {
      const ok = await restoreSession();
      if (!ok) { await invoke("update_tray_status", { status: "Iniciar jornada" }).catch(() => {}); return; }
      // OAuth/session restoration is independent from the attendance view.
      // Keep the user logged in even if the attendance endpoint is temporarily
      // unavailable; the error is shown without discarding the session.
      setSession(true);
      const [response, corrections] = await Promise.all([
        apiFetch("/api/v1/me/attendance"),
        apiFetch("/api/v1/me/corrections"),
      ]);
      if (!response.ok) throw new Error("No se pudo cargar la jornada");
      const data = await response.json();
      setAttendance(data);
      if (corrections.ok) {
        const correctionData = await corrections.json();
        setPendingRequests((correctionData.requests || []).filter((request) => request.status === "pending"));
      }
      await invoke("update_tray_status", { status: stateLabel(data.state, data.events) }).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  }
  useEffect(() => {
    load();
    const handleUrls = async (urls) => {
      const values = Array.isArray(urls) ? urls : (urls ? [urls] : []);
      const callback = values.map((value) => String(value).trim()).find((value) => value.startsWith("plegat://oauth/callback"));
      if (!callback) {
        if (values.length) setMessage(`Enlace recibido: ${String(values[0]).slice(0, 80)}`);
        return;
      }
      if (callbackInFlight || callback === lastCallback) return;
      callbackInFlight = true;
      lastCallback = callback;
      setMessage("Callback OAuth recibido…");
      try {
        await completeLogin(callback);
        setMessage("Sesión iniciada");
        setSession(true);
        await load();
      } catch (error) {
        // A browser may deliver the same callback twice (automatic redirect
        // plus the manual button). If the first delivery already stored the
        // refresh token, keep the authenticated state instead of replacing it
        // with the duplicate's "state not found" error.
        try {
          const restored = await restoreSession();
          if (restored) {
            setSession(true);
            setMessage("Sesión iniciada");
            await load();
            return;
          }
        } catch (_) { /* report the original OAuth error below */ }
        setMessage(error.message);
        lastCallback = "";
      } finally {
        callbackInFlight = false;
      }
    };
    getCurrent().then(handleUrls).catch(() => {});
    const unlisten = onOpenUrl(handleUrls);
    const unlistenTray = listen("tray://logout", () => logout());
    // The single-instance plugin queues URLs when the callback arrives while
    // the webview is still mounting. Drain that queue after registering the
    // listener so no OAuth callback is lost.
    invoke("take_pending_deep_links").then(handleUrls).catch(() => {});
    return () => {
      unlisten.then((dispose) => dispose()).catch(() => {});
      unlistenTray.then((dispose) => dispose()).catch(() => {});
    };
  }, []);

  async function action(type = nextType) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/v1/me/events", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ type }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "No se pudo registrar el fichaje");
      const refreshed = await apiFetch("/api/v1/me/attendance");
      if (refreshed.ok) {
        const data = await refreshed.json();
        setAttendance(data);
        await invoke("update_tray_status", { status: stateLabel(data.state, data.events) }).catch(() => {});
      }
      const corrections = await apiFetch("/api/v1/me/corrections");
      if (corrections.ok) {
        const correctionData = await corrections.json();
        setPendingRequests((correctionData.requests || []).filter((request) => request.status === "pending"));
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await signOut();
    setSession(false);
    setAttendance(null);
    setPendingRequests([]);
    await invoke("update_tray_status", { status: "Iniciar jornada" }).catch(() => {});
    setMessage("Sesión cerrada");
  }

  return (
    <main className="shell">
      <header data-tauri-drag-region onMouseDown={dragWindow}>
        <strong className="desktop-brand"><img src="/plegat.svg" alt="" /><span>Plegat</span></strong>
        <button
          className="window-button"
          aria-label="Ocultar Plegat en la bandeja"
          title="Ocultar en la bandeja"
          onClick={() => getCurrentWindow().hide()}
        >
          —
        </button>
      </header>
      <section className="card">
        <div className="eyebrow">CLIENTE DE ESCRITORIO · WINDOWS / LINUX</div>
        <h1>Tu jornada</h1>
        {session ? (
          <>
            <p className="tenant">Estado actual <span className="status-badge"><span aria-hidden="true">{statusIcon(status)}</span> {status}</span></p>
            {pendingRequests.length > 0 && (
              <div className="pending-notice" role="status">
                <span aria-hidden="true">⚠</span>
                <span>Esta jornada tiene cambios pendientes. Los fichajes originales siguen activos.</span>
                <button className="web-link" onClick={() => open(`${webOrigin()}/historial`)}>Revisar en la web ↗</button>
              </div>
            )}
            <div className="day-summary" aria-label="Resumen de hoy">
              <span>Registrado <strong>{formatDuration(summary.worked)}</strong></span>
              <span>Pausas <strong>{summary.pauses} · {formatDuration(summary.paused)}</strong></span>
            </div>
            <div className="actions">
              {nextType === "clock_in" && status === "Jornada cerrada" ? (
                <>
                  <p>
                    {canReopenToday
                      ? "La jornada de hoy está cerrada. Puedes reanudarla para continuar con otro tramo."
                      : "La jornada anterior está cerrada. Puedes iniciar una nueva."}
                  </p>
                  <button className="primary" disabled={busy} onClick={() => action("clock_in")}>
                    {busy ? "Guardando…" : canReopenToday ? "Reanudar jornada" : "Iniciar jornada"}
                  </button>
                </>
              ) : status === "En pausa" ? (
                <button className="primary" disabled={busy} onClick={() => action("break_end")}>
                  {busy ? "Guardando…" : "Reanudar jornada"}
                </button>
              ) : (
                <>
                  <button className="primary" disabled={busy} onClick={() => action(nextType)}>
                    {busy ? "Guardando…" : labels[nextType]}
                  </button>
                  {status === "Trabajando" && (
                    <button className="finish" disabled={busy} onClick={() => action("clock_out")}>
                      {busy ? "Guardando…" : "Terminar jornada"}
                    </button>
                  )}
                </>
              )}
              <button className="web-link" onClick={() => open(`${webOrigin()}/personal`)}>
                Abrir Plegat web ↗
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Inicia sesión en Plegat para registrar solo las acciones válidas
              de tu jornada.
            </p>
            <button
              className="primary"
              onClick={() =>
                beginLogin().catch((error) => setMessage(error.message))
              }
            >
              Entrar con Plegat
            </button>
          </>
        )}
        <small role="status">{message}</small>
      </section>
      <footer>
        La gestión avanzada y las correcciones se hacen en la aplicación web.
      </footer>
    </main>
  );
}
