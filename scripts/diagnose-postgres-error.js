const { Pool } = require('pg');

const pool = new Pool({
  user: 'tattoo',
  password: 'tattoo',
  host: 'localhost',
  port: 5432,
  database: 'tattoo_ai'
});

async function diagnose() {
  const client = await pool.connect();
  
  try {
    console.log('=== STEP 1: Check Column Existence ===\n');
    
    // Check if columns exist
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'studio_invoices'
      AND column_name IN ('email_status', 'email_provider_id')
      ORDER BY column_name
    `);
    
    if (columnsResult.rows.length === 0) {
      console.log('❌ MISSING: Neither email_status nor email_provider_id columns found');
    } else {
      console.log('Found columns:');
      columnsResult.rows.forEach(col => {
        console.log(`  ✅ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable === 'YES'})`);
      });
    }
    
    console.log('\n=== STEP 2: Check Constraint ===\n');
    
    // Check constraint
    const constraintResult = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'studio_invoices'
      AND constraint_name LIKE '%email%'
    `);
    
    if (constraintResult.rows.length === 0) {
      console.log('❌ MISSING: No email-related constraints found');
    } else {
      constraintResult.rows.forEach(c => {
        console.log(`  ✅ ${c.constraint_name} (${c.constraint_type})`);
      });
    }
    
    console.log('\n=== STEP 3: Test UPDATE Query (Will Fail Gracefully) ===\n');
    
    // Try to update with the actual error that would be caught
    try {
      await client.query(`
        UPDATE studio_invoices 
        SET email_status = 'SENDING'
        WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
      `);
      console.log('✅ UPDATE query syntax is valid (0 rows affected as expected)');
    } catch (error) {
      console.log('❌ UPDATE query failed:');
      console.log(`  Code: ${error.code}`);
      console.log(`  Message: ${error.message}`);
      console.log(`  Severity: ${error.severity}`);
      console.log(`  Detail: ${error.detail}`);
      
      // Check if this is a "column does not exist" error
      if (error.code === '42703') {
        console.log('\n  ⚠️  This is a column-not-found error (code 42703)');
      }
    }
    
    console.log('\n=== STEP 4: Check Drizzle Migration Table ===\n');
    
    const drizzleCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = '__drizzle_migrations__'
      ) as exists
    `);
    
    if (drizzleCheck.rows[0].exists) {
      console.log('✅ __drizzle_migrations__ table EXISTS\n');
      
      const migrations = await client.query(`
        SELECT hash, created_at FROM "__drizzle_migrations__" 
        WHERE hash LIKE '%0029%' OR hash LIKE '%email%'
      `);
      
      if (migrations.rows.length > 0) {
        console.log('  Recorded migrations:');
        migrations.rows.forEach(m => {
          console.log(`    ${m.hash} - ${new Date(m.created_at)}`);
        });
      } else {
        console.log('  ❌ Migration 0029 is NOT recorded in the journal');
      }
    } else {
      console.log('❌ __drizzle_migrations__ table DOES NOT EXIST');
    }
    
  } catch (error) {
    console.error('Diagnostic error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnose();
