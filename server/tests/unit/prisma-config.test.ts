import { describe, it, expect } from 'vitest';

function resolvePrismaMigrationUrl(env: {
  NODE_ENV?: string;
  DIRECT_URL?: string;
  DATABASE_URL?: string;
}): string {
  const isProduction = env.NODE_ENV === 'production';
  const directUrl = env.DIRECT_URL?.trim();

  if (isProduction && !directUrl) {
    throw new Error(
      '[Prisma Config] DIRECT_URL is required in production for safe migration execution (direct unpooled connection). ' +
      'Do not run migrations through PgBouncer or transaction poolers.'
    );
  }

  const migrationUrl = directUrl || env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error('[Prisma Config] Either DIRECT_URL or DATABASE_URL must be defined.');
  }

  return migrationUrl;
}

describe('Prisma 7 & Neon Migration URL Resolution Policy', () => {
  it('strictly requires DIRECT_URL in production environment', () => {
    expect(() =>
      resolvePrismaMigrationUrl({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://neondb_owner:pass@ep-pooler.region.neon.tech/neondb?sslmode=require',
      })
    ).toThrowError(/DIRECT_URL is required in production for safe migration execution/);
  });

  it('selects DIRECT_URL for production migrations when provided', () => {
    const direct = 'postgresql://neondb_owner:pass@ep-direct.region.neon.tech/neondb?sslmode=require';
    const pooled = 'postgresql://neondb_owner:pass@ep-pooler.region.neon.tech/neondb?sslmode=require';

    const url = resolvePrismaMigrationUrl({
      NODE_ENV: 'production',
      DIRECT_URL: direct,
      DATABASE_URL: pooled,
    });

    expect(url).toBe(direct);
  });

  it('falls back to DATABASE_URL in local development when DIRECT_URL is not set', () => {
    const localDb = 'postgresql://goldloan_dev:post1234@localhost:5432/gold_loan_portal?schema=public';

    const url = resolvePrismaMigrationUrl({
      NODE_ENV: 'development',
      DATABASE_URL: localDb,
    });

    expect(url).toBe(localDb);
  });

  it('prefers DIRECT_URL even in local development if explicitly configured', () => {
    const localDirect = 'postgresql://goldloan_dev:post1234@localhost:5432/gold_loan_portal?direct=true';
    const localDb = 'postgresql://goldloan_dev:post1234@localhost:5432/gold_loan_portal';

    const url = resolvePrismaMigrationUrl({
      NODE_ENV: 'development',
      DIRECT_URL: localDirect,
      DATABASE_URL: localDb,
    });

    expect(url).toBe(localDirect);
  });
});
