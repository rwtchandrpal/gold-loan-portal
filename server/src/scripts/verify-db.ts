import { pool, prisma } from '../config/db.js';

async function main() {
  console.log('--- PostgreSQL 18 Verification ---');
  
  // 1. Connection info
  const connRes = await pool.query(
    'SELECT version(), current_database(), current_user, inet_server_port()'
  );
  console.log('Connected DB:', connRes.rows[0].current_database);
  console.log('Connected User:', connRes.rows[0].current_user);
  console.log('Port:', connRes.rows[0].inet_server_port);
  console.log('Version:', connRes.rows[0].version.split('\n')[0]);

  // 2. Public tables
  const tablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('\nPublic Tables:', tablesRes.rows.map((r) => r.table_name));

  // 3. Sequences
  const seqRes = await pool.query(`
    SELECT sequence_name, start_value, minimum_value, maximum_value, increment 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  `);
  console.log('\nSequences in public schema:');
  console.table(seqRes.rows);

  // 4. Test sequence nextval
  const nextValRes = await pool.query("SELECT nextval('lead_application_id_seq') AS sample_nextval");
  console.log('Sample sequence nextval:', nextValRes.rows[0].sample_nextval);
  // Reset sequence back to 1001 so tests/leads start at 1001
  await pool.query("ALTER SEQUENCE lead_application_id_seq RESTART WITH 1001");
  console.log('Sequence reset back to 1001');

  // 5. Loan Schemes seeded
  const schemes = await prisma.loanScheme.findMany({
    orderBy: { id: 'asc' },
  });
  console.log('\nSeeded Loan Schemes in Database:');
  console.table(
    schemes.map((s) => ({
      id: s.id,
      name: s.name,
      interestRateAnnual: `${s.interestRateAnnual}%`,
      maxLtv: `${Number(s.maxLtv) * 100}%`,
      tenureMonths: s.tenureMonths,
      isActive: s.isActive,
      description: s.description,
    }))
  );

  // 6. Lead table column definitions
  const columnsRes = await pool.query(`
    SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
    ORDER BY ordinal_position
  `);
  console.log('\nLeads Table Columns:');
  console.table(columnsRes.rows);

  console.log('\n--- Verification Completed Successfully ---');
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
