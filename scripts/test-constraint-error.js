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
    // Try to add an existing constraint
    await client.query(`ALTER TABLE "studio_invoices" ADD CONSTRAINT "studio_invoice_email_status_check" CHECK ("email_status" IN ('NOT_SENT','SENDING','SENT','UNKNOWN'))`);
  } catch (error) {
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    console.log('Full error:', error);
  }
  
  client.release();
  await pool.end();
}

test();
