export default function Roadmap() {
  return (
    <>
      <div className="roadmap">
        <span className="eyebrow">
          Hoja de ruta propuesta · Pendiente de aprobación
        </span>
        <h1 style={{ fontSize: "44px" }}>
          De una buena base
          <br />a un primer equipo real.
        </h1>
        <div className="card">
          <strong>01 · Diseño y prototipo navegable</strong>
          <p>
            Landing, mi jornada y administración. Revisar estilo, navegación y
            estados vacíos, de error y sin conexión. Salida: diseño aprobado.
          </p>
        </div>
        <div className="card">
          <strong>02 · Acceso y aislamiento de empresa</strong>
          <p>
            Auth portable, bootstrap e invitaciones, roles y pertenencias.
            Salida: dos empresas de prueba aisladas y sesiones revocables.
          </p>
        </div>
        <div className="card">
          <strong>03 · Fichaje de principio a fin</strong>
          <p>
            Entrada, pausas y salida; estado confirmado por servidor,
            idempotencia y concurrencia. Salida: recorrido usable con PostgreSQL
            real.
          </p>
        </div>
        <div className="card">
          <strong>04 · Historial, correcciones e informes</strong>
          <p>
            Hechos append-only, aprobación, auditoría y CSV/PDF. Salida:
            original recuperable, revisión visible y cálculos temporales
            verificados.
          </p>
        </div>
        <div className="card">
          <strong>05 · Piloto on-premise y clientes</strong>
          <p>
            Compose probado, restauración, PWA y Tauri Windows/Linux. Salida:
            instalación reproducible y prueba de recuperación documentada.
          </p>
        </div>
        <div className="card">
          <strong>06 · Producto comercial</strong>
          <p>
            MFA, soporte y operación multiempresa; AWS y React Native/Expo según
            demanda. Salida: planes separados tras validar el piloto.
          </p>
        </div>
      </div>
    </>
  );
}
