import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { databaseConfig } from '../config.js';
import { tenants, employees, attendanceStates } from './schema.js';

const pool = new pg.Pool(databaseConfig());
const db = drizzle(pool);
try {
  await db.insert(tenants).values({ id: 'demo-tenant', name: 'Demo Textil Mediterránea', slug: 'demo-textil-mediterranea', timeZone: 'Europe/Madrid', status: 'active', createdAt: new Date() }).onConflictDoNothing();
  await db.insert(employees).values({ id: 'demo-employee', userId: 'demo-tenant-admin', tenantId: 'demo-tenant', name: 'Laia Soler', email: 'laia@plegat.local' }).onConflictDoNothing();
  await db.insert(attendanceStates).values({ employeeId: 'demo-employee', status: 'outside', revision: 0, updatedAt: new Date() }).onConflictDoNothing();
  console.log('Seed idempotente aplicado.');
} finally { await pool.end(); }
