const prisma = require('./lib/prisma');

async function fixIndexNumbers() {
  const schools = await prisma.school.findMany();
  for (const school of schools) {
    const code = school.code || 'SCH-XXXXXX';

    // Students
    const students = await prisma.student.findMany({ where: { schoolId: school.id, indexNumber: null }, orderBy: { createdAt: 'asc' } });
    for (let i = 0; i < students.length; i++) {
      const idx = `${code}-STU-${String(i + 1).padStart(3, '0')}`;
      await prisma.student.update({ where: { id: students[i].id }, data: { indexNumber: idx } });
    }
    console.log(`  ${school.name}: ${students.length} students fixed`);

    // Staff
    const staff = await prisma.staff.findMany({ where: { schoolId: school.id, indexNumber: null }, orderBy: { createdAt: 'asc' } });
    for (let i = 0; i < staff.length; i++) {
      const idx = `${code}-STF-${String(i + 1).padStart(3, '0')}`;
      await prisma.staff.update({ where: { id: staff[i].id }, data: { indexNumber: idx } });
    }
    console.log(`  ${school.name}: ${staff.length} staff fixed`);
  }
  console.log('Done');
}

fixIndexNumbers()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
