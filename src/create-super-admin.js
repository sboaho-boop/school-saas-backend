const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const existing = await prisma.superAdmin.findUnique({ where: { email: 'super@eduplatform.com' } });
  if (existing) {
    console.log('SuperAdmin already exists.');
    return;
  }
  const hash = await bcrypt.hash('superadmin123', 10);
  await prisma.superAdmin.create({ data: { email: 'super@eduplatform.com', password: hash, name: 'Super Admin', role: 'owner' } });
  console.log('✅ SuperAdmin created: super@eduplatform.com / superadmin123 (owner)');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
