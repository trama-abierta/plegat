# Platform Identity and Multi-Tenant Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portable authentication, platform roles, tenant memberships, one-time platform bootstrap, and public tenant registration while preserving Spanish time-recording auditability.

**Architecture:** Keep the current Fastify API and PostgreSQL append-only attendance model. Add relational identity tables, signed HttpOnly sessions, authorization helpers, and transactional provisioning. Keep the in-memory store as a test adapter, while Compose uses PostgreSQL migrations and the restricted application role.

**Tech Stack:** Node.js 22, Fastify, JavaScript, PostgreSQL 17, Vitest/Node test runner, React/Vite.

**Spec:** Approved in chat on 2026-09-09; requirements are recorded in `README.md` and `GETTING_STARTED.md`.

## Global Constraints

- No TypeScript.
- Public registration activates immediately; email verification is out of MVP.
- Platform bootstrap is allowed exactly once only when no platform admin exists and no configured admin credentials are supplied.
- Every cross-tenant read/write requires explicit authorization and an active tenant scope.
- Attendance events remain append-only; corrections are compensating events and all security-sensitive actions are audited.
- Store only necessary personal data, use secure password hashing, and expose exportable audit records suitable for Spanish labor inspection.

### Task 1: Identity schema and bootstrap configuration

**Files:**
- Create: `apps/backend/migrations/005_identity_and_tenants.sql`
- Modify: `apps/backend/src/config.js`
- Create: `apps/backend/src/modules/passwords.js`
- Create: `tests/identity-schema.test.js`

- [ ] Write failing tests for users, tenants, memberships, sessions, audit log, unique emails/slugs, and bootstrap singleton constraints.
- [ ] Run `npm test -- tests/identity-schema.test.js` and verify failure.
- [ ] Add PostgreSQL tables and indexes with UTC timestamps, tenant status, role checks, membership uniqueness, and immutable audit rows.
- [ ] Add environment readers for optional `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD_FILE` without logging secrets.
- [ ] Implement password hashing and verification with a maintained Node-compatible password library already approved for the repository.
- [ ] Run the focused tests and then `npm test`.

### Task 2: Session and authorization service

**Files:**
- Create: `apps/backend/src/modules/auth.js`
- Modify: `apps/backend/src/app.js`
- Create: `tests/authz.test.js`

- [ ] Test login success/failure, HttpOnly session cookie, session expiration, active tenant selection, and role matrix for platform admin, support, platform user, tenant admin, and employee.
- [ ] Implement signed opaque sessions backed by PostgreSQL with secure cookie attributes and a memory adapter for unit tests.
- [ ] Add `requireAuthenticated`, `requirePlatformRole`, `requireTenantRole`, and `resolveTenantScope` helpers.
- [ ] Ensure suspended tenants and memberships are rejected before any data query.
- [ ] Audit login success/failure and privileged authorization failures without storing passwords or tokens.
- [ ] Run focused auth tests and full backend tests.

### Task 3: One-time platform bootstrap and public registration

**Files:**
- Modify: `apps/backend/src/server.js`
- Modify: `apps/backend/src/app.js`
- Modify: `apps/backend/src/store.js`
- Create: `tests/registration.test.js`

- [ ] Test configured admin reconciliation, one-time bootstrap closure, duplicate email/slug rejection, and transactional tenant-owner creation.
- [ ] Add startup bootstrap that creates/reconciles the configured first `platform_admin`.
- [ ] Add `POST /api/v1/auth/platform/bootstrap` guarded by the no-platform-admin singleton rule.
- [ ] Add `POST /api/v1/auth/register` creating tenant, owner user, membership, audit entry, and session in one transaction.
- [ ] Add strict validation for email, password length, organization name, slug, and Europe/Madrid-compatible IANA timezone values.
- [ ] Run registration and migration tests against the memory adapter and Compose PostgreSQL.

### Task 4: Platform and tenant administration API

**Files:**
- Create: `apps/backend/src/modules/platform.js`
- Modify: `apps/backend/src/app.js`
- Create: `tests/platform-api.test.js`

- [ ] Test platform admin CRUD/suspension, support read-only access, platform user denial of privileged actions, tenant-admin member management, and cross-tenant denial.
- [ ] Implement `GET/POST/PATCH /api/v1/platform/tenants` and member endpoints with pagination and deterministic ordering.
- [ ] Add `GET /api/v1/me` and active-tenant switching endpoint.
- [ ] Enforce least privilege and audit create, suspend, role change, support access, and member changes.
- [ ] Run focused API tests plus lint.

### Task 5: Frontend registration and administration surfaces

**Files:**
- Create: `apps/frontend/src/views/Register.jsx`
- Create: `apps/frontend/src/views/PlatformAdmin.jsx`
- Modify: `apps/frontend/src/App.jsx`
- Modify: `apps/frontend/src/views/Admin.jsx`
- Modify: `apps/frontend/src/style.css`
- Modify: `tests/ui/navigation.test.jsx`

- [ ] Test registration form validation, role-aware navigation, tenant selector, and admin empty/error/loading states.
- [ ] Implement public registration flow and authenticated session bootstrap.
- [ ] Add platform console for tenant listing, creation, suspension, and support visibility.
- [ ] Extend tenant admin view with member roles and audit-friendly status labels.
- [ ] Run UI tests and production build.

### Task 6: Spanish compliance and operational documentation

**Files:**
- Modify: `README.md`
- Modify: `GETTING_STARTED.md`
- Create: `docs/compliance/es-registro-horario.md`
- Create: `docs/operations/backup-and-audit.md`

- [ ] Document ET 34/2021 and related Spanish requirements as implementation controls, including four-year minimum retention policy, inspectable exports, append-only events, correction traceability, access logging, data minimization, and configurable retention/legal-hold policy.
- [ ] Document GDPR/LOPDGDD responsibilities, controller/processor boundaries, DPA checklist, rights workflows, breach response, and deletion/anonymization rules subject to labor retention.
- [ ] Document backup schedule, restore drill, audit export format, clock/timezone policy, and production secret rotation.
- [ ] Run `npm run lint`, `npm run test:ui`, `npm test`, and `npm run build` as the release gate.

