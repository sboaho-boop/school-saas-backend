require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

const FIRST_NAMES = ['Kwame','Ama','Kofi','Akua','Yaw','Afua','Esi','Kojo','Abena','Nana','Adwoa','Yaa','Kwabena','Akosua','Kwesi','Efia','Kweku','Aba','Kobina','Adoma','Mensah','Serwaa','Ansah','Boatemaa','Owusu','Pokuah','Agyapong','Tiwaah','Asare','Maanu','Antwi','Sarpong','Opoku','Bonney','Boadi','Mintah','Yeboah','Peewah','Acheampong','Twum','Bediako','Dankwah','Mireku','Pomaah','Tuffour','Siaw','Apraku','Mfodwo','Otchere','Adomako','Sackey','Vanderpuye','Lartey','Nortey','Botchway','Acolatse','Tetteh','Quartey','Okine','Adjei','Sowah','Laryea','Amoako','Danso','Agyeman','Opoku','Boakye','Ntim','Sarpong','Frimpong','Gyamfi','Osei','Asante','Boadu','Bonsu','Nyarko','Fosu','Acheampong','Obeng','Twumasi','Ampofo','Afriyie','Darkwah','Donkor','Asamoah','Kwarteng','Ennin','Mintah','Awere','Tawiah','Mensah','Quayson','Coffie','Armah','Nkrumah','Sai','Awuah','Adjei','Sakyi','Debrah','Ayensu','Sam','Biney'];

const LAST_NAMES = ['Mensah','Asante','Osei','Boadu','Adjei','Sarpong','Frimpong','Opoku','Agyeman','Boakye','Owusu','Danso','Amoako','Donkor','Ansah','Asare','Nkrumah','Nyarko','Fosu','Bonsu','Twumasi','Kwarteng','Sakyi','Afriyie','Darkwah','Asamoah','Lartey','Tetteh','Quartey','Botchway','Armah','Coffie','Acolatse','Sackey','Sowah','Laryea','Vanderpuye','Adomako','Okine','Tuffour','Akoto','Annan','Aryee','Attoh','Baah','Bamfo','Bannerman','Bediako','Bortey','Crabbe','Dakwa','Darpoh','Debrah','Djokoto','Dzokoto','Eduful','Gbeho','Hagan','Hammond','Hunusu','Idan','Insah','Jectey','Kumi','Lamptey','Mantey','Nartey','Nortey','Ocran','Odonkor','Ofori','Paintsil','Quao','Quaye','Quist','Sagoe','Sam','Tamakloe','Tay','Tettegah','Thompson','Tsatsu','Tsegah','Vormawah','Woode','Yankah','Zanu','Mireku','Ntim','Obeng','Pomaah','Awuah','Siaw','Biney','Ennin'];

const SECTIONS = ['Kindergarten', 'Lower Primary', 'Upper Primary', 'Junior High'];
const CLASS_NAMES_BY_SECTION = {
  'Kindergarten': ['KG A', 'KG B'],
  'Lower Primary': ['Class 1', 'Class 2', 'Class 3'],
  'Upper Primary': ['Class 4', 'Class 5', 'Class 6'],
  'Junior High': ['JHS 1', 'JHS 2', 'JHS 3'],
};

const SUBJECTS_BY_SECTION = {
  'Kindergarten': [['Literacy', 'LIT'], ['Numeracy', 'NUM'], ['Creative Arts', 'CRE']],
  'Lower Primary': [['English', 'ENG'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['Ghanaian Language', 'GHAL']],
  'Upper Primary': [['English', 'ENG'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['Social Studies', 'SST'], ['ICT', 'ICT']],
  'Junior High': [['English', 'ENG'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['Social Studies', 'SST'], ['ICT', 'ICT'], ['French', 'FREN']],
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function componentScore() {
  return Math.floor(Math.random() * 51) + 50; // 50-100
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Generate realistic component scores that sum reasonably
function genComponents() {
  const ce = clamp(Math.floor(Math.random() * 6) + 4, 0, 10);     // 4-10
  const hw = clamp(Math.floor(Math.random() * 6) + 4, 0, 10);     // 4-10
  const qz = clamp(Math.floor(Math.random() * 16) + 12, 0, 30);   // 12-28
  const mt = clamp(Math.floor(Math.random() * 11) + 8, 0, 20);    // 8-19
  const ex = clamp(Math.floor(Math.random() * 16) + 12, 0, 30);   // 12-28
  return { classExercise: ce, homework: hw, quiz: qz, midterm: mt, exam: ex };
}

function calcTotal(c) { return c.classExercise + c.homework + c.quiz + c.midterm + c.exam; }

function scoreToGrade(total) {
  if (total >= 80) return 'A';
  if (total >= 70) return 'B';
  if (total >= 60) return 'C';
  if (total >= 50) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}

async function main() {
  const superHash = await bcrypt.hash('superadmin123', 10);
  await prisma.superAdmin.upsert({
    where: { email: 'super@eduplatform.com' },
    update: {},
    create: { email: 'super@eduplatform.com', password: superHash, name: 'Super Admin' },
  });

  // Clear all existing data for clean reseed (order matters for FK constraints)
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  const tables = ['Submission','Assignment','StaffAttendance','PrivacyConsent','StudentReport','CardOrder','Transaction','StudentWallet','Grade','Attendance','FeeRecord','Notification','Message','Announcement','TaskComment','Task','Subject','Term','AcademicClass','Campus','Staff','User','Student','TransportRoute','AuditLog','PushSubscription'];
  for (const t of tables) {
    await prisma[t].deleteMany({});
  }
  await prisma.subscription.deleteMany({});
  await prisma.school.deleteMany({});
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  console.log('Seeding database with multi-school demo data...');

  const hash = await bcrypt.hash('password123', 10);
  let totalStudents = 0, totalGrades = 0, totalWallets = 0, totalAttendance = 0, totalFees = 0;

  async function seedSchool({ code, name, userSuffix, studentCount, plan }) {
    const school = await prisma.school.create({ data: { code, name } });
    const schoolId = school.id;

    const users = await Promise.all([
      prisma.user.create({ data: { email: `headteacher${userSuffix}`, password: hash, name: `Head ${name}`, role: 'headteacher', schoolId } }),
      prisma.user.create({ data: { email: `admin${userSuffix}`, password: hash, name: `Admin ${name}`, role: 'admin', schoolId } }),
      prisma.user.create({ data: { email: `accountant${userSuffix}`, password: hash, name: `Accountant ${name}`, role: 'accountant', schoolId } }),
      prisma.user.create({ data: { email: `teacher1${userSuffix}`, password: hash, name: `Teacher A ${name}`, role: 'teaching', schoolId } }),
      prisma.user.create({ data: { email: `teacher2${userSuffix}`, password: hash, name: `Teacher B ${name}`, role: 'teaching', schoolId } }),
      prisma.user.create({ data: { email: `nont${userSuffix}`, password: hash, name: `Staff ${name}`, role: 'non-teaching', schoolId } }),
    ]);

    await prisma.subscription.create({ data: { schoolId, plan, status: 'active', studentLimit: 500, staffLimit: 20 } });

    // Create classes
    const classDefs = [];
    for (const section of SECTIONS) {
      for (const cname of CLASS_NAMES_BY_SECTION[section]) {
        classDefs.push({ name: `${section} - ${cname}`, section });
      }
    }
    const createdClasses = [];
    for (const def of classDefs) {
      createdClasses.push(await prisma.academicClass.create({
        data: { name: def.name, section: def.section, teacher: 'Unassigned', schoolId }
      }));
    }

    // Create subjects
    const allSubjects = [];
    for (const cls of createdClasses) {
      const section = SECTIONS.find(s => cls.name.startsWith(s)) || 'Junior High';
      const subjectDefs = SUBJECTS_BY_SECTION[section] || SUBJECTS_BY_SECTION['Junior High'];
      for (const [subjName, subjCode] of subjectDefs) {
        allSubjects.push(await prisma.subject.create({
          data: { name: subjName, code: `${subjCode}-${cls.name.replace(/\s+/g, '')}`, teacher: 'Unassigned', classId: cls.id, schoolId }
        }));
      }
    }

    // Create terms
    await Promise.all([
      prisma.term.create({ data: { name: 'Term 1', academicYear: '2026', startDate: '2026-01-15', endDate: '2026-04-11', isActive: false, schoolId } }),
      prisma.term.create({ data: { name: 'Term 2', academicYear: '2026', startDate: '2026-05-06', endDate: '2026-08-15', isActive: true, schoolId } }),
      prisma.term.create({ data: { name: 'Term 3', academicYear: '2026', startDate: '2026-09-02', endDate: '2026-12-05', isActive: false, schoolId } }),
    ]);

    const activeTerm = await prisma.term.findFirst({ where: { schoolId, isActive: true } });

    // Generate students
    const demoHash = await bcrypt.hash('demo123', 10);
    const shuffledFirst = shuffle(FIRST_NAMES);
    const shuffledLast = shuffle(LAST_NAMES);
    const studentIds = [];
    const studentNames = [];
    for (let i = 0; i < studentCount; i++) {
      const cls = createdClasses[i % createdClasses.length];
      const first = shuffledFirst[i % shuffledFirst.length];
      const last = shuffledLast[Math.floor(i / shuffledFirst.length) % shuffledLast.length];
      const parentFirst = pickRandom(FIRST_NAMES);
      const parentLast = pickRandom(LAST_NAMES);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.s${schoolId.slice(-4)}${i}@student.com`;
      const gender = i % 2 === 0 ? 'male' : 'female';
      const dob = `${2014 + Math.floor(i / 20)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
      const data = {
        firstName: first, lastName: last, email,
        classId: cls.id, className: cls.name,
        dateOfBirth: dob, gender,
        photoUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${first}${last}${schoolId.slice(-4)}${i}`,
        parentName: `${parentFirst} ${parentLast}`,
        parentPhone: `+233${String(200000000 + i).slice(0, 9)}`,
        parentEmail: `${parentFirst.toLowerCase()}.${i}.s${schoolId.slice(-4)}@example.com`,
        enrollmentDate: '2025-09-01', status: 'active', schoolId,
      };
      if (i < 2) {
        data.parentPassword = demoHash;
        data.password = demoHash;
        const slug = code === 'SCH-001' ? 'school' : code === 'SCH-002' ? 'riverside' : code === 'SCH-003' ? 'gracehill' : code === 'SCH-004' ? 'stmarys' : 'sunrise';
        data.parentEmail = `demo${i + 1}@${slug}.com`;
      }
      const student = await prisma.student.create({ data });
      studentIds.push(student.id);
      studentNames.push(`${first} ${last}`);
    }
    console.log(`  ${name}: ${studentIds.length} students`);
    totalStudents += studentIds.length;

    // Create grades
    let gradeCount = 0;
    for (let i = 0; i < studentIds.length; i++) {
      const cls = createdClasses[i % createdClasses.length];
      const classSubjects = allSubjects.filter(s => s.classId === cls.id);
      for (const subj of classSubjects) {
        const comps = genComponents();
        const total = calcTotal(comps);
        await prisma.grade.create({
          data: { studentId: studentIds[i], subjectId: subj.id, classId: cls.id, termId: activeTerm.id, score: total, grade: scoreToGrade(total), components: JSON.stringify(comps), remarks: '', schoolId }
        });
        gradeCount++;
      }
    }
    console.log(`  ${name}: ${gradeCount} grades`);
    totalGrades += gradeCount;

    // Transport routes
    const routeDefs = [
      { name: 'Route A', desc: 'Main route', stops: ['Stop 1', 'Stop 2', 'Stop 3'], driver: 'Driver A', phone: '+233201000001', cap: 30 },
      { name: 'Route B', desc: 'Secondary route', stops: ['Stop A', 'Stop B', 'Stop C'], driver: 'Driver B', phone: '+233201000002', cap: 25 },
    ];
    const routes = await Promise.all(routeDefs.map(r =>
      prisma.transportRoute.create({ data: { name: `${r.name} - ${name}`, description: r.desc, stops: JSON.stringify(r.stops), driverName: r.driver, driverPhone: r.phone, capacity: r.cap, status: 'active', schoolId } })
    ));

    // Staff
    const staffMembers = [
      { name: `Head ${name}`, email: `headteacher${userSuffix}`, phone: '+233201111111', role: 'Head Teacher', department: 'Administration', staffType: 'headteacher' },
      { name: `Admin ${name}`, email: `admin${userSuffix}`, phone: '+233202222222', role: 'Administrator', department: 'Administration', staffType: 'admin' },
      { name: `Accountant ${name}`, email: `accountant${userSuffix}`, phone: '+233203333333', role: 'Accountant', department: 'Finance', staffType: 'accountant' },
      { name: `Teacher A ${name}`, email: `teacher1${userSuffix}`, phone: '+233204444444', role: 'Class Teacher', department: 'Academics', staffType: 'teaching', assignedClass: createdClasses[0].name, assignedSubjects: JSON.stringify(['English', 'Mathematics']), assignedRouteId: routes[0].id, assignedRouteName: routes[0].name },
      { name: `Teacher B ${name}`, email: `teacher2${userSuffix}`, phone: '+233205555555', role: 'Subject Teacher', department: 'Academics', staffType: 'teaching', assignedClass: createdClasses[1].name, assignedSubjects: JSON.stringify(['Science', 'Mathematics']), assignedRouteId: routes[1].id, assignedRouteName: routes[1].name },
      { name: `Staff ${name}`, email: `nont${userSuffix}`, phone: '+233206666666', role: 'Librarian', department: 'Support', staffType: 'non-teaching' },
    ];
    for (const sm of staffMembers) {
      const cardUid = `STAFF-${code}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      const wristbandUid = sm.staffType === 'teaching' ? `WB-${code}-${Math.random().toString(16).slice(2, 8).toUpperCase()}` : undefined;
      await prisma.staff.create({ data: { ...sm, cardUid, wristbandUid, status: 'active', hireDate: '2020-01-01', schoolId } });
    }

    // Wallets
    let walletCount = 0;
    for (let i = 0; i < Math.min(10, studentCount); i++) {
      const uid = `EDU-${code}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      try {
        await prisma.studentWallet.create({
          data: { studentId: studentIds[i], studentName: studentNames[i], cardUid: uid, balance: Math.floor(Math.random() * 200) + 20, totalSpent: Math.floor(Math.random() * 100), schoolId }
        });
        walletCount++;
      } catch {}
    }
    console.log(`  ${name}: ${walletCount} wallets`);
    totalWallets += walletCount;

    // Attendance (past 10 school days)
    const now = new Date();
    let attCount = 0;
    for (let d = 10; d >= 1; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dateStr = date.toISOString().split('T')[0];
      for (let i = 0; i < studentIds.length; i++) {
        const status = Math.random() < 0.85 ? 'present' : (Math.random() < 0.5 ? 'absent' : 'late');
        const cls = createdClasses[i % createdClasses.length];
        await prisma.attendance.create({
          data: { studentId: studentIds[i], studentName: studentNames[i], classId: cls.id, className: cls.name, date: dateStr, status, schoolId }
        });
        attCount++;
      }
    }
    console.log(`  ${name}: ${attCount} attendance records`);
    totalAttendance += attCount;

    // Fees
    let feeCount = 0;
    for (let i = 0; i < studentIds.length; i++) {
      const amount = Math.floor(Math.random() * 30000) + 15000;
      const paid = Math.random() < 0.5 ? amount : Math.floor(Math.random() * amount);
      const status = paid >= amount ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
      await prisma.feeRecord.create({
        data: { studentId: studentIds[i], studentName: studentNames[i], amount, paid, balance: amount - paid, dueDate: '2026-07-15', status, schoolId }
      });
      feeCount++;
    }
    console.log(`  ${name}: ${feeCount} fee records`);
    totalFees += feeCount;

    // Tasks & Messages
    await Promise.all([
      prisma.task.create({ data: { title: 'Prepare exam timetable', description: 'End-of-term exam schedule', assignedTo: users[0].id, assignedBy: users[0].id, status: 'in_progress', priority: 'high', dueDate: '2026-06-20', schoolId } }),
      prisma.task.create({ data: { title: 'Update student records', description: 'Verify all student data', assignedTo: users[1].id, assignedBy: users[0].id, status: 'pending', priority: 'medium', dueDate: '2026-06-25', schoolId } }),
      prisma.task.create({ data: { title: 'Process fee payments', description: 'Reconcile fee balances', assignedTo: users[2].id, assignedBy: users[0].id, status: 'pending', priority: 'urgent', dueDate: '2026-06-15', schoolId } }),
    ]);
    await Promise.all([
      prisma.message.create({ data: { subject: 'Staff Meeting', body: 'All staff meeting Friday at 8:00 AM.', fromId: users[0].id, toId: users[1].id, read: false, schoolId } }),
      prisma.message.create({ data: { subject: 'Budget Approval', body: 'Please review Q3 budget.', fromId: users[2].id, toId: users[0].id, read: false, schoolId } }),
    ]);

    return { schoolId, schoolName: name, userSuffix };
  }

  // School 1: Demo International School (100 students)
  const s1 = await seedSchool({ code: 'SCH-001', name: 'Demo International School', userSuffix: '@school.com', studentCount: 100, plan: 'free' });

  // School 2: Riverside Academy (30 students)
  const s2 = await seedSchool({ code: 'SCH-002', name: 'Riverside Academy', userSuffix: '@riverside.com', studentCount: 30, plan: 'premium' });

  // School 3: Gracehill Academy (200 students)
  const s3 = await seedSchool({ code: 'SCH-003', name: 'Gracehill Academy', userSuffix: '@gracehill.com', studentCount: 200, plan: 'premium' });

  // School 4: St. Mary's International School (200 students)
  const s4 = await seedSchool({ code: 'SCH-004', name: "St. Mary's International School", userSuffix: '@stmarys.com', studentCount: 200, plan: 'free' });

  // School 5: Sunrise Preparatory School (200 students)
  const s5 = await seedSchool({ code: 'SCH-005', name: 'Sunrise Preparatory School', userSuffix: '@sunrise.com', studentCount: 200, plan: 'premium' });

  console.log('\nSeed complete!');
  console.log('School 1:', s1.schoolName, '(ID:', s1.schoolId, ')  — headteacher@school.com');
  console.log('School 2:', s2.schoolName, '(ID:', s2.schoolId, ')  — headteacher@riverside.com');
  console.log('School 3:', s3.schoolName, '(ID:', s3.schoolId, ')  — headteacher@gracehill.com');
  console.log('School 4:', s4.schoolName, '(ID:', s4.schoolId, ')  — headteacher@stmarys.com');
  console.log('School 5:', s5.schoolName, '(ID:', s5.schoolId, ')  — headteacher@sunrise.com');
  console.log('\nStudent demo logins (password: demo123):');
  console.log('  demo1@school.com    — Demo International School');
  console.log('  demo2@school.com    — Demo International School');
  console.log('  demo1@riverside.com  — Riverside Academy');
  console.log('  demo2@riverside.com  — Riverside Academy');
  console.log('  demo1@gracehill.com  — Gracehill Academy');
  console.log('  demo2@gracehill.com  — Gracehill Academy');
  console.log('  demo1@stmarys.com    — St. Mary\'s International');
  console.log('  demo2@stmarys.com    — St. Mary\'s International');
  console.log('  demo1@sunrise.com    — Sunrise Preparatory');
  console.log('  demo2@sunrise.com    — Sunrise Preparatory');
  console.log('\n(Use these emails at /parent/login or /student/login with password demo123)');
  console.log('Demo accounts (password: password123):');
  console.log('  headteacher, admin, accountant, teacher1, teacher2, nont @ each school\'s domain');
  console.log('\nStudent demo login (password: demo123):');
  console.log('  First 2 students in each school have parentPassword and student password set to "demo123".');
  console.log('  Parent login: /parent/login  —  Student login: /student/login');
  console.log('  Use the student\'s parentEmail with password "demo123".');
  console.log(`\nTotals: ${totalStudents} students, ${totalGrades} grades, ${totalWallets} wallets, ${totalAttendance} attendance, ${totalFees} fee records`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
