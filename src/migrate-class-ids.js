const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.academicClass.findMany();
  const classMap = {};
  classes.forEach((c) => { classMap[c.name] = c.id; });

  const students = await prisma.student.findMany();
  for (const s of students) {
    const realId = classMap[s.className];
    if (realId && s.classId !== realId) {
      await prisma.student.update({ where: { id: s.id }, data: { classId: realId } });
      console.log(`Fixed student ${s.firstName} ${s.lastName}: ${s.classId} -> ${realId}`);
    }
  }

  // Fix attendance classIds too
  const attRecs = await prisma.attendance.findMany();
  for (const a of attRecs) {
    const realId = classMap[a.className];
    if (realId && a.classId !== realId) {
      await prisma.attendance.update({ where: { id: a.id }, data: { classId: realId } });
    }
  }

  console.log('Migration complete.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
