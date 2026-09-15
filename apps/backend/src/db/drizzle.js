import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export const createDrizzle = pool => drizzle(pool, { schema });
