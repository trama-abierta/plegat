import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const env = new URL('.env', root);
try {
  await access(env);
  console.log('.env existente; se conserva sin cambios.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const secretDir = new URL('secrets/', root);
  await mkdir(secretDir, { recursive: true, mode: 0o700 });
  for (const name of ['db-owner-password', 'db-app-password', 'session-secret']) {
    try {
      // El directorio es privado; los archivos montados deben poder leerse en Docker.
      await writeFile(new URL(name, secretDir), randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o644 });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const secretPath = name => fileURLToPath(new URL(name, secretDir));
  await writeFile(env, `# Solo desarrollo local; no subir al repositorio.
SITE_ADDRESS=http://localhost
PUBLIC_ORIGIN=http://localhost
HTTP_PORT=80
HTTPS_PORT=443
RELEASE_TAG=dev
POSTGRES_DB=plegat
POSTGRES_USER=plegat_owner
APP_DB_USER=plegat_app
DB_OWNER_PASSWORD_PATH=${secretPath('db-owner-password')}
DB_APP_PASSWORD_PATH=${secretPath('db-app-password')}
SESSION_SECRET_PATH=${secretPath('session-secret')}
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=plegat
PGUSER=plegat_app
PGPASSWORD_FILE=${secretPath('db-app-password')}
`, { flag: 'wx', mode: 0o600 });
  console.log('.env y secretos locales creados. PostgreSQL se configura por separado.');
}
