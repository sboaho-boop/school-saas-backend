const prisma = require('./lib/prisma');
(async () => {
  const schools = await prisma.school.count();
  const users = await prisma.user.count();
  const students = await prisma.student.count();
  const staff = await prisma.staff.count();
  console.log(`Schools: ${schools}, Users: ${users}, Students: ${students}, Staff: ${staff}`);
  await prisma.$disconnect();
})();
