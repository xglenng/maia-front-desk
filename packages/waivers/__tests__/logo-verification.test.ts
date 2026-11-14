import test from "node:test";
import assert from "node:assert";
import { db } from "@/packages/db/src";
import { studioLogoAssets } from "@/packages/db/src/schema";
import { sql } from "drizzle-orm";

test("Studio logo assets table is accessible and migration journal exists", async () => {
  // Test 1: Query the logo table
  const logoQuery = await db.select({ count: sql`COUNT(*)::int` }).from(studioLogoAssets);
  assert(logoQuery[0], "Logo query result exists");
  assert(typeof logoQuery[0].count === "number", "Count is a number");
  console.log(`  ✓ Logo assets table exists with ${logoQuery[0].count} records`);

  // Test 2: Check migration journal
  const migrationQuery = await db.execute(
    sql.raw("SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations")
  );
  assert(migrationQuery.rows?.[0], "Migration query result exists");
  const migCount = migrationQuery.rows[0].count;
  console.log(`  ✓ Migration journal exists with ${migCount} applied migrations`);

  if (migCount === 0) {
    console.warn("  ⚠ Migration journal is empty (schema was applied via db:push, not db:migrate)");
  }
});
