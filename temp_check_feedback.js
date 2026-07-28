const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.feedback.count();
  const items = await prisma.feedback.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('Total feedback:', count);
  items.forEach(f => console.log(f.subject, '|', f.status, '|', f.userName, '|', new Date(f.createdAt).toISOString()));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
