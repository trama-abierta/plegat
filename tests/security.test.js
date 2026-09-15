import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/backend/src/app.js';
import { createStore } from '../apps/backend/src/store.js';

test('limits repeated login failures by IP and normalized email', async t => {
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false, store: createStore() });
  t.after(() => app.close());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'LAIA@PLEGAT.LOCAL', password: 'incorrecta' }, remoteAddress: '198.51.100.20' });
    assert.equal(response.statusCode, 401);
  }
  const blocked = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'laia@plegat.local', password: 'plegat' }, remoteAddress: '198.51.100.20' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().code, 'LOGIN_RATE_LIMITED');
});

test('rejects cookie mutations without a trusted origin in production', async t => {
  const store = createStore();
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false, store, security: { production: true, allowedOrigins: ['https://app.plegat.test'] } });
  t.after(() => app.close());
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'laia@plegat.local', password: 'plegat' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const rejected = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
  assert.equal(rejected.statusCode, 403);
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: 'https://app.plegat.test' } });
  assert.equal(accepted.statusCode, 200);
});

test('web session cookies are opaque and only their hash is used in memory', async t => {
  const store = createStore();
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false, store });
  t.after(() => app.close());
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'laia@plegat.local', password: 'plegat' } });
  const token = login.headers['set-cookie'].split(';')[0].slice('plegat_session='.length);
  assert.ok(token.length >= 40);
  assert.equal(store.sessions.has(token), false);
  assert.equal((await store.getSession(token)).userId, 'demo-employee');
});
