import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/backend/src/app.js';

test('registration provisions a tenant owner and session', async t => {
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { name: 'Ana', email: 'ana@example.test', password: 'una-contraseña-segura', tenantName: 'Fils Demo', slug: 'fils-demo' } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().membership.role, 'tenant_admin');
  assert.match(response.headers['set-cookie'], /HttpOnly/);
});

test('platform bootstrap is single use', async t => {
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false, store: undefined });
  t.after(() => app.close());
  const first = await app.inject({ method: 'POST', url: '/api/v1/auth/platform/bootstrap', payload: { name: 'Root', email: 'root@example.test', password: 'una-contraseña-segura' } });
  assert.equal(first.statusCode, 409);
});
