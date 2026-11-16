const { Pool } = require('pg');

const pool = new Pool({
  user: 'tattoo',
  password: 'tattoo',
  host: 'localhost',
  port: 5432,
  database: 'tattoo_ai'
});

async function test() {
  const client = await pool.connect();
  
  try {
    console.log('=== Testing email_status update ===\n');
    
    // First, check if we have any invoices
    const invoiceResult = await client.query(`
      SELECT id, email_status, stripe_invoice_id, stripe_account_id, hosted_url
      FROM studio_invoices 
      WHERE stripe_invoice_id IS NOT NULL
      LIMIT 1
    `);
    
    if (invoiceResult.rows.length === 0) {
      console.log('No invoices with payment links found');
      console.log('Creating a test invoice...\n');
      
      // Create a test organization and artist first
      const orgResult = await client.query(`
        SELECT id FROM organizations LIMIT 1
      `);
      
      if (orgResult.rows.length === 0) {
        console.log('No organization found in database');
        return;
      }
      
      const orgId = orgResult.rows[0].id;
      
      const userResult = await client.query(`
        SELECT id FROM users LIMIT 1
      `);
      
      if (userResult.rows.length === 0) {
        console.log('No user found in database');
        return;
      }
      
      const userId = userResult.rows[0].id;
      
      // For now, skip the full test
      console.log('Database has data but no open invoices with payment links yet');
      return;
    }
    
    const invoice = invoiceResult.rows[0];
    console.log(`Found invoice: ${invoice.id}`);
    console.log(`Current email_status: ${invoice.email_status}`);
    console.log(`Has payment link: ${invoice.hosted_url ? 'YES' : 'NO'}`);
    
    // Try to update email_status to SENDING
    console.log('\nAttempting to update email_status to SENDING...\n');
    
    const updateResult = await client.query(`
      UPDATE studio_invoices 
      SET email_status = 'SENDING', updated_at = NOW()
      WHERE id = $1
      RETURNING id, email_status
    `, [invoice.id]);
    
    if (updateResult.rows.length > 0) {
      console.log('✅ Update successful');
      console.log('Result:', updateResult.rows[0]);
    } else {
      console.log('❌ Update returned no rows');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Code:', error.code);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

test();
