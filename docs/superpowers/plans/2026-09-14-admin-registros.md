# Admin Registros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una vista ADMIN → Registros paginada, filtrable y auditable con datos reales por tenant.

**Architecture:** El backend agregará eventos append-only en jornadas por empleado y fecha, aplicando la proyección efectiva de correcciones. La interfaz consumirá un endpoint paginado para la tabla y otro endpoint de detalle, sin usar localStorage ni modificar fichajes originales.

**Tech Stack:** Node.js, Fastify, PostgreSQL, Drizzle/consultas existentes, React, React Router, CSS propio.

**Spec:** Diseño aprobado en la conversación del 14/09/2026.

## Global Constraints

- Todos los datos de Registros proceden del tenant activo y requieren `tenant_admin` o `auditor`.
- Los fichajes originales permanecen intactos; las correcciones aprobadas solo cambian la lectura efectiva.
- No se usa `localStorage` en la sección administrativa.
- Las fechas se presentan en `Europe/Madrid`.

### Task 1: Servicio de consultas administrativas

**Files:**
- Modify: `apps/backend/src/store.js`
- Modify: `apps/backend/src/app.js`
- Test: `tests/admin-records.test.js`

- [ ] Añadir `store.listAttendanceRecords({ tenantId, from, to, employeeId, status, page, pageSize, sort, order })` que agrupe eventos efectivos por empleado y día y devuelva `{ rows, total, page, pageSize }`.
- [ ] Añadir `store.getAttendanceRecord({ tenantId, employeeId, date })` para devolver eventos originales, eventos efectivos, pausas, duración y solicitudes relacionadas.
- [ ] Añadir `GET /api/v1/tenants/:tenantId/attendance` y `GET /api/v1/tenants/:tenantId/attendance/:employeeId/:date`, protegidos por `requireTenantRole`.
- [ ] Validar fechas, límites de página, empleado perteneciente al tenant y orden permitido.
- [ ] Cubrir con pruebas aislamiento por tenant, paginación, estados y detalle con corrección aprobada.

### Task 2: Cálculo de jornadas y estados

**Files:**
- Create: `apps/backend/src/modules/attendance-records.js`
- Modify: `apps/backend/src/store.js`
- Test: `tests/attendance-records.test.js`

- [ ] Implementar funciones puras `groupEventsByWorkday`, `summarizeWorkday` y `classifyWorkday`.
- [ ] Calcular entrada, salida, pausas, tiempo efectivo, jornada abierta, jornada incompleta e incidencias.
- [ ] Mantener jornadas multidía sin duplicar eventos.
- [ ] Incluir solicitudes pendientes y aprobadas vinculadas al día.
- [ ] Verificar que una salida aprobada o una modificación se refleja en `effectiveEvents` sin alterar `originalEvents`.

### Task 3: Pantalla ADMIN → Registros

**Files:**
- Create: `apps/frontend/src/views/AdminRecords.jsx`
- Modify: `apps/frontend/src/App.jsx`
- Modify: `apps/frontend/src/style.css`

- [ ] Sustituir el placeholder de `/admin/registros` por la vista funcional.
- [ ] Añadir filtros de rango, empleado, estado y búsqueda.
- [ ] Añadir tabla con ordenación, paginación y resumen de resultados.
- [ ] Mostrar estados `En curso`, `Cerrada`, `Incompleta`, `Con incidencia` y `Pendiente de revisión`.
- [ ] Añadir panel de detalle con timeline, pausas, duración, eventos originales y efectivos, correcciones y auditoría relacionada.
- [ ] Mantener el menú lateral de administración común.

### Task 4: Exportación y validación final

**Files:**
- Modify: `apps/backend/src/app.js`
- Modify: `apps/backend/src/store.js`
- Modify: `apps/frontend/src/views/AdminRecords.jsx`
- Modify: `README.md`

- [ ] Hacer que la exportación CSV acepte los mismos filtros de Registros.
- [ ] Ejecutar pruebas backend y build frontend.
- [ ] Probar permisos de admin y auditor, aislamiento de tenant y estados sin actividad.
- [ ] Documentar endpoints, filtros y reglas de cálculo.
