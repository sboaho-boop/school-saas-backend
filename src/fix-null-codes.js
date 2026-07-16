const prisma = require('./lib/prisma');

async function fixNullCodes() {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const schools = await prisma.school.findMany({ where: { code: null } });
  console.log(`Found ${schools.length} schools with null code`);
  for (const school of schools) {
    let code;
    let attempts = 0;
    do {
      code = 'SCH-';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      attempts++;
    } while (await prisma.school.findUnique({ where: { code } }) && attempts < 20);
    await prisma.school.update({ where: { id: school.id }, data: { code } });
    console.log(`Fixed school ${school.name} -> code ${code}`);
  }
  console.log('Done fixing null codes');
}

fixNullCodes()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
