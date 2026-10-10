import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[Seed] DATABASE_URL environment variable is not defined');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function seed() {
  console.log('[Seed] Seeding loan schemes...');

  const schemes = [
    {
      id: 'PLAN_BULLET_01',
      name: 'Bullet Repayment',
      interestRateAnnual: 12.0,
      maxLtv: 0.70,
      tenureMonths: 12,
      description: '12 months, interest + principal at maturity',
      isActive: true,
    },
    {
      id: 'PLAN_EMI_01',
      name: 'Monthly EMI',
      interestRateAnnual: 10.5,
      maxLtv: 0.75,
      tenureMonths: 12,
      description: '12 months, equal monthly instalments',
      isActive: true,
    },
  ];

  for (const scheme of schemes) {
    const upserted = await prisma.loanScheme.upsert({
      where: { id: scheme.id },
      update: {
        name: scheme.name,
        interestRateAnnual: scheme.interestRateAnnual,
        maxLtv: scheme.maxLtv,
        tenureMonths: scheme.tenureMonths,
        description: scheme.description,
        isActive: scheme.isActive,
      },
      create: scheme,
    });
    console.log(`[Seed] Scheme upserted: ${upserted.id} (${upserted.name}) - Max LTV: ${upserted.maxLtv}, Interest: ${upserted.interestRateAnnual}%`);
  }

  console.log('[Seed] Database seeding completed successfully.');
}

seed()
  .catch((e) => {
    console.error('[Seed] Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
