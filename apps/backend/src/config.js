import { readFileSync } from 'node:fs';
export function readSecret(name, env = process.env) {
  return env[`${name}_FILE`] ? readFileSync(env[`${name}_FILE`], 'utf8').trim() : env[name];
}
export function databaseConfig(env = process.env) {
  return { host: env.PGHOST ?? '127.0.0.1', port: Number(env.PGPORT ?? 5432), database: env.PGDATABASE ?? 'plegat', user: env.PGUSER ?? 'plegat_app', password: readSecret('PGPASSWORD', env), max: 10, connectionTimeoutMillis: 3000 };
}
export function platformAdminConfig(env = process.env) {
  return { email: env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() || null, password: readSecret('PLATFORM_ADMIN_PASSWORD', env) || null, name: env.PLATFORM_ADMIN_NAME?.trim() || 'Plegat Platform Admin' };
}
