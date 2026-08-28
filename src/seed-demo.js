require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

async function main() {
  const hash = await bcrypt.hash('password123', 10);

  await prisma.superAdmin.upsert({
    where: { email: 'super@eduplatform.com' },
    update: {},
    create: { email: 'super@eduplatform.com', password: await bcrypt.hash('superadmin123', 10), name: 'Super Admin' },
  });

  const existing = await prisma.school.findFirst({ where: { code: 'SCH-DEMO' } });
  if (existing) {
    console.log('Demo school already exists (SCH-DEMO). Nothing to do.');
    return;
  }

  const school = await prisma.school.create({ data: { code: 'SCH-DEMO', name: 'Demo International School' } });
  const schoolId = school.id;

  await prisma.subscription.create({ data: { schoolId, plan: 'free', status: 'active', studentLimit: 500, staffLimit: 20 } });

  const accounts = [
    { email: 'headteacher@demo.com', name: 'Demo Headteacher', role: 'headteacher', staffType: 'headteacher', roleTitle: 'Head Teacher', dept: 'Administration' },
    { email: 'admin@demo.com', name: 'Demo Admin', role: 'admin', staffType: 'admin', roleTitle: 'Administrator', dept: 'Administration' },
    { email: 'accountant@demo.com', name: 'Demo Accountant', role: 'accountant', staffType: 'accountant', roleTitle: 'Accountant', dept: 'Finance' },
    { email: 'teacher1@demo.com', name: 'Demo Teacher A', role: 'teaching', staffType: 'teaching', roleTitle: 'Class Teacher', dept: 'Academics' },
    { email: 'teacher2@demo.com', name: 'Demo Teacher B', role: 'teaching', staffType: 'teaching', roleTitle: 'Subject Teacher', dept: 'Academics' },
    { email: 'staff@demo.com', name: 'Demo Support Staff', role: 'non-teaching', staffType: 'non-teaching', roleTitle: 'Librarian', dept: 'Support' },
  ];

  const users = [];
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i];
    users.push(await prisma.user.create({
      data: { email: a.email, password: hash, name: a.name, role: a.role, schoolId, isVerified: true },
    }));
  }

  const classNames = ['Lower Primary - Class 1', 'Lower Primary - Class 2', 'Upper Primary - Class 4', 'Junior High - JHS 1'];
  const classes = [];
  for (const cn of classNames) {
    classes.push(await prisma.academicClass.create({
      data: { name: cn, section: cn.split(' - ')[0], teacher: 'Unassigned', schoolId },
    }));
  }

  const subjectDefs = [['English', 'ENG'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['ICT', 'ICT']];
  for (const cls of classes) {
    for (const [name, code] of subjectDefs) {
      await prisma.subject.create({ data: { name, code: `${code}-${cls.id.slice(-4)}`, teacher: 'Unassigned', classId: cls.id, schoolId } });
    }
  }

  await prisma.term.createMany({
    data: [
      { name: 'Term 1', academicYear: '2026', startDate: '2026-01-15', endDate: '2026-04-11', isActive: false, schoolId },
      { name: 'Term 2', academicYear: '2026', startDate: '2026-05-06', endDate: '2026-08-15', isActive: true, schoolId },
    ],
  });
  const activeTerm = await prisma.term.findFirst({ where: { schoolId, isActive: true } });

  const firstNames = ['Kwame', 'Ama', 'Kofi', 'Akua', 'Yaw', 'Esi', 'Kojo', 'Abena', 'Nana', 'Adwoa'];
  const lastNames = ['Mensah', 'Asante', 'Osei', 'Boadu', 'Adjei', 'Sarpong', 'Opoku', 'Owusu', 'Danso', 'Lartey'];
  const studentIds = [];
  for (let i = 0; i < 10; i++) {
    const first = firstNames[i];
    const last = lastNames[i];
    const cls = classes[i % classes.length];
    const s = await prisma.student.create({
      data: {
        indexNumber: `SCH-DEMO-STU-${String(i + 1).padStart(3, '0')}`,
        firstName: first, lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@demo.student`,
        classId: cls.id, className: cls.name,
        dateOfBirth: `2014-0${(i % 9) + 1}-15`, gender: i % 2 === 0 ? 'male' : 'female',
        parentName: `${lastNames[(i + 3) % 10]} Parent`, parentPhone: `+23320100000${i}`,
        parentEmail: `${first.toLowerCase()}.${i}@demo.parent`,
        enrollmentDate: '2025-09-01', status: 'active', schoolId,
      },
    });
    studentIds.push(s.id);
    const amount = 20000 + i * 500;
    const paid = i % 3 === 0 ? amount : Math.floor(amount / 2);
    await prisma.feeRecord.create({
      data: { studentId: s.id, studentName: `${first} ${last}`, amount, paid, balance: amount - paid, dueDate: '2026-07-15', status: paid >= amount ? 'paid' : 'partial', schoolId },
    });
  }

  for (let si = 0; si < accounts.length; si++) {
    const a = accounts[si];
    await prisma.staff.create({
      data: {
        name: a.name, email: a.email, phone: `+23320300000${si}`, role: a.roleTitle,
        department: a.dept, staffType: a.staffType,
        assignedClasses: a.staffType === 'teaching' ? JSON.stringify([classes[0].name]) : undefined,
        assignedSubjects: a.staffType === 'teaching' ? JSON.stringify(['English', 'Mathematics']) : undefined,
        indexNumber: `SCH-DEMO-STF-${String(si + 1).padStart(3, '0')}`,
        cardUid: `DEMO-CARD-${si}`, status: 'active', hireDate: '2024-01-01', schoolId,
      },
    });
  }

  await prisma.task.createMany({
    data: [
      { title: 'Prepare exam timetable', description: 'End-of-term exam schedule', assignedTo: users[0].id, assignedBy: users[0].id, status: 'in_progress', priority: 'high', dueDate: '2026-08-30', schoolId },
      { title: 'Update student records', description: 'Verify all student data', assignedTo: users[1].id, assignedBy: users[0].id, status: 'pending', priority: 'medium', dueDate: '2026-09-05', schoolId },
      { title: 'Process fee payments', description: 'Reconcile fee balances', assignedTo: users[2].id, assignedBy: users[0].id, status: 'pending', priority: 'urgent', dueDate: '2026-08-28', schoolId },
    ],
  });

  console.log('Demo school created: Demo International School (SCH-DEMO)');
  console.log('Logins (password: password123):');
  for (const a of accounts) console.log(`  ${a.email}  (${a.role})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
