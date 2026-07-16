const prisma = require('./lib/prisma');

async function wipe() {
  console.log('Wiping all data via raw SQL...');

  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
  );

  await prisma.$executeRawUnsafe('SET session_replication_role = replica;');

  for (const t of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t.name}" CASCADE;`);
      console.log(`  Cleared ${t.name}`);
    } catch (err) {
      console.log(`  Skipped ${t.name} (${err.message.slice(0, 50)})`);
    }
  }

  await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
  console.log('\nAll data wiped.');
}

wipe()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
