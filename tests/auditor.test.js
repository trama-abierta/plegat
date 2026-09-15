import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/backend/src/app.js';

async function login(app, email, password) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  return { response, cookie: response.headers['set-cookie'].split(';')[0] };
}

test('auditor can export attendance report but cannot manage members', async t => {
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false });
  t.after(() => app.close());
  const { cookie } = await login(app, 'auditor@demo.plegat.local', 'plegat-auditor');
  const report = await app.inject({ method: 'GET', url: '/api/v1/tenants/demo-tenant/reports/attendance.csv', headers: { cookie } });
  assert.equal(report.statusCode, 200);
  assert.match(report.headers['content-type'], /text\/csv/);
  const members = await app.inject({ method: 'GET', url: '/api/v1/tenants/demo-tenant/members', headers: { cookie } });
  assert.equal(members.statusCode, 403);
});

test('tenant admin can create an auditor membership', async t => {
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false });
  t.after(() => app.close());
  const { cookie } = await login(app, 'admin@demo.plegat.local', 'plegat-admin');
  const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/demo-tenant/members', headers: { cookie }, payload: { name: 'Auditor externo', email: 'externo@example.test', password: 'contraseña-auditor-segura', role: 'auditor' } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().membership.role, 'auditor');
});
