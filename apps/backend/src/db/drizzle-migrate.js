import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { databaseConfig } from '../config.js';

const pool = new pg.Pool(databaseConfig());
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log('Migraciones Drizzle aplicadas.');
} finally { await pool.end(); }
