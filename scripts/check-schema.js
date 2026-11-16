const { Pool } = require('pg');

const pool = new Pool({
  user: 'tattoo',
  password: 'tattoo',
  host: 'localhost',
  port: 5432,
  database: 'tattoo_ai'
});

async function checkSchema() {
  const client = await pool.connect();
  
  try {
    console.log('=== Checking studio_invoices table schema ===\n');
    
    // Get table columns
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'studio_invoices'
      ORDER BY ordinal_position
    `);
    
    console.log('Columns in studio_invoices:');
    console.log('────────────────────────────────────────────────────');
    result.rows.forEach(row => {
      const nullable = row.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
      const def = row.column_default ? ` DEFAULT ${row.column_default}` : '';
      console.log(`  ${row.column_name.padEnd(25)} ${row.data_type.padEnd(15)} ${nullable}${def}`);
    });
    
    console.log('\n=== Checking for email columns ===\n');
    const emailCols = result.rows.filter(r => r.column_name.includes('email'));
    if (emailCols.length > 0) {
      console.log('✅ Found email-related columns:');
      emailCols.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('❌ No email_status or email_provider_id columns found');
    }
    
    console.log('\n=== Checking constraints ===\n');
    const constraintResult = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'studio_invoices'
    `);
    
    console.log('Constraints:');
    constraintResult.rows.forEach(row => {
      console.log(`  ${row.constraint_name.padEnd(40)} (${row.constraint_type})`);
    });
    
    console.log('\n=== Checking migration journal ===\n');
    const migrationResult = await client.query(`
      SELECT hash, created_at FROM "__drizzle_migrations__" ORDER BY created_at DESC LIMIT 5
    `);
    
    console.log('Last 5 migrations in Drizzle journal:');
    migrationResult.rows.forEach(row => {
      console.log(`  ${row.hash.padEnd(40)} ${row.created_at}`);
    });
    
    const has0029 = migrationResult.rows.some(r => r.hash === '0029_studio_invoice_email');
    console.log(`\n📋 Migration 0029 recorded: ${has0029 ? '✅ YES' : '❌ NO'}`);
    
  } catch (error) {
    console.error('Database query error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema();
