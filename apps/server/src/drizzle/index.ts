import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './pg-schema';
import * as anticheatSchema from './anticheat-schema';
import * as jurySchema from './jury-schema';
import * as settlementSchema from './settlement-schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

// Merge all schemas for the drizzle instance
const allSchemas = { ...schema, ...anticheatSchema, ...jurySchema, ...settlementSchema };

export const db = drizzle(pool, { schema: allSchemas });

export * from './pg-schema';
export * from './anticheat-schema';
export * from './jury-schema';
export * from './settlement-schema';
