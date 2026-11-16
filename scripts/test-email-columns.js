const { db } = require('@/packages/db/src');
const { studioInvoices } = require('@/packages/db/src/schema');
const { eq } = require('drizzle-orm');

async function test() {
  try {
    console.log('Testing query with emailStatus column...\n');
    
    // Try to query with the emailStatus column
    const result = await db
      .select({
        id: studioInvoices.id,
        emailStatus: studioInvoices.emailStatus,
      })
      .from(studioInvoices)
      .limit(1);
    
    console.log('✅ Query successful!');
    console.log('Sample result:', result);
    
  } catch (error) {
    console.error('❌ Query failed:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
  }
}

test();
