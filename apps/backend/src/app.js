import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { healthSchema } from "@plegat/schemas";
import { createStore } from "./store.js";
import { oauthError, verifyPkce } from "./modules/oauth.js";
const sessionCookie = (token) =>
  `plegat_session=${token}; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const readSessionCookie = (request) =>
  request.headers.cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("plegat_session="))
    ?.slice("plegat_session=".length);
const readBearer = (request) => {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
};
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const originFromRequest = request => {
  const candidate = request.headers.origin || request.headers.referer;
  if (!candidate) return null;
  try { return new URL(candidate).origin; } catch { return null; }
};
export function buildApp({ db, logger = true, store = createStore(), security = {} }) {
  const app = Fastify({ logger, bodyLimit: 65536 });
  const loginFailures = new Map();
  const loginWindowMs = Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000);
  const loginMaxFailures = Number(process.env.LOGIN_RATE_MAX_FAILURES || 5);
  const production = security.production ?? process.env.NODE_ENV === "production";
  const frontendOrigin = process.env.FRONTEND_ORIGIN || (production ? process.env.PUBLIC_ORIGIN : "http://127.0.0.1:5173");
  const allowedOrigins = () => security.allowedOrigins ?? [
    process.env.PUBLIC_ORIGIN,
    frontendOrigin,
    production ? null : "http://localhost:5173",
    production ? null : "http://127.0.0.1:5173",
    production ? null : "http://localhost:1420",
    production ? null : "http://127.0.0.1:1420",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
  ].filter(Boolean);
  // The desktop client is a separate web origin. Explicitly allow its
  // development and production origins so OAuth token exchange and API calls
  // are not hidden by the WebView's CORS enforcement.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins().includes(origin)) return;
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Headers", "authorization, content-type, idempotency-key, x-csrf-token");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") return reply.code(204).send();
  });
  app.addHook("preHandler", async (request, reply) => {
    if (!unsafeMethods.has(request.method) || !readSessionCookie(request) || readBearer(request) || request.url.startsWith("/api/v1/auth/login") || request.url.startsWith("/api/v1/auth/register")) return;
    const origin = originFromRequest(request);
    if ((!origin && production) || (origin && !allowedOrigins().includes(origin))) return reply.code(403).send({ code: "CSRF_ORIGIN_REJECTED", message: "Origen no permitido" });
  });
  const principal = async (request) => {
    const desktopSession = await store.getDesktopSessionByAccessToken(readBearer(request));
    const session = desktopSession || await store.getSession(readSessionCookie(request));
    if (!session) return null;
    const user = await store.getUser(session.userId);
    return user ? { user, session, desktop: Boolean(desktopSession) } : null;
  };
  const requirePlatformAdmin = async (request, reply) => {
    const current = await principal(request);
    if (!current) {
      reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Sesión no válida" });
      return null;
    }
    if (current.user.platformRole !== "platform_admin") {
      reply.code(403).send({
        code: "FORBIDDEN",
        message: "Se requiere administración de plataforma",
      });
      return null;
    }
    return current;
  };
  const requireTenantRole = async (request, reply, roles) => {
    const current = await principal(request);
    if (!current) {
      reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Sesión no válida" });
      return null;
    }
    const tenantId = current.session.activeTenantId;
    const membership = await store.getMembership(current.user.id, tenantId);
    if (!membership || !roles.includes(membership.role)) {
      reply.code(403).send({
        code: "FORBIDDEN",
        message: "No tienes permisos para esta operación",
      });
      return null;
    }
    return { ...current, tenantId, membership };
  };
  app.get(
    "/api/v1/health/live",
    { schema: { response: { 200: healthSchema } } },
    async () => ({ status: "ok" }),
  );
  app.get(
    "/api/v1/health/ready",
    { schema: { response: { 200: healthSchema, 503: healthSchema } } },
    async (_request, reply) => {
      try {
        await db
          .query(
            "SELECT version FROM schema_migrations WHERE version = '001_initial.sql'",
          )
          .then((result) => {
            if (!result.rows.length) throw new Error("Schema missing");
          });
        return { status: "ok" };
      } catch {
        return reply.code(503).send({ status: "unavailable" });
      }
    },
  );
  app.post("/api/v1/auth/login", async (request, reply) => {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const keys = [`${request.ip}:${email}`, `email:${email}`];
    const now = Date.now();
    for (const key of keys) {
      const previous = loginFailures.get(key);
      if (previous && previous.resetAt > now && previous.count >= loginMaxFailures) {
        reply.header("retry-after", String(Math.ceil((previous.resetAt - now) / 1000)));
        return reply.code(429).send({ code: "LOGIN_RATE_LIMITED", message: "Demasiados intentos. Inténtalo más tarde." });
      }
    }
    const user = await store.authenticateSecure(
      email,
      request.body?.password,
    );
    if (!user) {
      for (const key of keys) {
        const previous = loginFailures.get(key);
        const current = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + loginWindowMs };
        current.count += 1;
        loginFailures.set(key, current);
      }
      if (loginFailures.size > 10_000) for (const [key, item] of loginFailures) if (item.resetAt <= now) loginFailures.delete(key);
      return reply.code(401).send({
        code: "INVALID_CREDENTIALS",
        message: "Email o contraseña incorrectos",
      });
    }
    for (const key of keys) loginFailures.delete(key);
    const firstMembership = await store.firstMembership(user.id);
    const token = await store.createSession(
      user.id,
      user.tenantId ?? firstMembership?.tenantId ?? store.tenant.id,
    );
    reply.header("set-cookie", sessionCookie(token));
    return { user, tenant: store.tenant };
  });
  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = request.body ?? {};
    if (
      !body.name ||
      !body.email ||
      !body.password ||
      !body.tenantName ||
      !body.slug
    )
      return reply.code(400).send({
        code: "INVALID_REGISTRATION",
        message:
          "Nombre, email, contraseña, organización y slug son obligatorios",
      });
    try {
      const result = await store.register(body);
      const token = await store.createSession(result.user.id, result.tenant.id);
      reply.header("set-cookie", sessionCookie(token));
      return reply.code(201).send(result);
    } catch (error) {
      return reply
        .code(
          error.code === "EMAIL_IN_USE" || error.code === "SLUG_IN_USE"
            ? 409
            : 400,
        )
        .send({
          code: error.code ?? "REGISTRATION_FAILED",
          message: error.message,
        });
    }
  });
  app.post("/api/v1/auth/platform/bootstrap", async (request, reply) => {
    try {
      const user = await store.bootstrapPlatform(request.body ?? {});
      const token = await store.createSession(user.id);
      reply.header("set-cookie", sessionCookie(token));
      return reply.code(201).send({ user });
    } catch (error) {
      return reply.code(error.code === "BOOTSTRAP_CLOSED" ? 409 : 400).send({
        code: error.code ?? "BOOTSTRAP_FAILED",
        message: error.message,
      });
    }
  });
  app.get("/oauth/authorize", async (request, reply) => {
    const query = request.query ?? {};
    const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType, scope = "openid profile email", state, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod = "S256", desktop_hint: desktopHint } = query;
    const client = await store.getOAuthClient(clientId);
    if (!client || client.status !== "active" || client.type !== "public" || responseType !== "code" || !client.redirectUris?.includes(redirectUri) || !codeChallenge || codeChallengeMethod !== "S256") return reply.code(400).send(oauthError("invalid_request", "Solicitud OAuth no válida"));
    const current = await principal(request);
    if (!current) {
      const returnTo = request.raw.url;
      return reply.redirect(`${frontendOrigin}/login?oauth_return=${encodeURIComponent(returnTo)}`);
    }
    const requestedScopes = String(scope).split(/\s+/).filter(Boolean);
    if (requestedScopes.some(item => !client.allowedScopes?.includes(item))) return reply.code(400).send(oauthError("invalid_scope", "Scope no permitido"));
    const code = await store.createAuthorizationCode({ clientId, userId: current.user.id, redirectUri, scope: requestedScopes.join(" "), codeChallenge, codeChallengeMethod, state });
    const location = new URL(redirectUri);
    location.searchParams.set("code", code);
    if (state) location.searchParams.set("state", state);
    if (desktopHint === "1" && !production) {
      const callback = location.toString();
      const escapedCallback = callback.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
      return reply.type("text/html; charset=utf-8").send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plegat · Inicio completado</title><style>body{font-family:system-ui,sans-serif;background:#f3f1e7;color:#203c34;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:30rem;background:#fffdf8;border:1px solid #d7ddcf;border-radius:18px;padding:2rem;box-shadow:0 10px 30px #203c3414}h1{margin:.5rem 0}p{color:#61756c}.code{font: .8rem ui-monospace,monospace;word-break:break-all;background:#f3f1e7;border-radius:8px;padding:.75rem;color:#687a70}a{display:inline-block;margin-top:1rem;background:#203c34;color:#fffdf8;padding:.7rem 1rem;border-radius:8px;text-decoration:none}</style><main class="card"><small>PLEGAT · AUTORIZACIÓN</small><h1>Gracias, ya puedes volver a Plegat.</h1><p>Esta ventana puede cerrarse. La aplicación de escritorio continuará automáticamente.</p><a href="${escapedCallback}">Volver a la aplicación</a><p><small>Código OAuth de desarrollo</small></p><div class="code">${code}</div><script>setTimeout(()=>{location.href=${JSON.stringify(callback)}},350)</script></main></html>`);
    }
    return reply.redirect(location.toString());
  });
  app.post("/oauth/token", async (request, reply) => {
    const body = request.body ?? {};
    const client = await store.getOAuthClient(body.client_id);
    if (!client || client.status !== "active" || client.type !== "public") return reply.code(401).send(oauthError("invalid_client", "Cliente OAuth no válido"));
    if (body.grant_type === "authorization_code") {
      const pendingCode = await store.getAuthorizationCode(body.code);
      if (!pendingCode || pendingCode.clientId !== client.id || pendingCode.redirectUri !== body.redirect_uri || !verifyPkce(body.code_verifier, pendingCode.codeChallenge, pendingCode.codeChallengeMethod)) return reply.code(400).send(oauthError("invalid_grant", "Código o PKCE no válidos"));
      const code = await store.consumeAuthorizationCode(body.code);
      if (!code) return reply.code(400).send(oauthError("invalid_grant", "El código ya fue utilizado"));
      const membership = await store.firstMembership(code.userId);
      const session = await store.createDesktopSession({ userId: code.userId, clientId: client.id, activeTenantId: membership?.tenantId ?? null, deviceName: body.device_name, platform: body.platform, appVersion: body.app_version });
      return { token_type: "Bearer", access_token: session.accessToken, refresh_token: session.refreshToken, expires_in: session.expiresIn };
    }
    if (body.grant_type === "refresh_token") {
      const previous = await store.getDesktopSessionByRefreshToken(body.refresh_token);
      if (!previous || previous.clientId !== client.id) return reply.code(400).send(oauthError("invalid_grant", "Refresh token no válido"));
      await store.revokeDesktopSession(body.refresh_token);
      const session = await store.createDesktopSession({ userId: previous.userId, clientId: client.id, activeTenantId: previous.activeTenantId, deviceName: body.device_name, platform: body.platform, appVersion: body.app_version });
      return { token_type: "Bearer", access_token: session.accessToken, refresh_token: session.refreshToken, expires_in: session.expiresIn };
    }
    return reply.code(400).send(oauthError("unsupported_grant_type", "Grant no compatible"));
  });
  app.post("/oauth/revoke", async (request) => {
    await store.revokeDesktopSession(request.body?.token);
    return { ok: true };
  });
  app.get("/api/v1/me", async (request, reply) => {
    const current = await principal(request);
    if (!current)
      return reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Sesión no válida" });
    const { user, session } = current;
    const tenant = db
      ? ((
          await db.query(
            'SELECT id, name, slug, time_zone AS "timeZone", status FROM tenants WHERE id = $1',
            [session.activeTenantId],
          )
        ).rows[0] ?? null)
      : (store.tenants.get(session.activeTenantId) ?? null);
    const tenantSettings = tenant ? await store.getTenantSettings(tenant.id) : null;
    const visibleTenant = tenant ? { ...tenant, name: tenantSettings?.organization?.legalName?.trim() || tenant.name } : tenant;
    return {
      user: { ...user, password: undefined, passwordHash: undefined },
      tenant: visibleTenant,
      membership: visibleTenant ? await store.getMembership(user.id, visibleTenant.id) : null,
      employee: visibleTenant ? await store.getEmployeeByUser(user.id) : null,
    };
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    await store.deleteSession(readSessionCookie(request));
    reply.header(
      "set-cookie",
      `plegat_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return { ok: true };
  });
  app.post("/logout", async (request, reply) => {
    await store.deleteSession(readSessionCookie(request));
    reply.header(
      "set-cookie",
      `plegat_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return { ok: true };
  });
  app.patch("/api/v1/me/profile", async (request, reply) => {
    const current = await principal(request);
    if (!current)
      return reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Sesión no válida" });
    const body = request.body ?? {};
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email))
      return reply
        .code(400)
        .send({ code: "INVALID_EMAIL", message: "Email no válido" });
    try {
      const user = await store.updateUser(current.user.id, body);
      return { user };
    } catch (error) {
      return reply.code(error.code === "23505" ? 409 : 400).send({
        code: "PROFILE_UPDATE_FAILED",
        message: "No se pudo actualizar el perfil",
      });
    }
  });
  app.patch("/api/v1/me/password", async (request, reply) => {
    const current = await principal(request);
    if (!current)
      return reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Sesión no válida" });
    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || !newPassword || newPassword.length < 12)
      return reply.code(400).send({
        code: "INVALID_PASSWORD",
        message: "La nueva contraseña debe tener al menos 12 caracteres",
      });
    const changed = await store.changePassword(
      current.user.id,
      currentPassword,
      newPassword,
    );
    if (!changed)
      return reply.code(400).send({
        code: "INVALID_PASSWORD",
        message: "La contraseña actual no es correcta",
      });
    return { ok: true, message: "Contraseña actualizada." };
  });
  app.get("/api/v1/platform/tenants", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    return {
      tenants: [...store.tenants.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  });
  app.post("/api/v1/platform/tenants", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const body = request.body ?? {};
    if (!body.name || !body.slug)
      return reply.code(400).send({
        code: "INVALID_TENANT",
        message: "Nombre y slug son obligatorios",
      });
    try {
      const result = await store.register({
        name: "Tenant admin",
        email: `admin+${body.slug}@plegat.local`,
        password: `provisioned-${randomUUID()}`,
        tenantName: body.name,
        slug: body.slug,
        timeZone: body.timeZone,
      });
      return reply.code(201).send({ tenant: result.tenant });
    } catch (error) {
      return reply.code(error.code === "SLUG_IN_USE" ? 409 : 400).send({
        code: error.code ?? "TENANT_CREATE_FAILED",
        message: error.message,
      });
    }
  });
  app.patch("/api/v1/platform/tenants/:tenantId", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const tenant = store.tenants.get(request.params.tenantId);
    if (!tenant)
      return reply.code(404).send({
        code: "TENANT_NOT_FOUND",
        message: "Organización no encontrada",
      });
    if (
      request.body?.status &&
      !["active", "suspended"].includes(request.body.status)
    )
      return reply
        .code(400)
        .send({ code: "INVALID_STATUS", message: "Estado no válido" });
    Object.assign(tenant, {
      status: request.body?.status ?? tenant.status,
      name: request.body?.name ?? tenant.name,
    });
    return { tenant };
  });
  app.get("/api/v1/tenants/:tenantId/members", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin"]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    const members = db
      ? (
          await db.query(
            'SELECT m.user_id AS "userId", m.tenant_id AS "tenantId", m.role, m.status, u.name, u.email, e.id AS "employeeId", e.name AS "employeeName", e.email AS "employeeEmail" FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN employees e ON e.user_id = m.user_id AND e.tenant_id = m.tenant_id WHERE m.tenant_id = $1 ORDER BY u.name',
            [current.tenantId],
          )
        ).rows.map((item) => ({
          userId: item.userId,
          tenantId: item.tenantId,
          role: item.role,
          status: item.status,
          user: { id: item.userId, name: item.name, email: item.email },
          employee: item.employeeId && item.role !== 'auditor' ? { id: item.employeeId, name: item.employeeName, email: item.employeeEmail } : null,
        }))
      : [...store.memberships.values()]
          .filter((item) => item.tenantId === current.tenantId)
          .map((item) => ({
            ...item,
            user: [...store.users.values()].find(
              (user) => user.id === item.userId,
            ),
            employee: item.role === 'auditor' ? null : [...store.employees.values()].find(
              (employee) => employee.userId === item.userId && employee.tenantId === current.tenantId,
            ) ?? null,
          }))
          .map((item) => ({
            ...item,
            user: {
              id: item.user.id,
              name: item.user.name,
              email: item.user.email,
            },
          }));
    return { members };
  });
  app.post("/api/v1/tenants/:tenantId/members", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin"]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    try {
      return reply.code(201).send(
        await store.addMembership({
          ...request.body,
          tenantId: current.tenantId,
        }),
      );
    } catch (error) {
      return reply.code(error.code === "EMAIL_IN_USE" ? 409 : 400).send({
        code: error.code ?? "MEMBER_CREATE_FAILED",
        message: error.message,
      });
    }
  });
  app.patch("/api/v1/tenants/:tenantId/members/:userId", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin"]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    try {
      const result = await store.updateMembership({ tenantId: current.tenantId, userId: request.params.userId, actorUserId: current.user.id, ...request.body });
      if (!result) return reply.code(404).send({ code: "MEMBER_NOT_FOUND" });
      return { ...result };
    } catch (error) { return reply.code(error.code === "23505" ? 409 : 400).send({ code: error.code ?? "MEMBER_UPDATE_FAILED", message: error.message }); }
  });
  const attendanceAccess = async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin", "auditor"]);
    if (!current) return null;
    if (current.tenantId !== request.params.tenantId || current.membership.status !== "active") {
      reply.code(403).send({ code: "FORBIDDEN", message: "No tienes permisos para esta organización" });
      return null;
    }
    return current;
  };
  const attendanceError = (error, reply) => {
    if (!["INVALID_ATTENDANCE_QUERY", "EMPLOYEE_NOT_FOUND"].includes(error.code)) throw error;
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  };
  app.get("/api/v1/tenants/:tenantId/attendance", async (request, reply) => {
    const current = await attendanceAccess(request, reply);
    if (!current) return;
    try {
      return await store.listAttendanceRecords({ ...request.query, tenantId: current.tenantId });
    } catch (error) { return attendanceError(error, reply); }
  });
  app.get("/api/v1/tenants/:tenantId/attendance/:employeeId/:date", async (request, reply) => {
    const current = await attendanceAccess(request, reply);
    if (!current) return;
    try {
      const record = await store.getAttendanceRecord({ tenantId: current.tenantId, employeeId: request.params.employeeId, date: request.params.date });
      if (!record) return reply.code(404).send({ code: "ATTENDANCE_NOT_FOUND", message: "Registro no encontrado" });
      return record;
    } catch (error) { return attendanceError(error, reply); }
  });
  app.get("/api/v1/tenants/:tenantId/corrections", async (request, reply) => {
    const current = await requireTenantRole(request, reply, [
      "tenant_admin",
      "auditor",
    ]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    return {
      requests: await store.listChangeRequests(
        current.tenantId,
        request.query?.status || null,
      ),
    };
  });
  app.get("/api/v1/me/corrections", async (request, reply) => {
    const current = await principal(request);
    if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    return {
      requests: await store.listChangeRequests(current.session.activeTenantId),
    };
  });
  app.post("/api/v1/me/corrections", async (request, reply) => {
    const current = await principal(request);
    if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const body = request.body || {};
    const employee = await store.ensureEmployeeForUser({ ...current.user, tenantId: current.session.activeTenantId });
    if (!employee || !body.kind || !body.reason)
      return reply.code(400).send({
        code: "INVALID_CORRECTION",
        message: "Empleado, tipo y motivo son obligatorios",
      });
    const created = await store.createChangeRequest({
      tenantId: employee.tenantId,
      employeeId: employee.id,
      requestedBy: current.user.id,
      ...body,
    });
    return reply.code(201).send({ request: created });
  });
  app.patch(
    "/api/v1/me/corrections/:requestId/withdraw",
    async (request, reply) => {
      const current = await principal(request);
      if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
      const result = await store.withdrawChangeRequest(
        request.params.requestId,
        current.session.activeTenantId,
        current.user.id,
        request.body?.reason || "Retirada por el usuario",
      );
      if (!result)
        return reply.code(404).send({ code: "CORRECTION_NOT_FOUND" });
      return { request: result };
    },
  );
  app.post("/api/v1/tenants/:tenantId/corrections", async (request, reply) => {
    const current = await requireTenantRole(request, reply, [
      "tenant_admin",
      "employee",
    ]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    const body = request.body || {};
    if (!body.kind || !body.reason)
      return reply.code(400).send({
        code: "INVALID_CORRECTION",
        message: "Tipo y motivo son obligatorios",
      });
    if (!body.employeeId)
      return reply.code(400).send({
        code: "EMPLOYEE_REQUIRED",
        message: "El empleado es obligatorio",
      });
    const created = await store.createChangeRequest({
      tenantId: current.tenantId,
      employeeId: body.employeeId,
      requestedBy: current.user.id,
      kind: body.kind,
      // Las jornadas completas no tienen un fichaje único asociado.
      eventId: typeof body.eventId === "string" && body.eventId.trim() ? body.eventId.trim() : null,
      originalTime: body.originalTime,
      proposedTime: body.proposedTime,
      reason: body.reason,
      proposal: body.proposal || {},
    });
    return reply.code(201).send({ request: created });
  });
  app.patch(
    "/api/v1/tenants/:tenantId/corrections/:requestId",
    async (request, reply) => {
      const current = await requireTenantRole(request, reply, ["tenant_admin"]);
      if (!current || current.tenantId !== request.params.tenantId) return;
      const status = request.body?.status;
      if (!["approved", "rejected"].includes(status))
        return reply.code(400).send({
          code: "INVALID_REVIEW",
          message: "Estado de revisión no válido",
        });
      const result = await store.reviewChangeRequest(
        request.params.requestId,
        current.tenantId,
        current.user.id,
        status,
        request.body?.comment || null,
      );
      if (!result)
        return reply.code(404).send({
          code: "CORRECTION_NOT_FOUND",
          message: "Solicitud no encontrada o ya revisada",
        });
      return { request: result };
    },
  );
  app.get(
    "/api/v1/tenants/:tenantId/reports/attendance.csv",
    async (request, reply) => {
      const current = await requireTenantRole(request, reply, [
        "tenant_admin",
        "auditor",
      ]);
      if (!current || current.tenantId !== request.params.tenantId) return;
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header(
        "content-disposition",
        `attachment; filename="plegat-${current.tenantId}-attendance.csv"`,
      );
      return store.exportAttendanceCsv(current.tenantId);
    },
  );
  app.get("/api/v1/me/state", async (request, reply) => {
    const current = await principal(request);
    if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const employee = await store.getEmployeeByUser(current.user.id);
    return reply.send(await store.getState(employee?.id || "demo-employee"));
  });
  app.get("/api/v1/me/attendance", async (request, reply) => {
    const current = await principal(request);
    if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const employee = await store.getEmployeeByUser(current.user.id);
    const employeeId = employee?.id || "demo-employee";
    return {
      events: await store.getEvents(employeeId),
      state: await store.getState(employeeId),
    };
  });
  app.post("/api/v1/me/events", async (request, reply) => {
    const current = await principal(request);
    if (!current) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const employee = await store.getEmployeeByUser(current.user.id);
    const employeeId = employee?.id || "demo-employee";
    const key = request.headers["idempotency-key"];
    if (!key)
      return reply.code(400).send({
        code: "IDEMPOTENCY_REQUIRED",
        message: "Falta Idempotency-Key",
      });
    try {
      return await store.record(
        employeeId,
        request.body?.type,
        new Date().toISOString(),
        key,
      );
    } catch (error) {
      return reply
        .code(error.code === "INVALID_TRANSITION" ? 409 : 400)
        .send({ code: error.code ?? "INVALID_EVENT", message: error.message });
    }
  });
  app.get("/api/v1/admin/summary", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin", "auditor"]);
    if (!current) return;
    const tenant = store.tenants.get(current.tenantId) || store.tenant;
    return { tenant, employees: await store.summary(current.tenantId) };
  });
  app.get("/api/v1/tenants/:tenantId/settings", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin", "auditor"]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    return { settings: await store.getTenantSettings(current.tenantId) };
  });
  app.patch("/api/v1/tenants/:tenantId/settings", async (request, reply) => {
    const current = await requireTenantRole(request, reply, ["tenant_admin"]);
    if (!current || current.tenantId !== request.params.tenantId) return;
    try { return { settings: await store.updateTenantSettings({ tenantId: current.tenantId, actorUserId: current.user.id, patch: request.body || {} }) }; }
    catch (error) { return reply.code(400).send({ code: "INVALID_SETTINGS", message: error.message }); }
  });
  return app;
}
