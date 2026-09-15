import { randomUUID } from "node:crypto";
import { applyAttendanceEvent, elapsedWorkMs } from "./modules/attendance.js";
import { hashPassword, verifyPassword } from "./modules/passwords.js";
import { authorizationCodeId, hashSecret, randomSecret, sessionToken } from "./modules/oauth.js";
import { eq, and, desc, gt, inArray, isNull } from "drizzle-orm";
import { employees as employeesTable, attendanceChangeRequests, attendanceStates, attendanceEvents as attendanceEventsTable, attendanceWorkdayProjections, attendanceProjectionEvents, users as usersTable, memberships as membershipsTable, sessions as sessionsTable, auditLog, tenantSettings, oauthClients, oauthAuthorizationCodes, desktopSessions } from "./db/schema.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function sourceEventIdOrNull(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}
export function persistedEventIds(values = []) {
  return values.map(sourceEventIdOrNull).filter(Boolean);
}

export function applyApprovedAttendanceChanges(events, requests) {
  const approved = requests.filter(request => request.status === "approved");
  const deleted = new Set();
  const modified = new Map();
  for (const request of approved) {
    if (request.kind === "delete" || request.kind === "delete_workday") {
      const targetId = request.eventId ?? request.event_id;
      if (targetId) deleted.add(targetId);
      const ids = request.affectedEventIds ?? request.proposal?.affectedEventIds ?? request.proposal?.eventIds ?? [];
      for (const id of ids) deleted.add(id);
      if (!ids.length) {
        const targetIndex = events.findIndex(event => event.id === targetId);
        const nextEntry = targetIndex >= 0 ? events.slice(targetIndex + 1).find(event => event.type === "clock_in") : null;
        if (events[targetIndex]?.type === "clock_out" && nextEntry) deleted.add(nextEntry.id);
      }
    }
    if (request.kind === "modify" && (request.proposedTime ?? request.proposed_time)) modified.set(request.eventId ?? request.event_id, request.proposedTime ?? request.proposed_time);
  }
  return events.filter(event => !deleted.has(event.id)).map(event => modified.has(event.id) ? { ...event, occurredAt: modified.get(event.id) } : event);
}

const attendanceDate = (value, timeZone = "Europe/Madrid") => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const isoEvent = event => ({ ...event, occurredAt: event.occurredAt instanceof Date ? event.occurredAt.toISOString() : event.occurredAt });
export function validateAttendanceQuery(query = {}) {
  const fail = () => { throw Object.assign(new Error("Filtros de registros no válidos"), { code: "INVALID_ATTENDANCE_QUERY", statusCode: 400 }); };
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  for (const key of ["from", "to", "date"]) if (query[key] !== undefined && !validDate(query[key])) fail();
  if (query.from && query.to && query.from > query.to) fail();
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20);
  const sort = query.sort ?? "date", order = query.order ?? "desc";
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) fail();
  if (!["date", "employee", "employeeName", "status", "clockIn", "clockOut", "workedMs", "breakMs"].includes(sort) || !["asc", "desc"].includes(order)) fail();
  if (query.status && !["in_progress", "closed", "incomplete", "incident", "pending_review"].includes(query.status)) fail();
  if (query.employeeId !== undefined && (typeof query.employeeId !== "string" || !query.employeeId.trim())) fail();
  if (query.search !== undefined && (typeof query.search !== "string" || query.search.length > 200)) fail();
  return { ...query, page, pageSize, sort, order };
}

function groupAttendanceEvents(input) {
  const groups = new Map();
  let activeDate = null;
  for (const event of [...input].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt) || (a.sequence ?? 0) - (b.sequence ?? 0))) {
    if (event.type === "clock_in") activeDate = attendanceDate(event.occurredAt);
    const date = activeDate ?? attendanceDate(event.occurredAt);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(event);
    if (event.type === "clock_out") activeDate = null;
  }
  return groups;
}

function summarizeAttendance(events, requests = []) {
  const ordered = events.map(isoEvent).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  let startedAt = null, breakStartedAt = null, workedMs = 0, breakMs = 0, incident = false;
  const breaks = [];
  for (const event of ordered) {
    const at = new Date(event.occurredAt).getTime();
    if (event.type === "clock_in") { if (startedAt !== null) incident = true; startedAt = at; }
    else if (event.type === "break_start") { if (startedAt === null || breakStartedAt !== null) incident = true; else { workedMs += Math.max(0, at - startedAt); startedAt = null; breakStartedAt = at; } }
    else if (event.type === "break_end") { if (breakStartedAt === null) incident = true; else { const durationMs = Math.max(0, at - breakStartedAt); breakMs += durationMs; breaks.push({ start: new Date(breakStartedAt).toISOString(), end: event.occurredAt, durationMs }); breakStartedAt = null; startedAt = at; } }
    else if (event.type === "clock_out") { if (startedAt === null && breakStartedAt === null) incident = true; if (startedAt !== null) workedMs += Math.max(0, at - startedAt); if (breakStartedAt !== null) { const durationMs = Math.max(0, at - breakStartedAt); breakMs += durationMs; breaks.push({ start: new Date(breakStartedAt).toISOString(), end: event.occurredAt, durationMs }); } startedAt = null; breakStartedAt = null; }
    else incident = true;
  }
  // En una jornada abierta el tiempo efectivo sigue corriendo, igual que en
  // Mi jornada. Las pausas abiertas se contabilizan aparte y no computan como
  // trabajo efectivo.
  const now = Date.now();
  if (startedAt !== null) workedMs += Math.max(0, now - startedAt);
  if (breakStartedAt !== null) breakMs += Math.max(0, now - breakStartedAt);
  const pendingRequestCount = requests.filter(request => request.status === "pending").length;
  const open = startedAt !== null || breakStartedAt !== null;
  const status = pendingRequestCount ? "pending_review" : incident ? "incident" : open ? "in_progress" : ordered.some(event => event.type === "clock_in") && ordered.some(event => event.type === "clock_out") ? "closed" : "incomplete";
  return { status, clockIn: ordered.find(event => event.type === "clock_in")?.occurredAt ?? null, clockOut: ordered.findLast(event => event.type === "clock_out")?.occurredAt ?? null, breakMs, workedMs, breaks, eventCount: ordered.length, pendingRequestCount, hasIncident: incident };
}

export function createStore({ db = null, orm = null, seed = true } = {}) {
  const users = new Map();
  const tenants = new Map([
    [
      "demo-tenant",
      {
        id: "demo-tenant",
        name: "Demo Textil Mediterránea",
        slug: "demo-textil-mediterranea",
        timeZone: "Europe/Madrid",
        status: "active",
      },
    ],
  ]);
  const memberships = new Map();
  const sessions = new Map();
  const oauthCodes = new Map();
  const desktop = new Map();
  const employees = new Map();
  const states = new Map();
  const events = new Map();
  const idempotency = new Map();
  const changeRequests = new Map();
  const settings = new Map();
  const defaultSettings = { organization: { legalName: '', taxId: '', address: '', contact: '' }, workday: { weeklyHours: 40, workingDays: 'L-V', breakPolicy: 'Según convenio', timezone: 'Europe/Madrid' }, approvals: { mode: 'manual', autoApproveDelaySeconds: 5, autoApproveModifications: false }, retention: { years: 4, backupFrequency: 'Diaria', reportTimezone: 'Europe/Madrid' }, identity: { autoProvisioning: false, allowedDomains: [], providers: [], defaultRole: 'employee', requireInvitation: true } };
  const tenant = tenants.get("demo-tenant");
  const employee = {
    id: "demo-employee",
    name: "Laia Soler",
    email: "laia@plegat.local",
    tenantId: tenant.id,
    role: "employee",
  };
  if (seed) {
    users.set("laia@plegat.local", {
      ...employee,
      password: "plegat",
      platformRole: null,
    });
    users.set("admin@plegat.local", {
      id: "demo-platform-admin",
      name: "Plegat Platform Admin",
      email: "admin@plegat.local",
      password: "plegat-platform",
      platformRole: "platform_admin",
    });
    users.set("admin@demo.plegat.local", {
      id: "demo-tenant-admin",
      name: "Administración Demo",
      email: "admin@demo.plegat.local",
      password: "plegat-admin",
      platformRole: null,
    });
    users.set("auditor@demo.plegat.local", {
      id: "demo-auditor",
      name: "Auditoría Demo",
      email: "auditor@demo.plegat.local",
      password: "plegat-auditor",
      platformRole: null,
    });
    memberships.set("demo-tenant-admin:demo-tenant", {
      userId: "demo-tenant-admin",
      tenantId: "demo-tenant",
      role: "tenant_admin",
      status: "active",
    });
    memberships.set("demo-auditor:demo-tenant", {
      userId: "demo-auditor",
      tenantId: "demo-tenant",
      role: "auditor",
      status: "active",
    });
    employees.set(employee.id, employee);
    states.set(employee.id, { status: "outside", revision: 0 });
    events.set(employee.id, []);
    for (const item of [
      { id: "demo-employee-2", name: "Marc Vila", email: "marc@plegat.local" },
      {
        id: "demo-employee-3",
        name: "Júlia Roca",
        email: "julia@plegat.local",
      },
      { id: "demo-employee-4", name: "Pol Costa", email: "pol@plegat.local" },
    ]) {
      const seeded = { ...item, tenantId: tenant.id, role: "employee" };
      employees.set(seeded.id, seeded);
      states.set(seeded.id, { status: "outside", revision: 0 });
      events.set(seeded.id, []);
    }
  }

  return {
    tenant,
    tenants,
    users,
    memberships,
    sessions,
    oauthCodes,
    desktop,
    async getOAuthClient(clientId) {
      if (orm) return (await orm.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1))[0] ?? null;
      if (db) return (await db.query('SELECT id, name, type, redirect_uris AS "redirectUris", allowed_scopes AS "allowedScopes", status FROM oauth_clients WHERE id = $1', [clientId])).rows[0] ?? null;
      return clientId === 'plegat-desktop' ? { id: 'plegat-desktop', name: 'Plegat Desktop', type: 'public', redirectUris: ['plegat://oauth/callback'], allowedScopes: ['openid', 'profile', 'email'], status: 'active' } : null;
    },
    async createAuthorizationCode({ clientId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod = 'S256', state }) {
      const id = authorizationCodeId();
      const expiresAt = new Date(Date.now() + 60_000);
      const stateHash = state ? hashSecret(state) : null;
      const row = { id, clientId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, stateHash, expiresAt };
      if (orm) await orm.insert(oauthAuthorizationCodes).values(row);
      else if (db) await db.query('INSERT INTO oauth_authorization_codes (id,client_id,user_id,redirect_uri,scope,code_challenge,code_challenge_method,state_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, clientId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, stateHash, expiresAt]);
      else oauthCodes.set(id, row);
      return id;
    },
    async getAuthorizationCode(id) {
      if (!id) return null;
      const now = new Date();
      if (orm) return (await orm.select().from(oauthAuthorizationCodes).where(and(eq(oauthAuthorizationCodes.id, id), gt(oauthAuthorizationCodes.expiresAt, now), isNull(oauthAuthorizationCodes.usedAt))).limit(1))[0] ?? null;
      if (db) return (await db.query('SELECT id, client_id AS "clientId", user_id AS "userId", redirect_uri AS "redirectUri", scope, code_challenge AS "codeChallenge", code_challenge_method AS "codeChallengeMethod", state_hash AS "stateHash", expires_at AS "expiresAt" FROM oauth_authorization_codes WHERE id = $1 AND expires_at > now() AND used_at IS NULL', [id])).rows[0] ?? null;
      const row = oauthCodes.get(id);
      return row && !row.usedAt && row.expiresAt > now ? row : null;
    },
    async consumeAuthorizationCode(id) {
      if (!id) return null;
      const now = new Date();
      if (orm) {
        const updated = await orm.update(oauthAuthorizationCodes).set({ usedAt: now }).where(and(eq(oauthAuthorizationCodes.id, id), gt(oauthAuthorizationCodes.expiresAt, now), isNull(oauthAuthorizationCodes.usedAt))).returning();
        return updated[0] ?? null;
      }
      if (db) {
        const result = await db.query('UPDATE oauth_authorization_codes SET used_at = now() WHERE id = $1 AND expires_at > now() AND used_at IS NULL RETURNING id, client_id AS "clientId", user_id AS "userId", redirect_uri AS "redirectUri", scope, code_challenge AS "codeChallenge", code_challenge_method AS "codeChallengeMethod", state_hash AS "stateHash", expires_at AS "expiresAt"', [id]);
        return result.rows[0] ?? null;
      }
      const row = oauthCodes.get(id);
      if (!row || row.usedAt || row.expiresAt <= now) return null;
      row.usedAt = now;
      oauthCodes.delete(id);
      return row;
    },
    async createDesktopSession({ userId, clientId, activeTenantId = null, deviceName = null, platform = null, appVersion = null }) {
      const id = `desktop-${randomUUID()}`;
      const accessToken = randomSecret(32);
      const refreshToken = randomSecret(48);
      const now = new Date();
      const row = { id, userId, clientId, accessTokenHash: hashSecret(accessToken), refreshTokenHash: hashSecret(refreshToken), activeTenantId, deviceName, platform, appVersion, accessExpiresAt: new Date(now.getTime() + 15 * 60_000), expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), createdAt: now, lastSeenAt: now, revokedAt: null };
      if (orm) await orm.insert(desktopSessions).values(row);
      else if (db) await db.query('INSERT INTO desktop_sessions (id,user_id,client_id,active_tenant_id,access_token_hash,refresh_token_hash,device_name,platform,app_version,access_expires_at,expires_at,created_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)', [id, userId, clientId, activeTenantId, row.accessTokenHash, row.refreshTokenHash, deviceName, platform, appVersion, row.accessExpiresAt, row.expiresAt, now]);
      else desktop.set(id, row);
      return { id, accessToken, refreshToken, expiresIn: 900, refreshExpiresAt: row.expiresAt };
    },
    async getDesktopSessionByAccessToken(token) {
      if (!token) return null;
      const hash = hashSecret(token);
      const now = new Date();
      let row;
      if (orm) row = (await orm.select().from(desktopSessions).where(and(eq(desktopSessions.accessTokenHash, hash), gt(desktopSessions.accessExpiresAt, now))).limit(1))[0];
      else if (db) row = (await db.query('SELECT id,user_id AS "userId",client_id AS "clientId",access_expires_at AS "accessExpiresAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM desktop_sessions WHERE access_token_hash = $1 AND access_expires_at > now() AND expires_at > now() AND revoked_at IS NULL', [hash])).rows[0];
      else row = [...desktop.values()].find(item => item.accessTokenHash === hash && item.accessExpiresAt > now && item.expiresAt > now && !item.revokedAt);
      if (!row || row.revokedAt) return null;
      return { id: row.id, userId: row.userId, activeTenantId: row.activeTenantId ?? null, desktop: true };
    },
    async revokeDesktopSession(refreshToken) {
      const hash = hashSecret(refreshToken || '');
      if (orm) { await orm.update(desktopSessions).set({ revokedAt: new Date() }).where(and(eq(desktopSessions.refreshTokenHash, hash), isNull(desktopSessions.revokedAt))); return; }
      if (db) { await db.query('UPDATE desktop_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [hash]); return; }
      const row = [...desktop.values()].find(item => item.refreshTokenHash === hash); if (row) row.revokedAt = new Date();
    },
    async getDesktopSessionByRefreshToken(refreshToken) {
      const hash = hashSecret(refreshToken || '');
      const now = new Date();
      if (orm) return (await orm.select().from(desktopSessions).where(and(eq(desktopSessions.refreshTokenHash, hash), gt(desktopSessions.expiresAt, now), isNull(desktopSessions.revokedAt))).limit(1))[0] ?? null;
      if (db) return (await db.query('SELECT id,user_id AS "userId",client_id AS "clientId",active_tenant_id AS "activeTenantId",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM desktop_sessions WHERE refresh_token_hash = $1 AND expires_at > now() AND revoked_at IS NULL', [hash])).rows[0] ?? null;
      return [...desktop.values()].find(item => item.refreshTokenHash === hash && item.expiresAt > now && !item.revokedAt) ?? null;
    },
    employees,
    async getTenantSettings(tenantId) {
      if (orm) return (await orm.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0]?.settings ?? defaultSettings;
      if (db) return (await db.query('SELECT settings FROM tenant_settings WHERE tenant_id = $1', [tenantId])).rows[0]?.settings ?? defaultSettings;
      return settings.get(tenantId) ?? structuredClone(defaultSettings);
    },
    async updateTenantSettings({ tenantId, actorUserId, patch }) {
      const previous = await this.getTenantSettings(tenantId);
      const next = { ...previous, ...patch, organization: { ...previous.organization, ...(patch.organization || {}) }, workday: { ...previous.workday, ...(patch.workday || {}) }, approvals: { ...previous.approvals, ...(patch.approvals || {}) }, retention: { ...previous.retention, ...(patch.retention || {}) }, identity: { ...previous.identity, ...(patch.identity || {}) } };
      if (orm) await orm.insert(tenantSettings).values({ tenantId, settings: next, updatedBy: actorUserId, updatedAt: new Date() }).onConflictDoUpdate({ target: tenantSettings.tenantId, set: { settings: next, updatedBy: actorUserId, updatedAt: new Date() } });
      else if (db) await db.query('INSERT INTO tenant_settings (tenant_id, settings, updated_by, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (tenant_id) DO UPDATE SET settings=$2, updated_by=$3, updated_at=now()', [tenantId, JSON.stringify(next), actorUserId]);
      else settings.set(tenantId, next);
      if (orm) await orm.insert(auditLog).values({ actorUserId, tenantId, action: 'tenant.settings.updated', targetType: 'tenant_settings', targetId: tenantId, metadata: { previous, next }, occurredAt: new Date() });
      return next;
    },
    authenticate(email, password) {
      const user = users.get(email?.toLowerCase());
      return user && user.password === password
        ? { ...user, password: undefined }
        : null;
    },
    async authenticateSecure(email, password) {
      if (orm) {
        const user = (await orm.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, passwordHash: usersTable.passwordHash, platformRole: usersTable.platformRole, status: usersTable.status }).from(usersTable).where(eq(usersTable.email, email?.toLowerCase())).limit(1))[0];
        if (!user || user.status !== 'active' || !(await verifyPassword(password, user.passwordHash))) return null;
        return { ...user, passwordHash: undefined };
      }
      if (db) {
        const result = await db.query(
          'SELECT id, name, email, password_hash AS "passwordHash", platform_role AS "platformRole", status FROM users WHERE lower(email) = lower($1)',
          [email],
        );
        const user = result.rows[0];
        if (
          !user ||
          user.status !== "active" ||
          !(await verifyPassword(password, user.passwordHash))
        )
          return null;
        return user;
      }
      const user = users.get(email?.toLowerCase());
      if (!user) return null;
      if (user.passwordHash)
        return (await verifyPassword(password, user.passwordHash))
          ? { ...user, passwordHash: undefined }
          : null;
      return user.password === password
        ? { ...user, password: undefined }
        : null;
    },
    async getUser(userId) {
      if (orm) return (await orm.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, platformRole: usersTable.platformRole, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0] ?? null;
      if (db)
        return (
          (
            await db.query(
              'SELECT id, name, email, platform_role AS "platformRole", status FROM users WHERE id = $1',
              [userId],
            )
          ).rows[0] ?? null
        );
      return [...users.values()].find((item) => item.id === userId) ?? null;
    },
    async updateUser(userId, { name, email }) {
      const normalizedEmail = email?.toLowerCase();
      if (orm) {
        const result = await orm.update(usersTable).set({ ...(name ? { name } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}) }).where(eq(usersTable.id, userId)).returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, platformRole: usersTable.platformRole, status: usersTable.status });
        return result[0] ?? null;
      }
      if (db) {
        const result = await db.query(
          'UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email), updated_at = now() WHERE id = $1 RETURNING id, name, email, platform_role AS "platformRole", status',
          [userId, name || null, normalizedEmail || null],
        );
        return result.rows[0] ?? null;
      }
      const user = [...users.values()].find((item) => item.id === userId);
      if (!user) return null;
      if (normalizedEmail && normalizedEmail !== user.email) {
        users.delete(user.email);
        user.email = normalizedEmail;
        users.set(normalizedEmail, user);
      }
      if (name) user.name = name;
      return { ...user, password: undefined, passwordHash: undefined };
    },
    async changePassword(userId, currentPassword, newPassword) {
      if (orm) {
        const current = (await orm.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0];
        if (!current || !(await verifyPassword(currentPassword, current.passwordHash))) return false;
        await orm.update(usersTable).set({ passwordHash: await hashPassword(newPassword) }).where(eq(usersTable.id, userId));
        return true;
      }
      if (db) {
        const result = await db.query(
          'SELECT password_hash AS "passwordHash" FROM users WHERE id = $1',
          [userId],
        );
        if (
          !result.rows[0] ||
          !(await verifyPassword(currentPassword, result.rows[0].passwordHash))
        )
          return false;
        await db.query(
          "UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1",
          [userId, await hashPassword(newPassword)],
        );
        return true;
      }
      const user = [...users.values()].find((item) => item.id === userId);
      if (!user) return false;
      const valid = user.passwordHash
        ? await verifyPassword(currentPassword, user.passwordHash)
        : user.password === currentPassword;
      if (!valid) return false;
      user.passwordHash = await hashPassword(newPassword);
      delete user.password;
      return true;
    },
    async createSession(userId, activeTenantId = null) {
      const token = sessionToken();
      const tokenHash = hashSecret(token);
      if (orm) { const now = new Date(); await orm.insert(sessionsTable).values({ id: tokenHash, userId, activeTenantId, expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000), createdAt: now, lastSeenAt: now }); return token; }
      if (db) {
        await db.query(
          "INSERT INTO sessions (id, user_id, active_tenant_id, expires_at) VALUES ($1, $2, $3, now() + interval '8 hours')",
          [tokenHash, userId, activeTenantId],
        );
        return token;
      }
      sessions.set(tokenHash, {
        userId,
        activeTenantId,
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      });
      return token;
    },
    async getSession(token) {
      if (!token) return null;
      const tokenHash = hashSecret(token);
      if (orm) {
        const current = (await orm.select({ id: sessionsTable.id, userId: sessionsTable.userId, activeTenantId: sessionsTable.activeTenantId, expiresAt: sessionsTable.expiresAt }).from(sessionsTable).where(and(eq(sessionsTable.id, tokenHash), gt(sessionsTable.expiresAt, new Date()))).limit(1))[0];
        if (current) return current;
        return (await orm.select({ id: sessionsTable.id, userId: sessionsTable.userId, activeTenantId: sessionsTable.activeTenantId, expiresAt: sessionsTable.expiresAt }).from(sessionsTable).where(and(eq(sessionsTable.id, token), gt(sessionsTable.expiresAt, new Date()))).limit(1))[0] ?? null;
      }
      if (db) {
        const result = await db.query('SELECT id, user_id AS "userId", active_tenant_id AS "activeTenantId", expires_at AS "expiresAt" FROM sessions WHERE id = $1 AND expires_at > now()', [tokenHash]);
        if (result.rows[0]) return result.rows[0];
        const legacy = await db.query('SELECT id, user_id AS "userId", active_tenant_id AS "activeTenantId", expires_at AS "expiresAt" FROM sessions WHERE id = $1 AND expires_at > now()', [token]);
        return legacy.rows[0] ?? null;
      }
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(tokenHash);
        return null;
      }
      return session;
    },
    async deleteSession(token) {
      if (!token) return;
      const tokenHash = hashSecret(token);
      if (orm) { await orm.delete(sessionsTable).where(inArray(sessionsTable.id, [tokenHash, token])); return; }
      if (db) {
        await db.query("DELETE FROM sessions WHERE id = ANY($1::text[])", [[tokenHash, token]]);
        return;
      }
      sessions.delete(tokenHash);
    },
    async getMembership(userId, tenantId) {
      if (orm) return (await orm.select({ userId: membershipsTable.userId, tenantId: membershipsTable.tenantId, role: membershipsTable.role, status: membershipsTable.status }).from(membershipsTable).where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.tenantId, tenantId))).limit(1))[0] ?? null;
      if (db)
        return (
          (
            await db.query(
              'SELECT user_id AS "userId", tenant_id AS "tenantId", role, status FROM memberships WHERE user_id = $1 AND tenant_id = $2',
              [userId, tenantId],
            )
          ).rows[0] ?? null
        );
      return memberships.get(`${userId}:${tenantId}`) ?? null;
    },
    async getEmployeeByUser(userId) {
      if (orm) return (await orm.select({ id: employeesTable.id, tenantId: employeesTable.tenantId, name: employeesTable.name, email: employeesTable.email }).from(employeesTable).where(eq(employeesTable.userId, userId)).limit(1))[0] ?? null;
      if (db)
        return (
          (
            await db.query(
              'SELECT id, tenant_id AS "tenantId", name, email FROM employees WHERE user_id = $1',
              [userId],
            )
          ).rows[0] ?? null
        );
      return (
        [...employees.values()].find(
          (item) => item.userId === userId || item.id === userId,
        ) ?? null
      );
    },
    async ensureEmployeeForUser(user) {
      const existing = await this.getEmployeeByUser(user.id);
      if (existing || !orm) return existing;
      const row = (await orm.insert(employeesTable).values({ id: user.id, userId: user.id, tenantId: user.tenantId, name: user.name, email: user.email }).onConflictDoNothing().returning({ id: employeesTable.id, tenantId: employeesTable.tenantId, name: employeesTable.name, email: employeesTable.email }))[0];
      return row || await this.getEmployeeByUser(user.id);
    },
    async firstMembership(userId) {
      if (orm) return (await orm.select({ tenantId: membershipsTable.tenantId }).from(membershipsTable).where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.status, "active"))).limit(1))[0] ?? null;
      if (db)
        return (
          (
            await db.query(
              "SELECT tenant_id AS \"tenantId\" FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1",
              [userId],
            )
          ).rows[0] ?? null
        );
      return (
        [...memberships.values()].find(
          (item) => item.userId === userId && item.status === "active",
        ) ?? null
      );
    },
    async addMembership({
      tenantId,
      name,
      email,
      password,
      role = "employee",
    }) {
      if (!["tenant_admin", "auditor", "employee"].includes(role)) {
        const error = new Error("Rol no válido");
        error.code = "INVALID_ROLE";
        throw error;
      }
      const normalizedEmail = email.toLowerCase();
      if (orm) {
        const userId = `user-${randomUUID()}`; const hash = await hashPassword(password);
        try { return await orm.transaction(async tx => { await tx.insert(usersTable).values({ id: userId, name, email: normalizedEmail, passwordHash: hash, status: 'active' }); await tx.insert(membershipsTable).values({ userId, tenantId, role, status: 'active' }); if (role === 'tenant_admin' || role === 'employee') await tx.insert(employeesTable).values({ id: userId, userId, tenantId, name, email: normalizedEmail }); return { user: { id: userId, name, email: normalizedEmail }, membership: { userId, tenantId, role, status: 'active' } }; }); } catch (error) { error.code = 'EMAIL_IN_USE'; throw error; }
      }
      if (db) {
        const userId = `user-${randomUUID()}`;
        const hash = await hashPassword(password);
        const transactional = typeof db.connect === "function";
        const client = transactional ? await db.connect() : db;
        try {
          if (transactional) await client.query("BEGIN");
          await client.query(
            "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
            [userId, name, normalizedEmail, hash],
          );
          await client.query(
            "INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)",
            [userId, tenantId, role],
          );
          if (role === "tenant_admin" || role === "employee") {
            await client.query(
              "INSERT INTO employees (id, user_id, tenant_id, name, email) VALUES ($1, $2, $3, $4, $5)",
              [userId, userId, tenantId, name, normalizedEmail],
            );
          }
          if (transactional) await client.query("COMMIT");
          return {
            user: { id: userId, name, email: normalizedEmail },
            membership: { userId, tenantId, role, status: "active" },
          };
        } catch (error) {
          if (transactional) await client.query("ROLLBACK");
          error.code = error.code === "23505" ? "EMAIL_IN_USE" : error.code;
          throw error;
        } finally {
          if (transactional) client.release();
        }
      }
      if (users.has(normalizedEmail)) {
        const error = new Error("El email ya está registrado");
        error.code = "EMAIL_IN_USE";
        throw error;
      }
      const user = {
        id: `user-${randomUUID()}`,
        name,
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        platformRole: null,
      };
      users.set(normalizedEmail, user);
      const membership = { userId: user.id, tenantId, role, status: "active" };
      memberships.set(`${user.id}:${tenantId}`, membership);
      return { user: { ...user, passwordHash: undefined }, membership };
    },
    async updateMembership({ tenantId, userId, actorUserId, name, email, role, status, password }) {
      if (role && !["tenant_admin", "auditor", "employee"].includes(role)) throw Object.assign(new Error("Rol no válido"), { code: "INVALID_ROLE" });
      if (status && !["active", "suspended"].includes(status)) throw Object.assign(new Error("Estado no válido"), { code: "INVALID_STATUS" });
      const normalizedEmail = email?.trim().toLowerCase() || null;
      const newHash = password ? await hashPassword(password) : null;
      if (orm) return orm.transaction(async tx => {
        const membership = (await tx.update(membershipsTable).set({ ...(role ? { role } : {}), ...(status ? { status } : {}) }).where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.tenantId, tenantId))).returning())[0];
        if (!membership) return null;
        const user = (await tx.update(usersTable).set({ ...(name ? { name } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}), ...(newHash ? { passwordHash: newHash } : {}) }).where(eq(usersTable.id, userId)).returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, platformRole: usersTable.platformRole, status: usersTable.status }))[0];
        if (role === "tenant_admin" || role === "employee") await tx.update(employeesTable).set({ ...(name ? { name } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}) }).where(and(eq(employeesTable.userId, userId), eq(employeesTable.tenantId, tenantId)));
        await tx.insert(auditLog).values({ actorUserId, tenantId, action: "membership.updated", targetType: "membership", targetId: userId, metadata: { role, status, fields: { name: Boolean(name), email: Boolean(normalizedEmail), password: Boolean(newHash) } }, occurredAt: new Date() });
        return { user, membership };
      });
      if (db) {
        const client = typeof db.connect === "function" ? await db.connect() : db;
        try {
          if (client !== db) await client.query("BEGIN");
          const memberResult = await client.query("UPDATE memberships SET role = COALESCE($3, role), status = COALESCE($4, status) WHERE user_id = $1 AND tenant_id = $2 RETURNING user_id AS \"userId\", tenant_id AS \"tenantId\", role, status", [userId, tenantId, role, status]);
          const member = memberResult.rows[0];
          if (!member) return null;
          const userResult = await client.query("UPDATE users SET name = COALESCE($2,name), email = COALESCE($3,email), password_hash = COALESCE($4,password_hash) WHERE id = $1 RETURNING id,name,email,platform_role AS \"platformRole\",status", [userId, name || null, normalizedEmail, newHash]);
          const user = userResult.rows[0];
          if (role === "tenant_admin" || role === "employee") await client.query("UPDATE employees SET name = COALESCE($3,name), email = COALESCE($4,email) WHERE user_id = $1 AND tenant_id = $2", [userId, tenantId, name || null, normalizedEmail]);
          await client.query("INSERT INTO audit_log (actor_user_id,tenant_id,action,target_type,target_id,metadata,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,now())", [actorUserId, tenantId, "membership.updated", "membership", userId, JSON.stringify({ role, status, fields: { name: Boolean(name), email: Boolean(normalizedEmail), password: Boolean(newHash) } })]);
          if (client !== db) await client.query("COMMIT");
          return { user, membership: member };
        } catch (error) { if (client !== db) await client.query("ROLLBACK"); throw error; } finally { if (client !== db) client.release(); }
      }
      const membership = memberships.get(`${userId}:${tenantId}`); if (!membership) return null; Object.assign(membership, { ...(role ? { role } : {}), ...(status ? { status } : {}) }); const user = [...users.values()].find(item => item.id === userId); if (user) { if (name) user.name = name; if (normalizedEmail) user.email = normalizedEmail; if (password) { user.passwordHash = newHash; delete user.password; } } const employee = [...employees.values()].find(item => item.userId === userId && item.tenantId === tenantId); if (employee && (role === "tenant_admin" || role === "employee" || !role)) Object.assign(employee, { ...(name ? { name } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}) }); return { user, membership };
    },
    async attendanceEmployees(tenantId) {
      if (orm) return orm.select({ id: employeesTable.id, tenantId: employeesTable.tenantId, name: employeesTable.name, email: employeesTable.email }).from(employeesTable).where(eq(employeesTable.tenantId, tenantId));
      if (db) return (await db.query('SELECT id, tenant_id AS "tenantId", name, email FROM employees WHERE tenant_id = $1', [tenantId])).rows;
      return [...employees.values()].filter(item => item.tenantId === tenantId);
    },
    async getOriginalAttendanceEvents(employeeId) {
      if (orm) return (await orm.select({ id: attendanceEventsTable.id, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }).from(attendanceEventsTable).where(eq(attendanceEventsTable.employeeId, employeeId)).orderBy(attendanceEventsTable.sequence)).map(isoEvent);
      if (db) return (await db.query('SELECT id, type, occurred_at AS "occurredAt", sequence FROM attendance_events WHERE employee_id = $1 ORDER BY sequence', [employeeId])).rows.map(isoEvent);
      return (events.get(employeeId) ?? []).map(isoEvent);
    },
    async attendanceRecords({ tenantId, employeeId }) {
      let members = await this.attendanceEmployees(tenantId);
      if (employeeId) {
        members = members.filter(item => item.id === employeeId);
        if (!members.length) throw Object.assign(new Error("Empleado no encontrado"), { code: "EMPLOYEE_NOT_FOUND", statusCode: 404 });
      }
      const requests = (await this.listChangeRequests(tenantId)).map(request => ({
        ...request,
        employeeId: request.employeeId ?? request.employee_id,
        eventId: request.eventId ?? request.event_id,
        originalTime: request.originalTime ?? request.original_time,
        proposedTime: request.proposedTime ?? request.proposed_time,
        reviewedAt: request.reviewedAt ?? request.reviewed_at,
        createdAt: request.createdAt ?? request.created_at,
      }));
      const rows = [];
      for (const employee of members) {
        const originalEvents = await this.getOriginalAttendanceEvents(employee.id);
        const employeeRequests = requests.filter(request => request.employeeId === employee.id);
        const originalGroups = groupAttendanceEvents(originalEvents);
        let effectiveEvents = originalEvents.map(event => ({ ...event }));
        const approved = employeeRequests.filter(request => request.status === "approved").sort((a, b) => new Date(a.reviewedAt ?? a.createdAt) - new Date(b.reviewedAt ?? b.createdAt));
        for (const request of approved) {
          if (["create_workday", "edit_workday"].includes(request.kind)) {
            if (!request.originalTime) continue;
            const date = attendanceDate(request.originalTime);
            const currentGroup = groupAttendanceEvents(effectiveEvents).get(date) ?? [];
            const replacedIds = new Set(currentGroup.map(event => event.id));
            effectiveEvents = effectiveEvents.filter(event => !replacedIds.has(event.id));
            const proposed = request.proposedEvents ?? request.proposal?.proposedEvents ?? request.proposal?.events ?? [];
            effectiveEvents.push(...proposed.map((event, index) => isoEvent({ ...event, id: event.id || `${request.id}:${index}`, derivedFromRequestId: request.id })));
          } else {
            effectiveEvents = applyApprovedAttendanceChanges(effectiveEvents, [request]).map(isoEvent);
          }
        }
        const effectiveGroups = groupAttendanceEvents(effectiveEvents);
        const dates = new Set([...originalGroups.keys(), ...effectiveGroups.keys()]);
        for (const request of employeeRequests) if (request.originalTime) dates.add(attendanceDate(request.originalTime));
        for (const date of dates) {
          const originals = originalGroups.get(date) ?? [];
          const effective = effectiveGroups.get(date) ?? [];
          const ids = new Set([...originals, ...effective].map(event => event.id));
          const related = employeeRequests.filter(request => { const wholeDayRequest = ["create_workday", "edit_workday", "delete_workday"].includes(request.kind); const affectedIds = [...(request.proposal?.affectedEventIds ?? []), ...(request.affectedEventIds ?? []), ...(request.proposal?.eventIds ?? []), ...(request.proposal?.affectedEvents ?? []).map(event => event.id)].filter(Boolean); return ids.has(request.eventId) || affectedIds.some(id => ids.has(id)) || (wholeDayRequest && request.originalTime && attendanceDate(request.originalTime) === date) || effective.some(event => event.derivedFromRequestId === request.id); });
          rows.push({ id: `${employee.id}:${date}`, date, employeeId: employee.id, employee, ...summarizeAttendance(effective, related), originalEvents: originals, effectiveEvents: effective, requests: related });
        }
      }
      return rows;
    },
    async listAttendanceRecords(input) {
      const { tenantId, from, to, employeeId, status, search, page, pageSize, sort, order } = validateAttendanceQuery(input);
      let rows = (await this.attendanceRecords({ tenantId, employeeId })).filter(row => (!from || row.date >= from) && (!to || row.date <= to) && (!status || row.status === status));
      if (search?.trim()) {
        const needle = search.trim().toLocaleLowerCase('es');
        rows = rows.filter(row => `${row.employee.name ?? ''} ${row.employee.email ?? ''}`.toLocaleLowerCase('es').includes(needle));
      }
      const value = row => ["employee", "employeeName"].includes(sort) ? row.employee.name : row[sort];
      rows.sort((a, b) => {
        const left = value(a) ?? "", right = value(b) ?? "";
        const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "es");
        return (order === "asc" ? result : -result) || a.date.localeCompare(b.date) || a.employee.id.localeCompare(b.employee.id);
      });
      const total = rows.length;
      rows = rows.slice((page - 1) * pageSize, page * pageSize).map(({ originalEvents, effectiveEvents, requests, breaks, ...row }) => row);
      return { rows, total, page, pageSize };
    },
    async getAttendanceRecord(input) {
      const { tenantId, employeeId, date } = validateAttendanceQuery(input);
      return (await this.attendanceRecords({ tenantId, employeeId })).find(row => row.date === date) ?? null;
    },
    async exportAttendanceCsv(tenantId = tenant.id) {
      if (orm) {
        const rows = await orm.select({ name: employeesTable.name, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }).from(attendanceEventsTable).innerJoin(employeesTable, eq(attendanceEventsTable.employeeId, employeesTable.id)).where(eq(employeesTable.tenantId, tenantId)).orderBy(attendanceEventsTable.occurredAt, attendanceEventsTable.sequence);
        const values = [['empleado', 'tipo', 'ocurrido_en', 'secuencia'], ...rows.map(row => [row.name, row.type, row.occurredAt, row.sequence])];
        return values.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
      }
      if (db) {
        const result = await db.query(
          'SELECT e.name, a.type, a.occurred_at AS "occurredAt", a.sequence FROM attendance_events a JOIN employees e ON e.id = a.employee_id WHERE e.tenant_id = $1 ORDER BY a.occurred_at, a.sequence',
          [tenantId],
        );
        const rows = [
          ["empleado", "tipo", "ocurrido_en", "secuencia"],
          ...result.rows.map((row) => [
            row.name,
            row.type,
            row.occurredAt,
            row.sequence,
          ]),
        ];
        return (
          rows
            .map((row) =>
              row
                .map(
                  (value) => `"${String(value ?? "").replaceAll('"', '""')}"`,
                )
                .join(","),
            )
            .join("\n") + "\n"
        );
      }
      const rows = [["empleado", "tipo", "ocurrido_en", "secuencia"]];
      for (const employee of employees.values())
        for (const event of events.get(employee.id) ?? [])
          rows.push([
            employee.name,
            event.type,
            event.occurredAt,
            event.sequence,
          ]);
      return (
        rows
          .map((row) =>
            row
              .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n") + "\n"
      );
    },
    async createChangeRequest(data) {
      // event_id es opcional para solicitudes de jornada completa. Nunca
      // permitimos que una cadena vacía llegue a una columna UUID.
      const eventId = typeof data.eventId === "string" && data.eventId.trim() ? data.eventId.trim() : null;
      if (orm) return (await orm.insert(attendanceChangeRequests).values({ tenantId: data.tenantId, employeeId: data.employeeId, requestedBy: data.requestedBy, kind: data.kind, eventId, originalTime: data.originalTime ? new Date(data.originalTime) : null, proposedTime: data.proposedTime ? new Date(data.proposedTime) : null, reason: data.reason, proposal: data.proposal || {}, status: "pending" }).returning())[0];
      if (db) {
        const result = await db.query(
          "INSERT INTO attendance_change_requests (tenant_id, employee_id, requested_by, kind, event_id, original_time, proposed_time, reason, proposal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            data.tenantId,
            data.employeeId,
            data.requestedBy,
            data.kind,
            eventId,
            data.originalTime || null,
            data.proposedTime || null,
            data.reason,
            JSON.stringify(data.proposal || {}),
          ],
        );
        return result.rows[0];
      }
      const request = {
        id: randomUUID(),
        ...data,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      changeRequests.set(request.id, request);
      return request;
    },
    async listChangeRequests(tenantId, status = null) {
      if (orm) {
        const rows = await orm.select().from(attendanceChangeRequests).where(status ? and(eq(attendanceChangeRequests.tenantId, tenantId), eq(attendanceChangeRequests.status, status)) : eq(attendanceChangeRequests.tenantId, tenantId)).orderBy(desc(attendanceChangeRequests.createdAt));
        return Promise.all(rows.map(async request => {
          const proposedAffected = request.proposal?.affectedEvents || [];
          const ids = persistedEventIds([request.eventId, ...(request.affectedEventIds || []), ...(request.proposal?.affectedEventIds || []), ...proposedAffected.map(event => event.id)]);
          if (!ids.length) return request;
          const affectedEvents = await orm.select({ id: attendanceEventsTable.id, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }).from(attendanceEventsTable).where(and(eq(attendanceEventsTable.employeeId, request.employeeId), inArray(attendanceEventsTable.id, ids)));
          const requester = request.requestedBy ? (await orm.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, request.requestedBy)).limit(1))[0] : null;
          const reviewer = request.reviewedBy ? (await orm.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, request.reviewedBy)).limit(1))[0] : null;
          return { ...request, eventType: affectedEvents.find(event => event.id === request.eventId)?.type, affectedEvents, requesterName: requester?.name, requesterEmail: requester?.email, reviewerName: reviewer?.name, reviewerEmail: reviewer?.email };
        }));
      }
      if (db) {
        const result = await db.query(
          `SELECT r.*, u.name AS requester_name, u.email AS requester_email FROM attendance_change_requests r JOIN users u ON u.id = r.requested_by WHERE r.tenant_id = $1 ${status ? "AND r.status = $2" : ""} ORDER BY r.created_at DESC`,
          status ? [tenantId, status] : [tenantId],
        );
        return result.rows;
      }
      return [...changeRequests.values()].filter(
        (item) =>
          item.tenantId === tenantId && (!status || item.status === status),
      );
    },
    async reviewChangeRequest(
      id,
      tenantId,
      reviewerId,
      status,
      comment = null,
    ) {
      if (orm) return orm.transaction(async tx => {
        const request = (await tx.update(attendanceChangeRequests).set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewComment: comment }).where(and(eq(attendanceChangeRequests.id, id), eq(attendanceChangeRequests.tenantId, tenantId), eq(attendanceChangeRequests.status, 'pending'))).returning())[0];
        if (!request) return null;
        if (status === 'approved' && (request.kind === 'create_workday' || request.kind === 'edit_workday')) {
          const events = request.proposal?.events || request.proposal?.proposedEvents || [];
          const projection = (await tx.insert(attendanceWorkdayProjections).values({ tenantId, employeeId: request.employeeId, workDate: new Date(request.originalTime), sourceRequestId: request.id, status: 'approved' }).returning({ id: attendanceWorkdayProjections.id }))[0];
          for (const [index, event] of events.entries()) await tx.insert(attendanceProjectionEvents).values({ projectionId: projection.id, position: index + 1, type: event.type, occurredAt: new Date(event.occurredAt), sourceEventId: sourceEventIdOrNull(event.id) });
        }
        return request;
      });
      if (db) {
        const client =
          typeof db.connect === "function" ? await db.connect() : db;
        try {
          if (typeof db.connect === "function") await client.query("BEGIN");
          const result = await client.query(
            "UPDATE attendance_change_requests SET status = $1, reviewed_by = $2, reviewed_at = now(), review_comment = $3 WHERE id = $4 AND tenant_id = $5 AND status = 'pending' RETURNING *",
            [status, reviewerId, comment, id, tenantId],
          );
          const request = result.rows[0];
          if (!request) {
            if (typeof db.connect === "function")
              await client.query("ROLLBACK");
            return null;
          }
          if (
            status === "approved" &&
            (request.kind === "create_workday" ||
              request.kind === "edit_workday")
          ) {
            const events =
              request.proposal?.events ||
              request.proposal?.proposedEvents ||
              [];
            const date =
              request.original_time?.toISOString?.().slice(0, 10) ||
              String(request.original_time).slice(0, 10);
            const projection = await client.query(
              "INSERT INTO attendance_workday_projections (tenant_id, employee_id, work_date, source_request_id) VALUES ($1,$2,$3,$4) ON CONFLICT (source_request_id) DO UPDATE SET status = 'approved' RETURNING id",
              [tenantId, request.employee_id, date, request.id],
            );
            for (const [index, event] of events.entries())
              await client.query(
                "INSERT INTO attendance_projection_events (projection_id, position, type, occurred_at) VALUES ($1,$2,$3,$4)",
                [
                  projection.rows[0].id,
                  index + 1,
                  event.type,
                  event.occurredAt,
                ],
              );
          }
          if (typeof db.connect === "function") await client.query("COMMIT");
          return request;
        } catch (error) {
          if (typeof db.connect === "function") await client.query("ROLLBACK");
          throw error;
        } finally {
          if (typeof db.connect === "function") client.release();
        }
      }
      const request = changeRequests.get(id);
      if (
        !request ||
        request.tenantId !== tenantId ||
        request.status !== "pending"
      )
        return null;
      Object.assign(request, {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
        reviewComment: comment,
      });
      return request;
    },
    async withdrawChangeRequest(id, tenantId, userId, reason) {
      if (orm) return (await orm.update(attendanceChangeRequests).set({ status: 'withdrawn', reviewComment: reason }).where(and(eq(attendanceChangeRequests.id, id), eq(attendanceChangeRequests.tenantId, tenantId), eq(attendanceChangeRequests.requestedBy, userId), eq(attendanceChangeRequests.status, 'pending'))).returning())[0] || null;
      if (db) {
        const result = await db.query(
          "UPDATE attendance_change_requests SET status = 'withdrawn', withdrawn_by = $1, withdrawn_at = now(), review_comment = $2 WHERE id = $3 AND tenant_id = $4 AND requested_by = $1 AND status = 'pending' RETURNING *",
          [userId, reason, id, tenantId],
        );
        return result.rows[0] || null;
      }
      const request = changeRequests.get(id);
      if (
        !request ||
        request.tenantId !== tenantId ||
        request.requestedBy !== userId ||
        request.status !== "pending"
      )
        return null;
      Object.assign(request, {
        status: "withdrawn",
        withdrawnBy: userId,
        withdrawnAt: new Date().toISOString(),
        withdrawalReason: reason,
      });
      return request;
    },
    async register({
      name,
      email,
      password,
      tenantName,
      slug,
      timeZone = "Europe/Madrid",
    }) {
      const normalizedEmail = email.toLowerCase();
      if (db) {
        const userId = `user-${randomUUID()}`;
        const tenantId = `tenant-${randomUUID()}`;
        const hash = await hashPassword(password);
        const transactional = typeof db.connect === "function";
        const client = transactional ? await db.connect() : db;
        try {
          if (transactional) await client.query("BEGIN");
          await client.query(
            "INSERT INTO tenants (id, name, slug, time_zone) VALUES ($1, $2, $3, $4)",
            [tenantId, tenantName, slug, timeZone],
          );
          await client.query(
            "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
            [userId, name, normalizedEmail, hash],
          );
          await client.query(
            "INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'tenant_admin')",
            [userId, tenantId],
          );
          await client.query(
            "INSERT INTO employees (id, user_id, tenant_id, name, email) VALUES ($1, $2, $3, $4, $5)",
            [userId, userId, tenantId, name, normalizedEmail],
          );
          if (transactional) await client.query("COMMIT");
          return {
            user: { id: userId, name, email: normalizedEmail },
            tenant: {
              id: tenantId,
              name: tenantName,
              slug,
              timeZone,
              status: "active",
            },
            membership: {
              userId,
              tenantId,
              role: "tenant_admin",
              status: "active",
            },
          };
        } catch (error) {
          if (transactional) await client.query("ROLLBACK");
          error.code =
            error.code === "23505"
              ? error.constraint?.includes("slug")
                ? "SLUG_IN_USE"
                : "EMAIL_IN_USE"
              : error.code;
          throw error;
        } finally {
          if (transactional) client.release();
        }
      }
      if (users.has(normalizedEmail)) {
        const error = new Error("El email ya está registrado");
        error.code = "EMAIL_IN_USE";
        throw error;
      }
      if ([...tenants.values()].some((item) => item.slug === slug)) {
        const error = new Error(
          "El identificador de organización ya está en uso",
        );
        error.code = "SLUG_IN_USE";
        throw error;
      }
      const user = {
        id: `user-${randomUUID()}`,
        name,
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        platformRole: null,
      };
      const newTenant = {
        id: `tenant-${randomUUID()}`,
        name: tenantName,
        slug,
        timeZone,
        status: "active",
      };
      users.set(normalizedEmail, user);
      tenants.set(newTenant.id, newTenant);
      const membership = {
        userId: user.id,
        tenantId: newTenant.id,
        role: "tenant_admin",
        status: "active",
      };
      memberships.set(`${user.id}:${newTenant.id}`, membership);
      return {
        user: { ...user, password: undefined, passwordHash: undefined },
        tenant: newTenant,
        membership,
      };
    },
    async bootstrapPlatform({ name, email, password }) {
      if (
        [...users.values()].some(
          (user) => user.platformRole === "platform_admin",
        )
      ) {
        const error = new Error("El bootstrap de plataforma ya está cerrado");
        error.code = "BOOTSTRAP_CLOSED";
        throw error;
      }
      const user = {
        id: `platform-${randomUUID()}`,
        name,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        platformRole: "platform_admin",
      };
      users.set(user.email, user);
      return { ...user, passwordHash: undefined };
    },
    async getState(employeeId) {
      if (orm) return (await orm.select({ status: attendanceStates.status, revision: attendanceStates.revision }).from(attendanceStates).where(eq(attendanceStates.employeeId, employeeId)).limit(1))[0] ?? { status: "outside", revision: 0 };
      if (db) {
        const result = await db.query(
          "SELECT status, revision FROM attendance_states WHERE employee_id = $1",
          [employeeId],
        );
        return result.rows[0] ?? { status: "outside", revision: 0 };
      }
      return states.get(employeeId);
    },
    async getEvents(employeeId) {
      if (orm) {
        const events = await orm.select({ id: attendanceEventsTable.id, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }).from(attendanceEventsTable).where(eq(attendanceEventsTable.employeeId, employeeId)).orderBy(attendanceEventsTable.sequence);
        const requests = await orm.select({ kind: attendanceChangeRequests.kind, eventId: attendanceChangeRequests.eventId, proposedTime: attendanceChangeRequests.proposedTime, proposal: attendanceChangeRequests.proposal, status: attendanceChangeRequests.status }).from(attendanceChangeRequests).where(eq(attendanceChangeRequests.employeeId, employeeId));
        return applyApprovedAttendanceChanges(events, requests);
      }
      if (db) {
        const result = await db.query(
          'SELECT id, type, occurred_at AS "occurredAt", sequence FROM attendance_events WHERE employee_id = $1 ORDER BY sequence',
          [employeeId],
        );
        const changes = await db.query("SELECT kind, event_id AS \"eventId\", proposed_time AS \"proposedTime\", proposal, status FROM attendance_change_requests WHERE employee_id = $1", [employeeId]);
        return applyApprovedAttendanceChanges(result.rows, changes.rows);
      }
      return applyApprovedAttendanceChanges(events.get(employeeId) ?? [], [...changeRequests.values()].filter(request => request.employeeId === employeeId));
    },
    async record(employeeId, type, occurredAt, key) {
      if (orm) {
        return orm.transaction(async (tx) => {
          const duplicate = await tx.select({ id: attendanceEventsTable.id, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }).from(attendanceEventsTable).where(and(eq(attendanceEventsTable.employeeId, employeeId), eq(attendanceEventsTable.idempotencyKey, key))).limit(1);
          const current = (await tx.select({ status: attendanceStates.status, revision: attendanceStates.revision }).from(attendanceStates).where(eq(attendanceStates.employeeId, employeeId)).limit(1))[0] ?? { status: 'outside', revision: 0 };
          if (duplicate[0]) return { event: duplicate[0], state: current };
          const nextState = applyAttendanceEvent(current, { type, occurredAt }, []).status;
          const event = (await tx.insert(attendanceEventsTable).values({ employeeId, type, occurredAt: new Date(occurredAt), sequence: current.revision + 1, idempotencyKey: key }).returning({ id: attendanceEventsTable.id, type: attendanceEventsTable.type, occurredAt: attendanceEventsTable.occurredAt, sequence: attendanceEventsTable.sequence }))[0];
          const state = (await tx.insert(attendanceStates).values({ employeeId, status: nextState, revision: current.revision + 1, updatedAt: new Date() }).onConflictDoUpdate({ target: attendanceStates.employeeId, set: { status: nextState, revision: current.revision + 1, updatedAt: new Date() } }).returning({ status: attendanceStates.status, revision: attendanceStates.revision }))[0];
          return { event, state };
        });
      }
      if (db) {
        if (typeof db.connect !== "function") {
          const state = await db
            .query(
              "SELECT status, revision FROM attendance_states WHERE employee_id = $1",
              [employeeId],
            )
            .then(
              (result) => result.rows[0] ?? { status: "outside", revision: 0 },
            );
          const next = applyAttendanceEvent(
            state,
            { type, occurredAt },
            [],
          ).status;
          const event = await db
            .query(
              'INSERT INTO attendance_events (employee_id, type, occurred_at, sequence, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id, type, occurred_at AS "occurredAt", sequence',
              [employeeId, type, occurredAt, state.revision + 1, key],
            )
            .then((result) => result.rows[0]);
          const updated = await db
            .query(
              "INSERT INTO attendance_states (employee_id, status, revision) VALUES ($1, $2, $3) RETURNING status, revision",
              [employeeId, next, state.revision + 1],
            )
            .then(
              (result) =>
                result.rows[0] ?? {
                  status: next,
                  revision: state.revision + 1,
                },
            );
          return { event, state: updated };
        }
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          const stateResult = await client.query(
            "SELECT status, revision FROM attendance_states WHERE employee_id = $1 FOR UPDATE",
            [employeeId],
          );
          const state = stateResult.rows[0] ?? {
            status: "outside",
            revision: 0,
          };
          const nextState = applyAttendanceEvent(
            state,
            { type, occurredAt },
            [],
          ).status;
          const eventResult = await client.query(
            'INSERT INTO attendance_events (employee_id, type, occurred_at, sequence, idempotency_key) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (employee_id, idempotency_key) DO NOTHING RETURNING id, type, occurred_at AS "occurredAt", sequence',
            [employeeId, type, occurredAt, state.revision + 1, key],
          );
          if (!eventResult.rows[0]) {
            const existing = await client.query(
              'SELECT id, type, occurred_at AS "occurredAt", sequence FROM attendance_events WHERE employee_id = $1 AND idempotency_key = $2',
              [employeeId, key],
            );
            const current = await client.query(
              "SELECT status, revision FROM attendance_states WHERE employee_id = $1",
              [employeeId],
            );
            await client.query("COMMIT");
            return { event: existing.rows[0], state: current.rows[0] };
          }
          const updated = await client.query(
            "INSERT INTO attendance_states (employee_id, status, revision) VALUES ($1, $2, $3) ON CONFLICT (employee_id) DO UPDATE SET status = EXCLUDED.status, revision = EXCLUDED.revision RETURNING status, revision",
            [employeeId, nextState, state.revision + 1],
          );
          await client.query("COMMIT");
          return { event: eventResult.rows[0], state: updated.rows[0] };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      const idKey = `${employeeId}:${key}`;
      if (idempotency.has(idKey)) return idempotency.get(idKey);
      const state = states.get(employeeId);
      const next = applyAttendanceEvent(
        state,
        { id: randomUUID(), type, occurredAt },
        events.get(employeeId),
      );
      states.set(employeeId, { status: next.status, revision: next.revision });
      events.set(employeeId, next.events);
      const result = {
        event: next.events.at(-1),
        state: states.get(employeeId),
      };
      idempotency.set(idKey, result);
      return result;
    },
    async summary(tenantId = tenant.id) {
      if (db) {
        const result = await db.query(
          "SELECT e.id, e.name, e.email, COALESCE(s.status, 'outside') AS status, COALESCE(s.revision, 0) AS revision, CASE WHEN s.status IN ('working','on_break') AND s.updated_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid') THEN true ELSE false END AS \"openToday\" FROM employees e LEFT JOIN attendance_states s ON s.employee_id = e.id WHERE e.tenant_id = $1 ORDER BY e.name",
          [tenantId],
        );
        return result.rows;
      }
      return [...employees.values()].filter((item) => item.tenantId === tenantId).map((item) => ({
        ...item,
        ...states.get(item.id),
        workedMs: elapsedWorkMs(events.get(item.id) ?? []),
        openToday: ['working', 'on_break'].includes(states.get(item.id)?.status) && new Date(states.get(item.id)?.updatedAt || 0).toDateString() === new Date().toDateString(),
      }));
    },
  };
}
