import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

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
