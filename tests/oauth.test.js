import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { buildApp } from '../apps/backend/src/app.js';
import { createStore } from '../apps/backend/src/store.js';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

test('desktop OAuth authorization code uses PKCE and issues a bearer session', async t => {
  const store = createStore();
  const app = buildApp({ db: { query: async () => ({ rows: [{ version: '001_initial.sql' }] }) }, logger: false, store });
  t.after(() => app.close());
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'laia@plegat.local', password: 'plegat' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const { verifier, challenge } = pkce();
  const authorize = await app.inject({ method: 'GET', url: `/oauth/authorize?client_id=plegat-desktop&redirect_uri=${encodeURIComponent('plegat://oauth/callback')}&response_type=code&scope=openid%20profile%20email&state=abc&code_challenge=${challenge}&code_challenge_method=S256`, headers: { cookie } });
  assert.equal(authorize.statusCode, 302);
  const callback = new URL(authorize.headers.location);
  assert.equal(callback.protocol, 'plegat:');
  assert.equal(callback.searchParams.get('state'), 'abc');
  const invalidVerifier = await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'authorization_code', client_id: 'plegat-desktop', redirect_uri: 'plegat://oauth/callback', code: callback.searchParams.get('code'), code_verifier: 'wrong-verifier' } });
  assert.equal(invalidVerifier.statusCode, 400);
  const token = await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'authorization_code', client_id: 'plegat-desktop', redirect_uri: 'plegat://oauth/callback', code: callback.searchParams.get('code'), code_verifier: verifier, device_name: 'test', platform: 'linux' } });
  assert.equal(token.statusCode, 200);
  const tokens = token.json();
  assert.equal(tokens.token_type, 'Bearer');
  const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, 'laia@plegat.local');
  const reused = await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'authorization_code', client_id: 'plegat-desktop', redirect_uri: 'plegat://oauth/callback', code: callback.searchParams.get('code'), code_verifier: verifier } });
  assert.equal(reused.statusCode, 400);
  const rotated = await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'refresh_token', client_id: 'plegat-desktop', refresh_token: tokens.refresh_token } });
  assert.equal(rotated.statusCode, 200);
  const oldRefresh = await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'refresh_token', client_id: 'plegat-desktop', refresh_token: tokens.refresh_token } });
  assert.equal(oldRefresh.statusCode, 400);
});
