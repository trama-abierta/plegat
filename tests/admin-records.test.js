import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/backend/src/app.js";
import { createStore, persistedEventIds } from "../apps/backend/src/store.js";

test("ignores draft event ids when building persisted event lookups", () => {
  assert.deepEqual(persistedEventIds([
    "draft-157cb2b7-0b75-4f83-98bc-af5c9f2be5dd",
    "a5855ea2-2850-4506-a6fa-9a18cdda0eb5",
  ]), ["a5855ea2-2850-4506-a6fa-9a18cdda0eb5"]);
});

async function login(app, email, password) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  return response.headers["set-cookie"].split(";")[0];
}

async function closedWorkday(store, employeeId, date, suffix) {
  await store.record(employeeId, "clock_in", `${date}T08:00:00.000Z`, `${suffix}-in`);
  return store.record(employeeId, "clock_out", `${date}T16:00:00.000Z`, `${suffix}-out`);
}

test("lists tenant workdays with status filtering and stable pagination", async () => {
  const store = createStore();
  await closedWorkday(store, "demo-employee", "2026-09-08", "first");
  await closedWorkday(store, "demo-employee-2", "2026-09-09", "second");
  store.tenants.set("other-tenant", { id: "other-tenant", name: "Other", timeZone: "Europe/Madrid" });
  store.employees.set("other-employee", { id: "other-employee", tenantId: "other-tenant", name: "Other Employee", email: "other@example.test" });

  const firstPage = await store.listAttendanceRecords({
    tenantId: "demo-tenant",
    status: "closed",
    page: 1,
    pageSize: 1,
    sort: "date",
    order: "asc",
  });

  assert.deepEqual({ total: firstPage.total, page: firstPage.page, pageSize: firstPage.pageSize }, { total: 2, page: 1, pageSize: 1 });
  assert.equal(firstPage.rows.length, 1);
  assert.equal(firstPage.rows[0].date, "2026-09-08");
  assert.equal(firstPage.rows[0].employee.id, "demo-employee");
  assert.equal(firstPage.rows[0].status, "closed");
  assert.equal(firstPage.rows[0].workedMs, 8 * 60 * 60 * 1000);
  assert.ok(firstPage.rows.every(row => row.employee.id !== "other-employee"));
});

test("detail preserves original events and applies an approved correction", async () => {
  const store = createStore();
  const result = await closedWorkday(store, "demo-employee", "2026-09-10", "corrected");
  const request = await store.createChangeRequest({
    tenantId: "demo-tenant",
    employeeId: "demo-employee",
    requestedBy: "demo-employee",
    kind: "modify",
    eventId: result.event.id,
    originalTime: "2026-09-10T16:00:00.000Z",
    proposedTime: "2026-09-10T17:00:00.000Z",
    reason: "Salida real",
  });
  await store.reviewChangeRequest(request.id, "demo-tenant", "demo-tenant-admin", "approved", "Comprobado");

  const detail = await store.getAttendanceRecord({
    tenantId: "demo-tenant",
    employeeId: "demo-employee",
    date: "2026-09-10",
  });

  assert.equal(detail.originalEvents.at(-1).occurredAt, "2026-09-10T16:00:00.000Z");
  assert.equal(detail.effectiveEvents.at(-1).occurredAt, "2026-09-10T17:00:00.000Z");
  assert.equal(detail.workedMs, 9 * 60 * 60 * 1000);
  assert.equal(detail.status, "closed");
  assert.equal(detail.requests.length, 1);
  assert.equal(detail.requests[0].status, "approved");
  assert.deepEqual(detail.breaks, []);
});

test("admin attendance endpoints enforce tenant roles and validate query input", async t => {
  const store = createStore();
  await closedWorkday(store, "demo-employee", "2026-09-11", "route");
  const app = buildApp({
    db: { query: async () => ({ rows: [{ version: "001_initial.sql" }] }) },
    logger: false,
    store,
  });
  t.after(() => app.close());
  const adminCookie = await login(app, "admin@demo.plegat.local", "plegat-admin");
  const auditorCookie = await login(app, "auditor@demo.plegat.local", "plegat-auditor");
  const employeeCookie = await login(app, "laia@plegat.local", "plegat");

  const list = await app.inject({ method: "GET", url: "/api/v1/tenants/demo-tenant/attendance?page=1&pageSize=20&sort=date&order=desc", headers: { cookie: auditorCookie } });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().rows[0].date, "2026-09-11");

  const detail = await app.inject({ method: "GET", url: "/api/v1/tenants/demo-tenant/attendance/demo-employee/2026-09-11", headers: { cookie: adminCookie } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().employee.id, "demo-employee");

  const forbidden = await app.inject({ method: "GET", url: "/api/v1/tenants/demo-tenant/attendance", headers: { cookie: employeeCookie } });
  assert.equal(forbidden.statusCode, 403);
  const wrongTenant = await app.inject({ method: "GET", url: "/api/v1/tenants/other-tenant/attendance", headers: { cookie: adminCookie } });
  assert.equal(wrongTenant.statusCode, 403);

  for (const url of [
    "/api/v1/tenants/demo-tenant/attendance?from=2026-02-30",
    "/api/v1/tenants/demo-tenant/attendance?page=0",
    "/api/v1/tenants/demo-tenant/attendance?pageSize=101",
    "/api/v1/tenants/demo-tenant/attendance?sort=secret",
    "/api/v1/tenants/demo-tenant/attendance?order=sideways",
  ]) {
    const response = await app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().code, "INVALID_ATTENDANCE_QUERY", url);
  }

  const unknownEmployee = await app.inject({ method: "GET", url: "/api/v1/tenants/demo-tenant/attendance?employeeId=missing", headers: { cookie: adminCookie } });
  assert.equal(unknownEmployee.statusCode, 404);
  assert.equal(unknownEmployee.json().code, "EMPLOYEE_NOT_FOUND");
});
