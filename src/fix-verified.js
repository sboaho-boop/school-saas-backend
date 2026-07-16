const prisma = require('./lib/prisma');

async function main() {
  const result = await prisma.user.updateMany({
    where: { isVerified: false },
    data: { isVerified: true },
  });
  console.log(`Marked ${result.count} existing users as verified`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
