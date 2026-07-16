const prisma = require('./lib/prisma');

async function main() {
  const users = await prisma.user.count();
  const supers = await prisma.superAdmin.count();
  const schools = await prisma.school.count();
  console.log(`Schools: ${schools}, Users: ${users}, SuperAdmins: ${supers}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
