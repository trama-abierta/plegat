import { useEffect, useState } from "react";
import UserSidebar from "../components/UserSidebar.jsx";
const labels = {
  clock_in: "Entrada",
  break_start: "Inicio de pausa",
  break_end: "Reanudación",
  clock_out: "Salida",
};
const demoDefaults = () => {
  const year = new Date().getFullYear(),
    events = [];
  let sequence = 0;
  const add = (type, month, day, hour, minute) =>
    events.push({
      id: `demo-${++sequence}`,
      type,
      occurredAt: new Date(year, month, day, hour, minute).toISOString(),
      sequence,
    });
  const session = (month, day, start, end, breakStart = 13, breakEnd = 14) => {
    add("clock_in", month, day, start, 0);
    if (breakStart !== null) {
      add("break_start", month, day, breakStart, 0);
      add("break_end", month, day, breakEnd, 0);
    }
    add("clock_out", month, day, end, 0);
  };
  for (let month = 0; month < 8; month++) {
    session(month, 10, 8, 16, 12, 13);
    session(month, 18, 9, 17, 13, 14);
  }
  session(8, 2, 8, 16, 12, 13);
  session(8, 5, 7, 15, 11, 12);
  session(8, 8, 8, 16, 12, 13);
  session(8, 9, 8, 16, 13, 14);
  add("clock_in", 8, 10, 7, 53);
  add("break_start", 8, 10, 8, 53);
  add("break_end", 8, 10, 9, 8);
  add("clock_out", 8, 10, 17, 0);
  // La sesión demo siempre se ancla al momento de abrir/restaurar la demo:
  // entrada hace algo más de dos horas, pausa de 15 minutos y jornada abierta.
  const now = new Date();
  const addAt = (type, date) => events.push({ id: `demo-${++sequence}`, type, occurredAt: date.toISOString(), sequence });
  const startedAt = new Date(now.getTime() - 2 * 3600000 - 10 * 60000);
  addAt("clock_in", startedAt);
  addAt("break_start", new Date(startedAt.getTime() + 60 * 60000));
  addAt("break_end", new Date(startedAt.getTime() + 75 * 60000));
  return { version: 2, events, state: { status: "working", revision: events.length } };
};
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
};
const sorted = (es) =>
  [...es].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
const dayKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
const localDateTime = (value) => {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const latestSession = (es) => {
  let session = [];
  const sessions = [];
  for (const event of sorted(es)) {
    if (
      event.type === "clock_in" &&
      session.some((item) => item.type === "clock_out") &&
      dayKey(event.occurredAt) !== dayKey(session[0]?.occurredAt)
    ) {
      sessions.push(session);
      session = [];
    }
    session.push(event);
  }
  if (session.length) sessions.push(session);
  return sessions.at(-1) || [];
};
const work = (es) => {
  let total = 0,
    start = null,
    paused = false;
  for (const e of sorted(es)) {
    const t = +new Date(e.occurredAt);
    if (e.type === "clock_in") start = t;
    if (e.type === "break_start" && start !== null) {
      total += t - start;
      paused = true;
    }
    if (e.type === "break_end" && paused) {
      start = t;
      paused = false;
    }
    if (e.type === "clock_out" && start !== null) {
      total += t - start;
      start = null;
      paused = false;
    }
  }
  return total + (start !== null && !paused ? Date.now() - start : 0);
};
const pauseTotal = (es) => {
  let total = 0,
    start = null;
  for (const e of sorted(es)) {
    if (e.type === "break_start") start = +new Date(e.occurredAt);
    if (e.type === "break_end" && start !== null) {
      total += +new Date(e.occurredAt) - start;
      start = null;
    }
  }
  return total + (start !== null ? Date.now() - start : 0);
};
const currentPause = (es) => {
  let start = null;
  for (const event of sorted(es)) {
    if (event.type === "break_start") start = +new Date(event.occurredAt);
    if (event.type === "break_end") start = null;
  }
  return start === null ? 0 : Math.max(0, Date.now() - start);
};
export default function Personal() {
  const [state, setState] = useState({ status: "outside", revision: 0 }),
    [events, setEvents] = useState([]),
    [now, setNow] = useState(Date.now()),
    [demoMode, setDemoMode] = useState(true),
    [profile, setProfile] = useState({
      user: { name: "Laia Soler" },
      tenant: { name: "Demo Textil Mediterránea" },
    }),
    [message, setMessage] = useState(""),
    [menuEvent, setMenuEvent] = useState(null),
    [menuPosition, setMenuPosition] = useState(null),
    [requestEvent, setRequestEvent] = useState(null),
    [requestKind, setRequestKind] = useState("modify"),
    [affected, setAffected] = useState([]),
    [reason, setReason] = useState(""),
    [requestTime, setRequestTime] = useState(""),
    [requests, setRequests] = useState([]),
    [approval, setApproval] = useState(null),
    [withdrawRequest, setWithdrawRequest] = useState(null),
    [withdrawReason, setWithdrawReason] = useState("");
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("plegat_demo_attendance") || "null");
    const s = stored?.version === 2 ? stored : demoDefaults();
    setEvents(s.events);
    setState(s.state);
    localStorage.setItem("plegat_demo_attendance", JSON.stringify(s));
    setRequests(
      JSON.parse(localStorage.getItem("plegat_correction_requests") || "[]"),
    );
    fetch("/api/v1/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setDemoMode(false);
          setProfile(d);
          return Promise.all([
            fetch("/api/v1/me/attendance").then((r) => r.json()),
            fetch("/api/v1/me/corrections").then((r) =>
              r.ok ? r.json() : { requests: [] },
            ),
          ]).then(([v, c]) => {
            setEvents(v.events);
            setState(v.state);
            setRequests(c.requests || []);
          });
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    // Keep the authenticated view in sync with actions made from desktop or
    // mobile. Demo mode remains entirely local and is never polled.
    if (demoMode) return undefined;
    let disposed = false;
    const refresh = async () => {
      try {
        const [attendance, corrections] = await Promise.all([
          fetch("/api/v1/me/attendance"),
          fetch("/api/v1/me/corrections"),
        ]);
        if (disposed) return;
        if (attendance.ok) {
          const value = await attendance.json();
          setEvents(value.events || []);
          setState(value.state);
        }
        if (corrections.ok) setRequests((await corrections.json()).requests || []);
      } catch (_) {
        // A transient network failure should not disrupt the current view.
      }
    };
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => { disposed = true; clearInterval(id); };
  }, [demoMode]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".event-actions")) {
        setMenuEvent(null);
        setMenuPosition(null);
      }
    };
    const scroll = () => {
      setMenuEvent(null);
      setMenuPosition(null);
    };
    document.addEventListener("click", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, []);
  useEffect(() => {
    if (!approval) return;
    const id = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((approval.until - Date.now()) / 1000),
      );
      if (remaining === 0) {
        const saved = JSON.parse(
          localStorage.getItem("plegat_correction_requests") || "[]",
        ).map((r) =>
          r.id === approval.id
            ? { ...r, status: "approved", approvedAt: new Date().toISOString() }
            : r,
        );
        localStorage.setItem(
          "plegat_correction_requests",
          JSON.stringify(saved),
        );
        setRequests(saved);
        setApproval(null);
        setMessage("Cambios aprobados en la demo.");
      } else setApproval((a) => (a ? { ...a, remaining } : null));
    }, 250);
    return () => clearInterval(id);
  }, [approval]);
  function resetDemo() {
    const s = demoDefaults();
    localStorage.setItem("plegat_demo_attendance", JSON.stringify(s));
    localStorage.removeItem("plegat_correction_requests");
    setEvents(s.events);
    setState(s.state);
    setRequests([]);
    setApproval(null);
    setDemoMode(true);
    setProfile({
      user: { name: "Laia Soler" },
      tenant: { name: "Demo Textil Mediterránea" },
    });
    setMessage("Demo restaurada con datos de ejemplo.");
  }
  async function record(type) {
    if (demoMode) {
      const e = {
          id: crypto.randomUUID(),
          type,
          occurredAt: new Date().toISOString(),
          sequence: events.length + 1,
        },
        next = {
          status:
            type === "clock_in"
              ? "working"
              : type === "break_start"
                ? "on_break"
                : type === "break_end"
                  ? "working"
                  : "outside",
          revision: state.revision + 1,
        },
        all = [...events, e];
      setEvents(all);
      setState(next);
      localStorage.setItem(
        "plegat_demo_attendance",
        JSON.stringify({ version: 2, events: all, state: next }),
      );
      setMessage("Fichaje guardado en la demo.");
      return;
    }
    const r = await fetch("/api/v1/me/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ type }),
      }),
      d = await r.json();
    setEvents((v) => [...v, d.event]);
    setState(d.state);
    setMessage("Fichaje confirmado por el servidor.");
  }
  function affectedFor(e) {
    const all = sorted(sessionEvents),
      i = all.findIndex((x) => x.id === e.id);
    if (e.type === "break_start") {
      const end = all.slice(i + 1).find((x) => x.type === "break_end");
      return end ? [e, end] : [e];
    }
    if (e.type === "break_end") return [e];
    if (e.type === "clock_out") {
      const nextEntry = all.slice(i + 1).find((x) => x.type === "clock_in");
      return nextEntry ? [e, nextEntry] : [e];
    }
    if (e.type === "clock_in") {
      const end = all.findIndex((x, j) => j > i && x.type === "clock_out");
      return all.slice(i, end < 0 ? undefined : end + 1);
    }
    return [e];
  }
  function openRequest(e, kind) {
    setRequestEvent(e);
    setRequestKind(kind);
    setAffected(kind === "delete" ? affectedFor(e) : [e]);
    setReason("");
    setRequestTime(kind === "modify" ? localDateTime(e.occurredAt) : "");
    setMenuEvent(null);
  }
  async function submitRequest(e) {
    e.preventDefault();
    if (!requestEvent || !reason.trim()) return;
    const req = {
      eventId: requestEvent.id,
      eventType: requestEvent.type,
      originalTime: requestEvent.occurredAt,
      proposedTime: requestKind === "modify" ? requestTime || null : null,
      reason: reason.trim(),
      kind: requestKind,
      affectedEventIds: affected.map((x) => x.id),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (!demoMode) {
      const response = await fetch("/api/v1/me/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...req,
          proposal: {
            eventType: requestEvent.type,
            affectedEventIds: req.affectedEventIds,
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          data?.message || "No se pudo guardar la solicitud en el servidor.",
        );
        return;
      }
      setRequests((current) => [...current, data.request || data]);
    } else {
      const saved = [...requests, { ...req, id: crypto.randomUUID() }];
      localStorage.setItem("plegat_correction_requests", JSON.stringify(saved));
      setRequests(saved);
      setApproval({
        id: saved.at(-1).id,
        until: Date.now() + 5000,
        remaining: 5,
      });
    }
    setRequestEvent(null);
    setMessage(
      `Solicitud de ${requestKind === "delete" ? "eliminación" : "modificación"} enviada para revisión.`,
    );
  }
  async function submitWithdraw(e) {
    e.preventDefault();
    if (!withdrawRequest || !withdrawReason.trim()) return;
    if (!demoMode) {
      const response = await fetch(
        `/api/v1/me/corrections/${withdrawRequest.id}/withdraw`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: withdrawReason.trim() }),
        },
      );
      if (!response.ok) {
        setMessage("No se pudo retirar la solicitud.");
        return;
      }
      const data = await response.json().catch(() => null);
      setRequests((current) =>
        current.map((r) =>
          r.id === withdrawRequest.id
            ? data?.request || { ...r, status: "withdrawn" }
            : r,
        ),
      );
    } else {
      const saved = requests.map((r) =>
        r.id === withdrawRequest.id
          ? {
              ...r,
              status: "withdrawn",
              withdrawnAt: new Date().toISOString(),
              withdrawnBy:
                profile.user?.email || profile.user?.name || "usuario-demo",
              withdrawalReason: withdrawReason.trim(),
            }
          : r,
      );
      localStorage.setItem("plegat_correction_requests", JSON.stringify(saved));
      setRequests(saved);
    }
    setWithdrawRequest(null);
    setWithdrawReason("");
    setMessage("Solicitud retirada y conservada para auditoría.");
  }
  const requestAffectedIds = (r) => r.affectedEventIds || r.proposal?.affectedEventIds || (r.eventId ? [r.eventId] : []),
    requestEventType = (r) => r.eventType || r.proposal?.eventType,
    sessionEvents = latestSession(events),
    sessionEventIds = new Set(sessionEvents.map((e) => e.id)),
    pendingSessionRequests = requests.filter(
      (r) =>
        r.status === "pending" &&
        requestAffectedIds(r).some((id) =>
          sessionEventIds.has(id),
        ),
    ),
    approved = requests.filter((r) => r.status === "approved"),
    effective = sessionEvents
      .flatMap((e) => {
        const del = approved.find(
          (r) => r.kind === "delete" && requestAffectedIds(r).includes(e.id),
        );
        if (!del) return [e];
        if (del.eventId !== e.id) return [];
        return [
          { ...e, effective: "deleted" },
          ...sessionEvents
            .filter(
              (x) => requestAffectedIds(del).includes(x.id) && x.id !== e.id,
            )
            .map((x) => ({ ...x, effective: "nestedDeleted", parentId: e.id })),
        ];
      })
      .map((e) => {
        const change = approved.find(
          (r) => r.kind === "modify" && r.eventId === e.id && r.proposedTime,
        );
        return change
          ? { ...e, occurredAt: change.proposedTime, effective: "modified" }
          : e;
      }),
    recent = [...effective].sort(
      (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt),
    ),
    calcEvents = effective.filter(
      (e) => e.effective !== "deleted" && e.effective !== "nestedDeleted",
    ),
    currentStatus = calcEvents.reduce(
      (status, e) =>
        e.type === "clock_in"
          ? "working"
          : e.type === "break_start"
            ? "on_break"
            : e.type === "break_end"
              ? "working"
              : e.type === "clock_out"
                ? "outside"
                : status,
      "outside",
    ),
    sessionClosed =
      calcEvents.some((e) => e.type === "clock_out") &&
      currentStatus === "outside",
    sameDayResume =
      sessionClosed &&
      sessionEvents.some((e) => dayKey(e.occurredAt) === dayKey(now)),
    interruptions = calcEvents.filter(
      (e, index) =>
        e.type === "clock_in" &&
        index > 0 &&
        calcEvents[index - 1]?.type === "clock_out",
    ).length,
    paused = currentStatus === "on_break",
    action =
      currentStatus === "outside"
        ? ["clock_in", sameDayResume ? "Reanudar jornada" : "Registrar entrada"]
        : currentStatus === "working"
          ? ["break_start", "Iniciar pausa"]
          : ["break_end", "Finalizar pausa"];
  const requestForEvent = (e) =>
    requests.find(
      (r) =>
        r.status === "pending" &&
        r.eventId === e.id,
    );
  const pendingCascadeForEvent = (e) => requests.find((r) => r.status === "pending" && r.eventId !== e.id && requestAffectedIds(r).includes(e.id));
  const eventStatus = (e) => {
    const request = requestForEvent(e);
    const cascade = pendingCascadeForEvent(e);
    if (e.effective === "modified") return "Modificación aprobada";
    if (e.effective) return "Eliminación aprobada";
    if (cascade?.kind === "delete") return "↳ Eliminación pendiente";
    if (request?.kind === "modify") return "Modificación pendiente";
    if (request?.kind === "delete") return "Eliminación pendiente";
    return "Confirmado";
  };
  return (
    <div className="workspace">
      {approval && (
        <div className="approval-toast" role="status">
          Aprobando cambios en {approval.remaining}
        </div>
      )}
      <UserSidebar userLinks={!demoMode} />
      <div className="main">
        <div className="eyebrow">
          {demoMode
            ? "Explorar Plegat · Demo local"
            : `${profile.tenant?.name} · Sesión activa`}
        </div>
        <h1>Bon dia, {profile.user?.name}.</h1>
        <p>
          {new Date(now)
            .toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
            .replace(/^./, (value) => value.toUpperCase())}
        </p>
        {demoMode && (
          <div className="demo-tools">
            <span>Los datos solo viven en este navegador.</span>
            <button type="button" onClick={resetDemo}>
              Reset demo
            </button>
          </div>
        )}
        <div className="columns">
          <div className={`card ${paused ? "break-card" : ""}`}>
            <div className="row">
              <strong>{paused ? "Pausa activa" : "Tu jornada de hoy"}</strong>
              <span className="tag">
                ●{" "}
                {paused
                  ? "En pausa"
                  : currentStatus === "outside"
                    ? sessionClosed
                      ? "Jornada cerrada"
                      : "Sin iniciar"
                    : "Trabajando"}
              </span>
            </div>
            <div className="timer">
              {fmt(paused ? currentPause(calcEvents) : work(calcEvents), now)}
            </div>
            <p>
              {paused
                ? "Tiempo de pausa · desde el último inicio"
                : `Tiempo efectivo · ${demoMode ? "demo local" : "confirmado por el servidor"}`}
            </p>
            <div className="actions">
              <button onClick={() => record(action[0])}>{action[1]}</button>
              <button
                onClick={() => record("clock_out")}
                disabled={currentStatus === "outside" || paused}
              >
                Terminar jornada
              </button>
            </div>
            <small role="status">{message || "Listo para fichar."}</small>
          </div>
          <div className="card">
            <h3>Así va tu día</h3>
            <div className="line">
              <span>Hora actual</span>
              <strong>{new Date(now).toLocaleTimeString("es-ES")}</strong>
            </div>
            <div className="line">
              <span>Total registrado</span>
              <strong>{fmt(work(calcEvents), now)}</strong>
            </div>
            <div className="line">
              <span>Total pausas</span>
              <strong>{fmt(pauseTotal(calcEvents), now)}</strong>
            </div>
            <div className="line">
              <span>Pausas</span>
              <strong>
                {calcEvents.filter((e) => e.type === "break_start").length}
              </strong>
            </div>
            <div className="line">
              <span>Interrupciones</span>
              <strong>{interruptions}</strong>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: "24px" }}>
          <div className="row">
            <h3>Historial de esta sesión</h3>
            <span className="muted">
              {recent.length} eventos · más recientes primero
            </span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Hora</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr
                    key={e.id}
                    className={
                      requestForEvent(e)?.kind === "delete" || e.effective === "deleted"
                        ? "deleted-change"
                        : pendingCascadeForEvent(e) || e.effective === "nestedDeleted"
                          ? "nested-change"
                          : ""
                    }
                  >
                    <td>
                      {}
                      {labels[e.type]}
                      {e.effective === "deleted" && (
                        <small className="change-time">
                          Eliminación aprobada
                        </small>
                      )}
                      {e.effective === "nestedDeleted" && (
                        <small className="change-time">↳ Eliminado</small>
                      )}
                      {!e.effective && pendingCascadeForEvent(e) && (
                        <small className="change-time">↳ Afectado por la eliminación</small>
                      )}
                    </td>
                    <td>{new Date(e.occurredAt).toLocaleString("es-ES")}</td>
                    <td>{eventStatus(e)}</td>
                    <td className="event-actions">
                      {requestForEvent(e) ? (
                        <>
                          <button
                            className="event-menu"
                            type="button"
                            aria-label={`Acciones para ${labels[e.type]}`}
                            aria-expanded={menuEvent?.id === e.id}
                            onClick={(event) => {
                              const next = menuEvent?.id === e.id;
                              setMenuEvent(next ? null : e);
                              setMenuPosition(
                                next
                                  ? null
                                  : {
                                      top:
                                        event.currentTarget.getBoundingClientRect()
                                          .bottom + 6,
                                      left: Math.max(
                                        8,
                                        event.currentTarget.getBoundingClientRect()
                                          .right - 150,
                                      ),
                                    },
                              );
                            }}
                          >
                            ⋮
                          </button>
                          {menuEvent?.id === e.id && (
                            <div
                              className="event-popover"
                              style={menuPosition || undefined}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setWithdrawRequest(requestForEvent(e));
                                  setWithdrawReason("");
                                  setMenuEvent(null);
                                }}
                              >
                                Retirar solicitud
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        !e.effective && !pendingCascadeForEvent(e) && (
                          <>
                            <button
                              className="event-menu"
                              type="button"
                              aria-label={`Acciones para ${labels[e.type]}`}
                              aria-expanded={menuEvent?.id === e.id}
                              onClick={(event) => {
                                const next = menuEvent?.id === e.id;
                                setMenuEvent(next ? null : e);
                                setMenuPosition(
                                  next
                                    ? null
                                    : {
                                        top:
                                          event.currentTarget.getBoundingClientRect()
                                            .bottom + 6,
                                        left: Math.max(
                                          8,
                                          event.currentTarget.getBoundingClientRect()
                                            .right - 150,
                                        ),
                                      },
                                );
                              }}
                            >
                              ⋮
                            </button>
                            {menuEvent?.id === e.id && (
                              <div
                                className="event-popover"
                                style={menuPosition || undefined}
                              >
                                <button
                                  type="button"
                                  onClick={() => openRequest(e, "modify")}
                                >
                                  Modificar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRequest(e, "delete")}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {pendingSessionRequests.length > 0 && (
          <div className="card changes-card">
            <div className="row">
              <h3>Cambios pendientes de esta jornada</h3>
              <span className="muted">Los originales se conservan</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Fichaje</th>
                    <th>Afectados</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSessionRequests
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.kind === "delete" || r.kind === "delete_workday" ? "Eliminación" : "Modificación"}
                        </td>
                        <td>
                          {labels[requestEventType(r)] || "Fichaje"}
                          <small className="change-time">
                            {new Date(r.originalTime).toLocaleString("es-ES")}
                          </small>
                        </td>
                        <td>
                          {requestAffectedIds(r).length || 1}
                          {requestAffectedIds(r).length > 1 && (
                            <small className="nested-request-events">
                              {requestAffectedIds(r).slice(1).map((id) => {
                                const item = events.find((e) => e.id === id);
                                return item ? (
                                  <span key={id}>
                                    ↳ {labels[item.type]} ·{" "}
                                    {new Date(
                                      item.occurredAt,
                                    ).toLocaleTimeString("es-ES")}
                                  </span>
                                ) : null;
                              })}
                            </small>
                          )}
                        </td>
                        <td>
                          <span
                            className={`tag ${r.status === "approved" ? "tag-approved" : ""}`}
                          >
                            {r.status === "approved"
                              ? "Aprobado"
                              : r.status === "withdrawn"
                                ? "Solicitud retirada"
                                : "Pendiente"}
                          </span>
                          {r.status === "withdrawn" && (
                            <small className="change-time">
                              {r.withdrawnBy} ·{" "}
                              {new Date(r.withdrawnAt).toLocaleString("es-ES")}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {requestEvent && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
          >
            <div className="row">
              <h2 id="request-title">
                Solicitar{" "}
                {requestKind === "delete" ? "eliminación" : "modificación"}
              </h2>
              <button
                className="modal-close"
                type="button"
                aria-label="Cerrar"
                onClick={() => setRequestEvent(null)}
              >
                ×
              </button>
            </div>
            <p>
              Fichaje: <strong>{labels[requestEvent.type]}</strong> ·{" "}
              {new Date(requestEvent.occurredAt).toLocaleString("es-ES")}
            </p>
            {requestKind === "delete" && (
              <div className="affected-list">
                <strong>Eventos afectados</strong>
                <ul>
                  {affected.map((e) => (
                    <li key={e.id}>
                      {labels[e.type]} ·{" "}
                      {new Date(e.occurredAt).toLocaleString("es-ES")}
                    </li>
                  ))}
                </ul>
                <small>
                  Los originales se conservarán y el cambio se calculará al
                  aprobarse.
                </small>
              </div>
            )}
            <form className="auth-form" onSubmit={submitRequest}>
              <label>
                Motivo
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows="4"
                  required
                  placeholder="Explica qué ocurrió…"
                />
              </label>
              {requestKind === "modify" && (
                <label>
                  Hora propuesta (opcional)
                  <input
                    type="datetime-local"
                    value={requestTime}
                    onChange={(e) => setRequestTime(e.target.value)}
                  />
                </label>
              )}
              <div className="actions">
                <button type="button" onClick={() => setRequestEvent(null)}>
                  Cancelar
                </button>
                <button className="cta" type="submit">
                  Enviar solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {withdrawRequest && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-title"
          >
            <div className="row">
              <h2 id="withdraw-title">Retirar solicitud</h2>
              <button
                className="modal-close"
                type="button"
                aria-label="Cerrar"
                onClick={() => setWithdrawRequest(null)}
              >
                ×
              </button>
            </div>
            <p>
              La solicitud se conservará para auditoría, pero dejará de estar
              pendiente.
            </p>
            <form className="auth-form" onSubmit={submitWithdraw}>
              <label>
                Motivo de retirada
                <textarea
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  rows="3"
                  required
                  placeholder="Explica por qué retiras la solicitud…"
                />
              </label>
              <div className="actions">
                <button type="button" onClick={() => setWithdrawRequest(null)}>
                  Cancelar
                </button>
                <button className="cta" type="submit">
                  Retirar solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
