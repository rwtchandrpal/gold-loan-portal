import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Deterministically load canonical root .env file
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDir, '..', '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const isProduction = process.env.NODE_ENV === 'production';
const directUrl = process.env.DIRECT_URL?.trim();

if (isProduction && !directUrl) {
  throw new Error(
    '[Prisma Config] DIRECT_URL is required in production for safe migration execution (direct unpooled connection). ' +
    'Do not run migrations through PgBouncer or transaction poolers.'
  );
}

const migrationUrl = directUrl || env('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
});
