require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

const STAFF_PASSWORD = 'password123';
const SUPER_PASSWORD = 'superadmin123';
const TUTOR_PASSWORD = 'kofi123';

const LIMITS = {
  enterprise: { studentLimit: 999999, staffLimit: 999999 },
  pro: { studentLimit: 1000, staffLimit: 50 },
  free: { studentLimit: 100, staffLimit: 10 },
};

async function main() {
  // 1) Owner super admin (full platform admin, incl. managing admins)
  await prisma.superAdmin.upsert({
    where: { email: 'super@eduplatform.com' },
    update: { role: 'owner' },
    create: { email: 'super@eduplatform.com', password: await bcrypt.hash(SUPER_PASSWORD, 10), name: 'Super Admin', role: 'owner' },
  });

  // 2) Demo school
  let school = await prisma.school.findFirst({ where: { code: 'SCH-DEMO' } });
  let isNewSchool = false;
  if (!school) {
    school = await prisma.school.create({ data: { code: 'SCH-DEMO', name: 'Demo International School' } });
    isNewSchool = true;
  }

  // 3) Full access plan (unlimited students + staff, unlimited AI for the portal)
  await prisma.subscription.upsert({
    where: { schoolId: school.id },
    update: { plan: 'enterprise', status: 'active', studentLimit: LIMITS.enterprise.studentLimit, staffLimit: LIMITS.enterprise.staffLimit, trialEndsAt: null },
    create: { schoolId: school.id, plan: 'enterprise', status: 'active', studentLimit: LIMITS.enterprise.studentLimit, staffLimit: LIMITS.enterprise.staffLimit },
  });

  // 4) Staff logins for every role in the portal
  const hash = await bcrypt.hash(STAFF_PASSWORD, 10);
  const accounts = [
    { email: 'demo@eduplatform.com', name: 'Demo Admin', role: 'admin' },
    { email: 'headteacher@demo.com', name: 'Demo Headteacher', role: 'headteacher' },
    { email: 'accountant@demo.com', name: 'Demo Accountant', role: 'accountant' },
    { email: 'teacher1@demo.com', name: 'Demo Teacher A', role: 'teaching' },
    { email: 'teacher2@demo.com', name: 'Demo Teacher B', role: 'teaching' },
    { email: 'staff@demo.com', name: 'Demo Support Staff', role: 'non-teaching' },
  ];
  for (const a of accounts) {
    await prisma.user.upsert({
      where: { schoolId_email: { schoolId: school.id, email: a.email } },
      update: { name: a.name, role: a.role, isVerified: true },
      create: { schoolId: school.id, email: a.email, password: hash, name: a.name, role: a.role, isVerified: true },
    });
  }

  // 5) Teacher Kofi unlimited AI tutor account
  await prisma.tutorUser.upsert({
    where: { email: 'kofi@demo.com' },
    update: { plan: 'unlimited', subscriptionStart: new Date(), subscriptionEnd: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000) },
    create: { email: 'kofi@demo.com', password: await bcrypt.hash(TUTOR_PASSWORD, 10), name: 'Teacher Kofi Demo', plan: 'unlimited', subscriptionStart: new Date(), subscriptionEnd: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000) },
  });

  // 6) Summary
  console.log('==============================================');
  console.log('FULL ACCESS ENABLED');
  console.log('==============================================');
  console.log('SUPER ADMIN (platform owner):');
  console.log(`  https://school-saas-fawn.vercel.app/super-admin/login`);
  console.log(`  super@eduplatform.com / ${SUPER_PASSWORD}`);
  console.log('');
  console.log('SCHOOL PORTAL (Demo International School, code: SCH-DEMO):');
  console.log(`  https://school-saas-fawn.vercel.app/login`);
  console.log(`  Plan: enterprise (unlimited students/staff, unlimited portal AI)`);
  for (const a of accounts) console.log(`  ${a.email} / ${STAFF_PASSWORD}  (${a.role})`);
  if (isNewSchool) console.log('  (Demo school was created fresh.)');
  else console.log('  (Existing SCH-DEMO school was upgraded.)');
  console.log('');
  console.log('TEACHER KOFI (standalone AI tutor):');
  console.log(`  https://school-saas-fawn.vercel.app/tutor/login`);
  console.log(`  kofi@demo.com / ${TUTOR_PASSWORD}  (plan: unlimited)`);
  console.log('');
  const subs = await prisma.subscription.findMany({ select: { schoolId: true, plan: true } });
  console.log('Current schools & plans:');
  for (const s of subs) console.log(`  plan=${s.plan}  schoolId=${s.schoolId}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());