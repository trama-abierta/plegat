export default function Landing() {
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Menos gestiones. Más tiempo para ti.</div>
          <h1>
            La jornada clara.
            <br />
            El resto,
            <br />
            <em>es tiempo tuyo.</em>
          </h1>
          <p>
            Entrada, pausa y salida. Un lugar sencillo para registrar tu jornada
            y cuidar el tiempo de todo el equipo.
          </p>
          <div style={{ marginTop: "30px" }}>
            <a className="cta" href="/personal">
              Explorar la aplicación ↗
            </a>
            <a className="cta secondary" href="/admin">
              Ver administración
            </a>
          </div>
          <p className="small">En tu empresa. En tu móvil. A tu ritmo.</p>
        </div>
        <div className="card">
          <div className="row">
            <strong>Bon dia, Laia.</strong>
            <span className="tag">● Trabajando</span>
          </div>
          <p className="muted">Miércoles, 9 de septiembre · Datos de ejemplo</p>
          <div className="timer">
            04:12<span style={{ fontSize: "30px" }}>:38</span>
          </div>
          <p className="muted">Tiempo trabajado hoy</p>
          <div className="actions">
            <button disabled>Pausar</button>
            <button disabled>Terminar jornada ↗</button>
          </div>
          <div className="line">
            <span>Entrada</span>
            <strong>08:30</strong>
          </div>
          <div className="line">
            <span>Pausa no computable</span>
            <strong>11:00 — 11:15</strong>
          </div>
          <div className="line">
            <span>Reanudación</span>
            <strong>11:15</strong>
          </div>
          <div className="muted">
            Última confirmación del ejemplo · 12:57:38
          </div>
        </div>
      </div>
      <div className="ribbon">
        <span>01 · Fichar sin complicaciones</span>
        <span>02 · Consultar tu historial</span>
        <span>03 · Resolver incidencias con claridad</span>
      </div>
      <div className="features">
        <article>
          <h3>Tu día, de un vistazo.</h3>
          <p>
            Comprueba tus entradas, pausas y horas sin perderte entre menús.
          </p>
        </article>
        <article>
          <h3>Un equipo bien organizado.</h3>
          <p>Revisa incidencias y prepara informes desde un mismo espacio.</p>
        </article>
        <article>
          <h3>Cada cambio, con su historia.</h3>
          <p>
            Las correcciones explican qué cambió, quién lo revisó y por qué.
          </p>
        </article>
      </div>
    </>
  );
}
