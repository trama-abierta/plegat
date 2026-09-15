import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { databaseConfig, readSecret } from '../config.js';
const client = new pg.Client(databaseConfig());
const role = process.env.APP_DB_USER ?? 'plegat_app';
const password = readSecret('APP_DB_PASSWORD');
if (!/^[a-z][a-z0-9_]*$/.test(role) || !password) throw new Error('Valid APP_DB_USER and APP_DB_PASSWORD_FILE required');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(7253401)");
  await client.query("SET LOCAL standard_conforming_strings = on");
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  await client.query(`${exists.rowCount ? 'ALTER' : 'CREATE'} ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${literal(password)}`);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('../../migrations/', import.meta.url);
  for (const version of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(version, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [version]);
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== checksum) throw new Error(`Modified migration: ${version}`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
  }
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await client.query(`GRANT SELECT ON schema_migrations TO "${role}"`);
  await client.query('COMMIT');
  console.log('Migraciones aplicadas. El rol de aplicación solo puede consultar el estado del esquema.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
