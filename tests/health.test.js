import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/backend/src/app.js';
for (const [name, query, status] of [
  ['schema available', async () => ({ rows: [{ version: '001_initial.sql' }] }), 200],
  ['schema missing', async () => ({ rows: [] }), 503],
  ['database unavailable', async () => { throw new Error('password should never be exposed'); }, 503],
]) test(name, async t => {
  const app = buildApp({ db: { query }, logger: false });
  t.after(() => app.close());
  const ready = await app.inject('/api/v1/health/ready');
  assert.equal(ready.statusCode, status);
  assert.deepEqual(ready.json(), { status: status === 200 ? 'ok' : 'unavailable' });
  assert.equal((await app.inject('/api/v1/health/live')).statusCode, 200);
});
