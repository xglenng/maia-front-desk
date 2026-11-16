const { Pool } = require('pg');

const pool = new Pool({
  user: 'tattoo',
  password: 'tattoo',
  host: 'localhost',
  port: 5432,
  database: 'tattoo_ai'
});

async function migrate() {
  try {
    const client = await pool.connect();
    
    console.log('Applying migration 0030_walk_in_appointments...\n');
    
    // Create Drizzle migrations table if it doesn't exist
    console.log('Creating Drizzle migration tracking table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations__" (
          id SERIAL NOT NULL PRIMARY KEY,
          hash varchar NOT NULL UNIQUE,
          created_at bigint NOT NULL
        )
      `);
      console.log('✓ Migration tracking table ready');
    } catch (e) {
      if (e.code === '42P07') console.log('✓ Migration tracking table already exists');
      else throw e;
    }
    
    console.log('\nApplying schema changes...');
    
    try {
      await client.query(`ALTER TABLE "appointments" ADD COLUMN "is_walk_in" boolean DEFAULT false NOT NULL`);
      console.log('✓ Added is_walk_in column');
    } catch (e) {
      if (e.code === '42701') console.log('✓ is_walk_in column already exists');
      else throw e;
    }
    
    console.log('\nRecording migration...');
    
    try {
      await client.query(`INSERT INTO "__drizzle_migrations__" (hash, created_at) VALUES ('0030_walk_in_appointments', EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT DO NOTHING`);
      console.log('✓ Migration recorded in journal');
    } catch (e) {
      console.log('✓ Migration already recorded');
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
