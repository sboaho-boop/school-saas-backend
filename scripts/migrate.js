#!/usr/bin/env node
/**
 * Safe migration runner for production.
 *
 * Replaces `prisma db push --accept-data-loss` with a real migration workflow:
 *  1. If the database was created previously via `db push` (tables exist but no
 *     `_prisma_migrations` history), it is adopted under migration control by
 *     marking the 0_init baseline as already applied - WITHOUT touching data.
 *  2. Brand-new databases get the 0_init baseline applied for real.
 *  3. All future schema changes must be shipped as Prisma migrations and will be
 *     applied by `prisma migrate deploy`. Data-loss-prone changes now fail the
 *     deploy loudly instead of silently dropping data.
 */
require('dotenv').config();
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const BASELINE = '0_init';

async function tableExists(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT to_regclass($1)::text AS name",
    name
  );
  return rows[0]?.name != null;
}

async function hasUserTables(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  return rows[0]?.n > 0;
}

async function appliedMigrations(prisma) {
  if (!(await tableExists(prisma, 'public._prisma_migrations'))) return [];
  const rows = await prisma.$queryRawUnsafe(
    "SELECT migration_name FROM _prisma_migrations"
  );
  return rows.map((r) => r.migration_name);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const isNewDb = !(await hasUserTables(prisma));
    const applied = await appliedMigrations(prisma);

    if (!applied.includes(BASELINE)) {
      if (!isNewDb) {
        console.log(`[migrate] Existing database detected - adopting baseline ${BASELINE} without re-running it (data is preserved).`);
        execSync(`npx prisma migrate resolve --applied ${BASELINE}`, { stdio: 'inherit' });
      } else {
        console.log(`[migrate] Fresh database detected - baseline ${BASELINE} will be created by migrate deploy.`);
      }
    }

    console.log('[migrate] Applying pending migrations...');
    console.log(`[migrate] Applied so far: ${applied.join(', ') || '(none)'}`);
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[migrate] Database is up to date.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[migrate] FAILED:', e);
  process.exit(1);
});