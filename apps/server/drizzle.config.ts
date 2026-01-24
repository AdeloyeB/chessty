import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_DIRECT or DATABASE_URL must be set for drizzle-kit');
}

export default defineConfig({
  schema: './src/drizzle/pg-schema.ts',
  out: './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
