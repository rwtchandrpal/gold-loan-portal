import { pool, prisma } from '../config/db.js';

async function main() {
  console.log('--- PostgreSQL Database Verification ---');
  
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

  // 4. Inspect current sequence state
  const seqStatus = await pool.query("SELECT last_value, is_called FROM lead_application_id_seq");
  console.log('Current sequence state:', seqStatus.rows[0]);

  // Ensure sequence is safely ahead of any existing lead IDs to prevent primary key collisions
  const maxLeadRes = await pool.query("SELECT MAX(CAST(SUBSTRING(id FROM 4) AS BIGINT)) AS max_id FROM leads WHERE id LIKE 'GL-%'");
  const maxLeadId = maxLeadRes.rows[0]?.max_id ? Number(maxLeadRes.rows[0].max_id) : 1000;
  const currentVal = Number(seqStatus.rows[0].last_value);
  if (currentVal <= maxLeadId) {
    await pool.query(`SELECT setval('lead_application_id_seq', ${maxLeadId})`);
    console.log(`Sequence synchronized to ${maxLeadId} (nextval will be ${maxLeadId + 1})`);
  } else {
    console.log(`Sequence is ahead at ${currentVal} (nextval will be ${currentVal + 1})`);
  }

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
