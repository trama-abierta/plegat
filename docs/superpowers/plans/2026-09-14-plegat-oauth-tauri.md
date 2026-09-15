# Plegat OAuth/OIDC + Tauri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir autenticación OAuth/OIDC con PKCE para Tauri, sesiones desktop revocables, vinculación de identidades externas y configuración de autoalta por organización.

**Architecture:** Plegat será servidor de autorización y API de recursos. La web mantendrá cookies HttpOnly; Tauri usará códigos de un solo uso, access tokens cortos y refresh tokens rotatorios almacenados en el almacén seguro del sistema.

**Tech Stack:** Node.js, Fastify, JavaScript ESM, PostgreSQL, Drizzle ORM, React/Tauri 2 preparado para integración posterior.

**Spec:** `docs/superpowers/specs/2026-09-14-plegat-oauth-tauri-design.md`

## Global Constraints

- No guardar tokens, contraseñas ni `code_verifier` en claro.
- No conectar Tauri directamente con PostgreSQL.
- Mantener la pertenencia de un usuario a una única organización.
- El primer creador de organización es `tenant_admin` y `employee`.
- El autoalta crea `employee` y se configura por organización.
- MFA, offline y multi-organización quedan fuera del MVP.

### Task 1: Persistencia OAuth y configuración de identidad

**Files:**
- Create: `apps/backend/drizzle/0001_oauth_desktop.sql`
- Modify: `apps/backend/src/db/schema.js`
- Modify: `apps/backend/src/store.js`
- Test: `apps/backend/test/oauth-store.test.js`

- [ ] Crear tablas `oauth_clients`, `external_identities`, `oauth_authorization_codes` y `desktop_sessions` con índices, expiración y restricciones únicas.
- [ ] Añadir funciones de store para crear/consumir códigos, enlazar identidades, crear/rotar/revocar sesiones desktop y guardar hashes.
- [ ] Añadir pruebas de código de un solo uso, expiración, vínculo por proveedor/subject y revocación.
- [ ] Ejecutar migración y tests del backend.

### Task 2: Endpoints OAuth/OIDC

**Files:**
- Create: `apps/backend/src/modules/oauth.js`
- Modify: `apps/backend/src/app.js`
- Modify: `apps/backend/src/config.js`
- Test: `apps/backend/test/oauth-routes.test.js`

- [ ] Implementar `GET /oauth/authorize` con `state`, `nonce`, PKCE, cliente público y redirect URI exacta.
- [ ] Implementar callback OIDC configurable y validación de issuer, audience, nonce y email verificado.
- [ ] Implementar `POST /oauth/token` para `authorization_code` y `refresh_token`.
- [ ] Implementar `POST /oauth/revoke`.
- [ ] Registrar auditoría y devolver errores OAuth consistentes.
- [ ] Probar intercambio correcto, verifier incorrecto, código reutilizado y refresh revocado.

### Task 3: Autoalta, vinculación y configuración

**Files:**
- Modify: `apps/backend/src/store.js`
- Modify: `apps/backend/src/app.js`
- Modify: `apps/backend/src/db/schema.js`
- Modify: `apps/frontend/src/views/AdminConfig.jsx`
- Test: `apps/backend/test/identity-provisioning.test.js`

- [ ] Añadir `identity.autoProvisioning`, `allowedDomains`, `providers` y `defaultRole` a los settings.
- [ ] Vincular una identidad externa existente por `(provider, subject)`.
- [ ] Vincular por email solo si el proveedor lo marca como verificado.
- [ ] Crear empleado automáticamente solo con dominio permitido y autoalta activa.
- [ ] Bloquear organización inexistente y dominios no permitidos.
- [ ] Mostrar y guardar la configuración desde Administración → Configuración.

### Task 4: Cliente Tauri mínimo

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src/App.jsx`
- Modify: `apps/desktop/README.md`

- [ ] Crear cliente Tauri 2 con capability mínima, CSP y deep link `plegat://oauth/callback`.
- [ ] Implementar inicio de autorización en navegador y validación local de `state`.
- [ ] Intercambiar código PKCE y mantener access token solo en memoria.
- [ ] Dejar adaptador de secure storage para refresh token por plataforma.
- [ ] Mostrar únicamente estado actual, acciones válidas y enlace a la web.

### Task 5: Verificación y documentación

**Files:**
- Modify: `README.md`
- Create: `apps/backend/test/oauth-security.test.js`

- [ ] Documentar endpoints, variables OIDC, alta automática y revocación.
- [ ] Añadir pruebas de aislamiento por tenant y auditoría.
- [ ] Ejecutar `npm test` y `npm run build` en frontend/backend.
- [ ] Verificar manualmente login, logout, refresh, revocación y callback de Tauri.
