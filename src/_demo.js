const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.student.count();
  console.log('Student count in local DB:', count);

  if (count === 0) {
    console.log('No students found. The local DB needs to be seeded first.');
    console.log('The live Railway DB has the seed data.');
    console.log('');
    console.log('To seed locally, run: npx prisma db push --accept-data-loss && node src/seed.js');
    await prisma.$disconnect();
    return;
  }

  const students = await prisma.student.findMany({ take: 5, include: { school: { select: { name: true } } } });
  console.log('\nSample parent emails for Student Login:');
  for (const s of students) {
    console.log(s.firstName + ' ' + s.lastName + ' | Class: ' + s.className + ' | School: ' + s.school.name);
    console.log('  Parent Email: ' + s.parentEmail);
    console.log('  Parent login: /parent/login');
    console.log('');
  }

  const hash = await bcrypt.hash('demo123', 10);
  const demo = await prisma.student.findMany({ take: 3 });
  for (const s of demo) {
    await prisma.student.update({ where: { id: s.id }, data: { password: hash } });
    console.log('SET: ' + s.firstName + ' ' + s.lastName + ' (parentEmail: ' + s.parentEmail + ') -> password: demo123');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
