require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe('SELECT 1 as ok').then(r => {
  console.log('Connected:', JSON.stringify(r));
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
