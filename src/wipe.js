const prisma = require('./lib/prisma');

async function wipe() {
  console.log('Wiping all data via raw SQL...');
  
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
  
  const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
  
  for (const t of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t.name}";`);
      console.log(`  Cleared ${t.name}`);
    } catch (err) {
      console.log(`  Skipped ${t.name} (${err.message.slice(0, 50)})`);
    }
  }
  
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  console.log('\nAll data wiped.');
}

wipe()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
