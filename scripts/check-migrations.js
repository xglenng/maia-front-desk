const { Pool } = require('pg');

const pool = new Pool({
  user: 'tattoo',
  password: 'tattoo',
  host: 'localhost',
  port: 5432,
  database: 'tattoo_ai'
});

async function check() {
  const client = await pool.connect();
  
  try {
    console.log('=== Checking for Drizzle migration tables ===\n');
    
    // List all tables
    const tableResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('All tables in public schema:');
    tableResult.rows.forEach(row => {
      const mark = row.table_name.includes('migration') ? ' ⚠️' : '';
      console.log(`  - ${row.table_name}${mark}`);
    });
    
    console.log('\n=== Looking for migration tracking ===\n');
    
    // Check for Drizzle migrations table
    const drizzleCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = '__drizzle_migrations__'
      )
    `);
    
    if (drizzleCheck.rows[0].exists) {
      console.log('✅ __drizzle_migrations__ table EXISTS');
      
      const migrations = await client.query(`
        SELECT hash, created_at FROM "__drizzle_migrations__" ORDER BY created_at DESC
      `);
      
      console.log('\nRecorded migrations:');
      migrations.rows.forEach(row => {
        console.log(`  ${row.hash.padEnd(40)} ${row.created_at}`);
      });
    } else {
      console.log('❌ __drizzle_migrations__ table DOES NOT EXIST');
      console.log('   This means migration tracking is not set up');
    }
    
    console.log('\n=== Checking email columns existence ===\n');
    
    const emailStatusCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_invoices' 
        AND column_name = 'email_status'
      )
    `);
    
    const emailProviderIdCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_invoices' 
        AND column_name = 'email_provider_id'
      )
    `);
    
    console.log(`email_status column: ${emailStatusCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`email_provider_id column: ${emailProviderIdCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);
    
    console.log('\n=== Checking email_status constraint ===\n');
    
    const constraintCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'studio_invoices'
        AND constraint_name = 'studio_invoice_email_status_check'
      )
    `);
    
    console.log(`studio_invoice_email_status_check: ${constraintCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

check();
