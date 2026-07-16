const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.superAdmin.updateMany({ data: { role: 'owner' } })
  .then(r => console.log('Updated:', r.count))
  .catch(e => console.error(e))
  .finally(() => p.$disconnect());
