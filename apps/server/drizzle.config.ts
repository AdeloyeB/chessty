import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_DIRECT or DATABASE_URL must be set for drizzle-kit');
}

export default defineConfig({
  schema: ['./src/drizzle/pg-schema.ts', './src/drizzle/anticheat-schema.ts'],
  // Migrations output is gitignored - we use drizzle-kit push for deployments
  out: './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  // Strict mode prevents accidental data loss
  strict: true,
  // Verbose output for debugging
  verbose: true,
});
