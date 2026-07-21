require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

const FIRST_NAMES = ['Kwame','Ama','Kofi','Akua','Yaw','Afua','Esi','Kojo','Abena','Nana','Adwoa','Yaa','Kwabena','Akosua','Kwesi','Efia','Kweku','Aba','Kobina','Adoma','Mensah','Serwaa','Ansah','Boatemaa','Owusu','Pokuah','Agyapong','Tiwaah','Asare','Maanu','Antwi','Sarpong','Opoku','Bonney','Boadi','Mintah','Yeboah','Peewah','Acheampong','Twum','Bediako','Dankwah','Mireku','Pomaah','Tuffour','Siaw','Apraku','Mfodwo','Otchere','Adomako','Sackey','Vanderpuye','Lartey','Nortey','Botchway','Acolatse','Tetteh','Quartey','Okine','Adjei','Sowah','Laryea','Amoako','Danso','Agyeman','Opoku','Boakye','Ntim','Sarpong','Frimpong','Gyamfi','Osei','Asante','Boadu','Bonsu','Nyarko','Fosu','Acheampong','Obeng','Twumasi','Ampofo','Afriyie','Darkwah','Donkor','Asamoah','Kwarteng','Ennin','Mintah','Awere','Tawiah','Mensah','Quayson','Coffie','Armah','Nkrumah','Sai','Awuah','Adjei','Sakyi','Debrah','Ayensu','Sam','Biney','Selorm','Enyonam','Mawunyo','Sika','Nubuke','Dzifa','Amen','Eyram','Delali','Akpe','Avenu','Sedinam','Kafui','Senanu','Klenam','Gameli','Manu','Gifty','Eunice','Dorcas','Patience','Comfort','Prosper','Blessing','Noble','Prince','King','Queen','Richmond','Ekow','Ebo','Ewurafua','Ewurabena','Nhyira','NanaYaw','NanaAma','NanaKwame'];

const LAST_NAMES = ['Mensah','Asante','Osei','Boadu','Adjei','Sarpong','Frimpong','Opoku','Agyeman','Boakye','Owusu','Danso','Amoako','Donkor','Ansah','Asare','Nkrumah','Nyarko','Fosu','Bonsu','Twumasi','Kwarteng','Sakyi','Afriyie','Darkwah','Asamoah','Lartey','Tetteh','Quartey','Botchway','Armah','Coffie','Acolatse','Sackey','Sowah','Laryea','Vanderpuye','Adomako','Okine','Tuffour','Akoto','Annan','Aryee','Attoh','Baah','Bamfo','Bannerman','Bediako','Bortey','Crabbe','Dakwa','Darpoh','Debrah','Djokoto','Dzokoto','Eduful','Gbeho','Hagan','Hammond','Hunusu','Insah','Jectey','Kumi','Lamptey','Mantey','Nartey','Nortey','Ocran','Odonkor','Ofori','Paintsil','Quao','Quaye','Quist','Sagoe','Sam','Tamakloe','Tay','Tettegah','Thompson','Tsatsu','Tsegah','Vormawah','Woode','Yankah','Zanu','Mireku','Ntim','Obeng','Pomaah','Awuah','Siaw','Biney','Ennin','Agboada','Ahadzi','Akotia','Alifo','Amegashie','Asigbey','Atisu','Atsu','Baban','Badu','Bamfo','Bansah','Bonsra','Denteh','Dosoo','Dovlo','Dzamesi','Fianko','Gbormittah','Hlordzi','Hormenu','Kpodo','Kudomor','Kumordzie','Lomotey','Mawutor','Nunoo','Ocansey','Ofori','Ohene','Okaiteye','Okantah','Otoo','Quarcoo','Samen','Sekyi','Tawiah','Torto','Tsekpo','Tsikata','Wiafe','Wornyo','Yeboah','Ababio','Acquah','Adade','Adjeley','Adom','Aflakpui','Aglomasa','Ahia','Amedume','Amenyakpor','Angmortey','Ankrah','Appiah','Arhin','Arko','Armah','Arthur','Arthiabah','Aryee','Asante','Ashong','Asiedu','Asmah','Atiemo','Atuguba','Awortwi','Badu','Baffoe','Bamfo','Bannerman','Barning','Bartels','Beads','Bediako','Bentil','Blay','Boateng','Boatin','Boni','Bonney','Bortei','Bortey','Bosiako','Botwe','Bowie','Boye','Boye-Doe','Bruce','Bruku','Buami','Budu','Buer','Carr','Carson','Casely-Hayford','Cato','Cattrysse','Chinery','Chinbuah','Churcher','Clottey','Cofie','Coleman','Crabbe','Crentsil','Cudjoe','Cupidon','Dade','Dadzie','Dakwa','Damoah','Danquah','Danso','Darkey','Darko','Darpoh','Debrah','Dei','Deku','Denkyi','Depar','Derban','Dery','Dey','Djabanor','Djokoto','Dodor','Doe','Donkor','Dontoh','Dordunu','Dornoo','Dosoo','Dotse','Drake','Druye','Dua','Duedu','Dumor','Dunyo','Dzah','Dzansi','Dzapong','Dzegah','Dzeketey','Dzietror','Dzikunu','Dzokoto','Dzreke','Eduful','Egyir','Eklemet','Ekumah','Ellimah','Eloghosa','Enimil','Ennin','Ennini','Entsua-Mensah','Ephirim','Eshun','Essah','Essel','Evans','Ewool','Fianko','Fiase','Fobi','Folitse','Fosu','Frimpong','Fugah','Fuseini','Gaba','Gadzekpo','Gaisie','Gakpo','Gamor','Gan','Gbade','Gbeho','Gbemu','Gbordzor','Ghartey','Glah','Glover','Gogo','Goka','Gomashie','Gorleku','Gorry','Goto','Donkor','Ntow'];
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

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function componentScore() { return Math.floor(Math.random() * 51) + 50; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function genComponents() {
  const ce = clamp(Math.floor(Math.random() * 6) + 4, 0, 10);
  const hw = clamp(Math.floor(Math.random() * 6) + 4, 0, 10);
  const qz = clamp(Math.floor(Math.random() * 16) + 12, 0, 30);
  const mt = clamp(Math.floor(Math.random() * 11) + 8, 0, 20);
  const ex = clamp(Math.floor(Math.random() * 16) + 12, 0, 30);
  return { classExercise: ce, homework: hw, quiz: qz, midterm: mt, exam: ex };
}
function calcTotal(c) { return c.classExercise + c.homework + c.quiz + c.midterm + c.exam; }
function scoreToGrade(total) {
  if (total >= 80) return 'A'; if (total >= 70) return 'B'; if (total >= 60) return 'C';
  if (total >= 50) return 'D'; if (total >= 40) return 'E'; return 'F';
}

function generateSchoolCode(index) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'SCH-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const SCHOOL_NAMES = [
  'Accra International School', 'Kumasi Heights Academy', 'Cape Coast Grammar School', 'Takoradi Methodist School',
  'Tamale Islamic School', 'Tema Harbour School', 'Koforidua Technical Academy', 'Sunyani Preparatory School',
  'Ho Volta School', 'Bolgatanga Star School', 'Wa Islamic Academy', 'Sekondi College',
  'Winneba Teachers School', 'Obuasi Goldfields School', 'Nkawkaw Central School', 'Mampong Agricultural School',
  'Keta Lagoon School', 'Aflao Border Academy', 'Akosombo International', 'Tarkwa Mining School',
];

const SCHOOL_CITIES = ['Accra', 'Kumasi', 'Cape Coast', 'Takoradi', 'Tamale', 'Tema', 'Koforidua', 'Sunyani', 'Ho', 'Bolgatanga', 'Wa', 'Sekondi', 'Winneba', 'Obuasi', 'Nkawkaw', 'Mampong', 'Keta', 'Aflao', 'Akosombo', 'Tarkwa'];

async function main() {
  console.log('Seeding 20 schools with large student populations...\n');

  const superHash = await bcrypt.hash('superadmin123', 10);
  await prisma.superAdmin.upsert({
    where: { email: 'super@eduplatform.com' },
    update: {},
    create: { email: 'super@eduplatform.com', password: superHash, name: 'Super Admin', role: 'owner' },
  });

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  const tables = ['Submission','Assignment','TimetableSlot','StaffAttendance','PrivacyConsent','StudentReport','CardOrder','Transaction','StudentWallet','Grade','Attendance','FeeRecord','Notification','Message','Announcement','TaskComment','Task','Subject','Term','AcademicClass','Campus','Staff','User','Student','TransportRoute','AuditLog','PushSubscription','InventoryAssignment','InventoryItem','LessonPlan','Campaign','ConferenceBooking','ConferenceSlot','BedAllocation','Room','Hostel','BookLoan','Book','Incident','ExamSubmission','Question','Exam','Alumni','AIConversation','Feedback'];
  for (const t of tables) {
    try { await prisma[t].deleteMany({}); } catch {}
  }
  try { await prisma.subscription.deleteMany({}); } catch {}
  try { await prisma.school.deleteMany({}); } catch {}
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  const hash = await bcrypt.hash('password123', 10);
  const demoHash = await bcrypt.hash('demo123', 10);
  let totalStudents = 0, totalStaff = 0, totalGrades = 0;

  for (let schoolIdx = 0; schoolIdx < 20; schoolIdx++) {
    const code = generateSchoolCode(schoolIdx);
    const name = SCHOOL_NAMES[schoolIdx];
    const city = SCHOOL_CITIES[schoolIdx];
    const studentCount = 2000;
    const teachStaff = Math.max(20, Math.ceil(studentCount / 28));
    const nonTeachStaff = Math.max(5, Math.ceil(studentCount / 80));
    const totalStaffCount = teachStaff + nonTeachStaff + 3;

    console.log(`[${schoolIdx + 1}/20] ${name} — ${studentCount} students, ${totalStaffCount} staff`);

    const school = await prisma.school.create({ data: { code, name, address: `${Math.floor(Math.random() * 50) + 1} ${city} Road, ${city}` } });
    const schoolId = school.id;

    // Create staff user accounts (login accounts)
    const users = [
      await prisma.user.create({ data: { email: `headteacher${schoolIdx + 1}@demo.school`, password: hash, name: `Head Teacher - ${name}`, role: 'headteacher', schoolId } }),
      await prisma.user.create({ data: { email: `admin${schoolIdx + 1}@demo.school`, password: hash, name: `Admin - ${name}`, role: 'admin', schoolId } }),
      await prisma.user.create({ data: { email: `accountant${schoolIdx + 1}@demo.school`, password: hash, name: `Accountant - ${name}`, role: 'accountant', schoolId } }),
    ];

    await prisma.subscription.create({ data: { schoolId, plan: 'premium', status: 'active', studentLimit: 15000, staffLimit: 1000 } });

    // Classes
    const createdClasses = [];
    for (const section of SECTIONS) {
      for (const cname of CLASS_NAMES_BY_SECTION[section]) {
        createdClasses.push(await prisma.academicClass.create({
          data: { name: `${section} - ${cname}`, section, teacher: 'Unassigned', schoolId },
        }));
      }
    }

    // Subjects
    const allSubjects = [];
    for (const cls of createdClasses) {
      const section = SECTIONS.find(s => cls.name.startsWith(s)) || 'Junior High';
      const subjectDefs = SUBJECTS_BY_SECTION[section] || SUBJECTS_BY_SECTION['Junior High'];
      for (const [subjName, subjCode] of subjectDefs) {
        allSubjects.push(await prisma.subject.create({
          data: { name: subjName, code: `${subjCode}-${cls.name.replace(/\s+/g, '')}`, teacher: 'Unassigned', classId: cls.id, schoolId },
        }));
      }
    }

    // Terms
    await Promise.all([
      prisma.term.create({ data: { name: 'Term 1', academicYear: '2026', startDate: '2026-01-15', endDate: '2026-04-11', isActive: false, schoolId } }),
      prisma.term.create({ data: { name: 'Term 2', academicYear: '2026', startDate: '2026-05-06', endDate: '2026-08-15', isActive: true, schoolId } }),
      prisma.term.create({ data: { name: 'Term 3', academicYear: '2026', startDate: '2026-09-02', endDate: '2026-12-05', isActive: false, schoolId } }),
    ]);
    const activeTerm = await prisma.term.findFirst({ where: { schoolId, isActive: true } });

    // Assignments
    const assignmentDefs = [
      { title: 'Mathematics Homework', description: 'Solve problems from Chapter 5', dueDate: '2026-06-28', totalPoints: 20 },
      { title: 'English Essay', description: 'Write about your role model', dueDate: '2026-07-05', totalPoints: 30 },
      { title: 'Science Project', description: 'Model of the solar system', dueDate: '2026-07-12', totalPoints: 25 },
    ];
    for (const cls of createdClasses.slice(0, 4)) {
      for (const def of assignmentDefs) {
        await prisma.assignment.create({ data: { ...def, classId: cls.id, schoolId, createdBy: users[0].id } });
      }
    }

    // Transport routes
    const routeDefs = [
      { name: `Route A - ${name}`, description: 'Main route', stops: JSON.stringify(['Central Station', 'Market Square', 'School Gate']), driverName: `Driver A ${name}`, driverPhone: `+233201${String(100001 + schoolIdx)}`, capacity: 60, status: 'active', schoolId },
      { name: `Route B - ${name}`, description: 'Secondary route', stops: JSON.stringify(['Station', 'Junction', 'School']), driverName: `Driver B ${name}`, driverPhone: `+233202${String(100001 + schoolIdx)}`, capacity: 45, status: 'active', schoolId },
    ];
    const routes = await Promise.all(routeDefs.map(r => prisma.transportRoute.create({ data: r })));

    // Staff records
    const staffEntries = [];
    staffEntries.push({ name: `Head Teacher - ${name}`, email: `headteacher${schoolIdx + 1}@demo.school`, phone: `+233200${String(100001 + schoolIdx)}`, role: 'Head Teacher / Principal', department: 'Administration', staffType: 'headteacher', status: 'active', hireDate: '2020-01-01' });
    staffEntries.push({ name: `Admin - ${name}`, email: `admin${schoolIdx + 1}@demo.school`, phone: `+233200${String(200001 + schoolIdx)}`, role: 'School Administrator', department: 'Administration', staffType: 'admin', status: 'active', hireDate: '2020-01-01' });
    staffEntries.push({ name: `Accountant - ${name}`, email: `accountant${schoolIdx + 1}@demo.school`, phone: `+233200${String(300001 + schoolIdx)}`, role: 'Accountant', department: 'Finance', staffType: 'accountant', status: 'active', hireDate: '2020-01-01' });

    const shuffledFirst = shuffle(FIRST_NAMES);
    const shuffledLast = shuffle(LAST_NAMES);
    const teacherNames = [];
    for (let t = 0; t < teachStaff; t++) {
      const first = shuffledFirst[t % shuffledFirst.length];
      const last = shuffledLast[Math.floor(t / shuffledFirst.length) % shuffledLast.length];
      teacherNames.push(`${first} ${last}`);
      const cls = createdClasses[t % createdClasses.length];
      const subj = allSubjects.filter(s => s.classId === cls.id);
      const assignedSubjects = subj.slice(0, Math.min(3, subj.length)).map(s => s.name);
      staffEntries.push({
        name: `${first} ${last}`, email: `teacher.${t}.s${schoolIdx}@demo.school`,
        phone: `+23324${String(100000 + t + schoolIdx * 1000).slice(0, 9)}`,
        role: t % 2 === 0 ? 'Class Teacher' : 'Subject Teacher',
        department: 'Academics',
        staffType: 'teaching',
        assignedClass: t < 20 ? cls.name : undefined,
        assignedSubjects: assignedSubjects,
        assignedRouteId: t % 2 === 0 ? routes[0].id : undefined,
        assignedRouteName: t % 2 === 0 ? routes[0].name : undefined,
        status: 'active', hireDate: '2020-01-01',
      });
    }

    for (let nt = 0; nt < nonTeachStaff; nt++) {
      const first = shuffledFirst[(teachStaff + nt) % shuffledFirst.length];
      const last = shuffledLast[Math.floor((teachStaff + nt) / shuffledFirst.length) % shuffledLast.length];
      const roles = ['Librarian', 'Secretary', 'Groundskeeper', 'Security', 'Cleaner', 'Cook', 'Lab Assistant', 'IT Support', 'Driver', 'Nurse'];
      staffEntries.push({
        name: `${first} ${last}`, email: `nont.${nt}.s${schoolIdx}@demo.school`,
        phone: `+23325${String(100000 + nt + schoolIdx * 1000).slice(0, 9)}`,
        role: roles[nt % roles.length],
        department: 'Support',
        staffType: 'non-teaching',
        status: 'active', hireDate: '2020-01-01',
      });
    }

    for (let si = 0; si < staffEntries.length; si++) {
      const se = staffEntries[si];
      const cardUid = `STAFF-${code}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      await prisma.staff.create({
        data: {
          ...se,
          indexNumber: `${code}-STF-${String(si + 1).padStart(4, '0')}`,
          cardUid,
          assignedSubjects: se.assignedSubjects ? JSON.stringify(se.assignedSubjects) : undefined,
          schoolId,
        },
      });
    }
    totalStaff += staffEntries.length;

    // Generate students
    const studentIds = [];
    const studentNames = [];
    const batchSize = 2000;
    for (let batchStart = 0; batchStart < studentCount; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, studentCount);
      const batchData = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const cls = createdClasses[i % createdClasses.length];
        const first = shuffledFirst[i % shuffledFirst.length];
        const last = shuffledLast[Math.floor(i / shuffledFirst.length) % shuffledLast.length];
        const parentFirst = pickRandom(FIRST_NAMES);
        const parentLast = pickRandom(LAST_NAMES);
        const email = `${first.toLowerCase()}.${last.toLowerCase()}.s${schoolIdx}${i}@student.demo`;
        const gender = i % 2 === 0 ? 'male' : 'female';
        const dob = `${2010 + (i % 8)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
        batchData.push({
          indexNumber: `${code}-STU-${String(i + 1).padStart(5, '0')}`,
          firstName: first, lastName: last, email,
          classId: cls.id, className: cls.name,
          dateOfBirth: dob, gender,
          photoUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${first}${last}s${schoolIdx}${i}`,
          parentName: `${parentFirst} ${parentLast}`,
          parentPhone: `+233${String(200000000 + i + schoolIdx * 100000).slice(0, 9)}`,
          parentEmail: `parent.${i}.s${schoolIdx}@demo.com`,
          enrollmentDate: '2025-09-01', status: 'active', schoolId,
        });
      }
      for (const sd of batchData) {
        const student = await prisma.student.create({ data: sd });
        studentIds.push(student.id);
        studentNames.push(`${sd.firstName} ${sd.lastName}`);
      }
    }
    totalStudents += studentIds.length;

    // Wallets (first 50 students)
    for (let i = 0; i < Math.min(50, studentCount); i++) {
      const uid = `EDU-${code}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      try {
        await prisma.studentWallet.create({
          data: { studentId: studentIds[i], studentName: studentNames[i], cardUid: uid, balance: Math.floor(Math.random() * 200) + 20, totalSpent: Math.floor(Math.random() * 100), schoolId },
        });
      } catch {}
    }

    // Grades (sample — all students, all subjects for their class)
    let gCount = 0;
    for (let i = 0; i < studentIds.length; i++) {
      const cls = createdClasses[i % createdClasses.length];
      const classSubjects = allSubjects.filter(s => s.classId === cls.id);
      for (const subj of classSubjects) {
        const comps = genComponents();
        const total = calcTotal(comps);
        await prisma.grade.create({
          data: { studentId: studentIds[i], subjectId: subj.id, classId: cls.id, termId: activeTerm.id, score: total, grade: scoreToGrade(total), components: JSON.stringify(comps), remarks: '', schoolId },
        });
        gCount++;
      }
    }
    totalGrades += gCount;

    // Attendance (past 5 school days — sample for performance)
    const now = new Date();
    let aCount = 0;
    for (let d = 5; d >= 1; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dateStr = date.toISOString().split('T')[0];
      const sampleSize = Math.min(500, studentIds.length);
      const sampleIndices = new Set();
      while (sampleIndices.size < sampleSize) sampleIndices.add(Math.floor(Math.random() * studentIds.length));
      for (const idx of sampleIndices) {
        const status = Math.random() < 0.85 ? 'present' : (Math.random() < 0.5 ? 'absent' : 'late');
        const cls = createdClasses[idx % createdClasses.length];
        try {
          await prisma.attendance.create({
            data: { studentId: studentIds[idx], studentName: studentNames[idx], classId: cls.id, className: cls.name, date: dateStr, status, schoolId },
          });
          aCount++;
        } catch {}
      }
    }

    // Fees (first 300 students)
    for (let i = 0; i < Math.min(300, studentCount); i++) {
      const amount = Math.floor(Math.random() * 30000) + 15000;
      const paid = Math.random() < 0.5 ? amount : Math.floor(Math.random() * amount);
      const status = paid >= amount ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
      await prisma.feeRecord.create({
        data: { studentId: studentIds[i], studentName: studentNames[i], amount, paid, balance: amount - paid, dueDate: '2026-07-15', status, schoolId },
      });
    }

    // Tasks & Messages
    await Promise.all([
      prisma.task.create({ data: { title: 'Prepare exam timetable', description: 'End-of-term exam schedule for ' + name, assignedTo: users[0].id, assignedBy: users[0].id, status: 'in_progress', priority: 'high', dueDate: '2026-06-20', schoolId } }),
      prisma.task.create({ data: { title: 'Update student records', description: 'Verify all student data for ' + name, assignedTo: users[1].id, assignedBy: users[0].id, status: 'pending', priority: 'medium', dueDate: '2026-06-25', schoolId } }),
      prisma.task.create({ data: { title: 'Process fee payments', description: 'Reconcile fee balances', assignedTo: users[2].id, assignedBy: users[0].id, status: 'pending', priority: 'urgent', dueDate: '2026-06-15', schoolId } }),
    ]);

    // Library books
    const bookGenres = ['Mathematics', 'English', 'Science', 'Social Studies', 'ICT', 'Ghanaian Language', 'History', 'Geography'];
    for (const genre of bookGenres) {
      await prisma.book.create({
        data: { schoolId, title: `${genre} Textbook - ${name}`, author: 'EDUPLATFORM SOFTWARE SERVICES', isbn: `978-${schoolIdx}${Math.floor(Math.random() * 1000000000)}`, category: 'Textbook', quantity: 20, availableQuantity: 20, shelfLocation: `Shelf-${Math.floor(Math.random() * 20)}` },
      });
    }

    // Hostel
    const hostel = await prisma.hostel.create({ data: { schoolId, name: `${name} Hostel`, gender: 'mixed', warden: `Mr./Ms. ${pickRandom(LAST_NAMES)}`, capacity: 200 } });
    for (let i = 1; i <= 20; i++) {
      await prisma.room.create({ data: { schoolId, hostelId: hostel.id, roomNumber: `Room ${i}`, capacity: 4, gender: 'mixed' } });
    }

    // Inventory
    const invItems = ['Whiteboard Markers', 'Chairs', 'Desks', 'Projector', 'Laptop', 'Printer', 'Textbooks', 'Sports Equipment', 'Lab Equipment', 'Stationery'];
    for (const item of invItems) {
      await prisma.inventoryItem.create({ data: { schoolId, name: item, category: Math.random() > 0.5 ? 'Supplies' : 'Equipment', quantity: Math.floor(Math.random() * 100) + 10, location: pickRandom(['Store Room', 'Library', 'Staff Room', 'Lab', 'Office']), status: 'available' } });
    }

    // Timetable (for first 6 classes)
    const periods = [
      { start:'08:00', end:'08:45' }, { start:'08:45', end:'09:30' }, { start:'09:45', end:'10:30' },
      { start:'10:30', end:'11:15' }, { start:'11:30', end:'12:15' }, { start:'12:15', end:'13:00' },
      { start:'14:00', end:'14:45' }, { start:'14:45', end:'15:30' },
    ];
    for (const cls of createdClasses.slice(0, 6)) {
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < 4; p++) {
          const subj = allSubjects.filter(s => s.classId === cls.id);
          try {
            await prisma.timetableSlot.create({
              data: { schoolId, classId: cls.id, dayOfWeek: d, startTime: periods[p].start, endTime: periods[p].end, subjectId: subj[p % subj.length]?.id, room: `Room ${100 + p}` },
            });
          } catch {}
        }
      }
    }

    console.log(`  ✓ Staff: ${staffEntries.length}, Grades: ${gCount}, Attendance: ${aCount} (sample)`);
  }

  console.log('\n=== SEED COMPLETE ===');
  console.log(`Total: ${totalStudents} students, ${totalStaff} staff, ${totalGrades} grades across 20 schools`);
  console.log('\nDemo login credentials (password: password123):');
  for (let i = 0; i < 20; i++) {
    console.log(`  School ${i + 1}: headteacher${i + 1}@demo.school | admin${i + 1}@demo.school | accountant${i + 1}@demo.school`);
  }
  console.log('\nSuper Admin: super@eduplatform.com / superadmin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
