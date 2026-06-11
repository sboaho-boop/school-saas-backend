require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database...');

  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.message.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.feeRecord.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.academicClass.deleteMany();
  await prisma.term.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.student.deleteMany();
  await prisma.transportRoute.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('password123', 10);

  const users = await Promise.all([
    prisma.user.create({ data: { email: 'headteacher@school.com', password: hash, name: 'John Kamau', role: 'headteacher' } }),
    prisma.user.create({ data: { email: 'admin@school.com', password: hash, name: 'Sarah Admin', role: 'admin' } }),
    prisma.user.create({ data: { email: 'accountant@school.com', password: hash, name: 'James Mwangi', role: 'accountant' } }),
    prisma.user.create({ data: { email: 'teacher1@school.com', password: hash, name: 'Grace Akinyi', role: 'teaching' } }),
    prisma.user.create({ data: { email: 'teacher2@school.com', password: hash, name: 'Peter Ochieng', role: 'teaching' } }),
    prisma.user.create({ data: { email: 'nont@school.com', password: hash, name: 'Alice Wanjiku', role: 'non-teaching' } }),
  ]);

  const classes = await Promise.all([
    prisma.academicClass.create({ data: { name: 'Grade 1 - Section A', section: 'Primary', teacher: 'Grace Akinyi' } }),
    prisma.academicClass.create({ data: { name: 'Grade 2 - Section B', section: 'Primary', teacher: 'Peter Ochieng' } }),
    prisma.academicClass.create({ data: { name: 'Grade 3 - Section A', section: 'Primary', teacher: 'Unassigned' } }),
    prisma.academicClass.create({ data: { name: 'Grade 4 - Section B', section: 'Primary', teacher: 'Unassigned' } }),
  ]);

  const students = await Promise.all([
    prisma.student.create({ data: { firstName: 'Brian', lastName: 'Omondi', email: 'brian.omondi@student.com', classId: classes[0].id, className: 'Grade 1 - Section A', dateOfBirth: '2018-05-12', gender: 'male', parentName: 'David Omondi', parentPhone: '+254712345678', parentEmail: 'david@example.com', enrollmentDate: '2025-01-15', status: 'active' } }),
    prisma.student.create({ data: { firstName: 'Mary', lastName: 'Wambui', email: 'mary.wambui@student.com', classId: classes[0].id, className: 'Grade 1 - Section A', dateOfBirth: '2018-08-22', gender: 'female', parentName: 'Samuel Wambui', parentPhone: '+254723456789', parentEmail: 'samuel@example.com', enrollmentDate: '2025-01-15', status: 'active' } }),
    prisma.student.create({ data: { firstName: 'Kevin', lastName: 'Njenga', email: 'kevin.njenga@student.com', classId: classes[0].id, className: 'Grade 1 - Section A', dateOfBirth: '2018-03-01', gender: 'male', parentName: 'Paul Njenga', parentPhone: '+254734567890', parentEmail: 'paul@example.com', enrollmentDate: '2025-01-15', status: 'active' } }),
    prisma.student.create({ data: { firstName: 'Diana', lastName: 'Chepkoech', email: 'diana.chepkoech@student.com', classId: classes[1].id, className: 'Grade 2 - Section B', dateOfBirth: '2017-11-30', gender: 'female', parentName: 'Joseph Chepkoech', parentPhone: '+254745678901', parentEmail: 'joseph@example.com', enrollmentDate: '2025-01-15', status: 'active' } }),
    prisma.student.create({ data: { firstName: 'Eliud', lastName: 'Kipchoge', email: 'eliud.kipchoge@student.com', classId: classes[1].id, className: 'Grade 2 - Section B', dateOfBirth: '2017-07-14', gender: 'male', parentName: 'Henry Kipchoge', parentPhone: '+254756789012', parentEmail: 'henry@example.com', enrollmentDate: '2025-01-15', status: 'active' } }),
  ]);

  const routes = await Promise.all([
    prisma.transportRoute.create({ data: { name: 'Route A - City Center', description: 'Covers CBD, Railway Station, and Town Hall area', stops: JSON.stringify(['City Center', 'Railway Station', 'Town Hall', 'Kenyatta Ave']), driverName: 'Grace Akinyi', driverPhone: '+254712345600', capacity: 30, status: 'active' } }),
    prisma.transportRoute.create({ data: { name: 'Route B - Westlands', description: 'Covers Westlands, Highridge, and Kangemi', stops: JSON.stringify(['Westlands', 'Highridge', 'Kangemi', 'Mountain View']), driverName: 'Peter Ochieng', driverPhone: '+254712345601', capacity: 25, status: 'active' } }),
    prisma.transportRoute.create({ data: { name: 'Route C - Eastlands', description: 'Covers Eastlands, Makadara, and Buru Buru', stops: JSON.stringify(['Eastlands', 'Makadara', 'Buru Buru', 'Komarock']), driverName: 'Unassigned', driverPhone: '', capacity: 35, status: 'active' } }),
  ]);

  const staffMembers = await Promise.all([
    prisma.staff.create({ data: { name: 'John Kamau', email: 'headteacher@school.com', phone: '+254722111111', role: 'Head Teacher', department: 'Administration', staffType: 'headteacher', status: 'active', hireDate: '2020-01-01' } }),
    prisma.staff.create({ data: { name: 'Sarah Admin', email: 'admin@school.com', phone: '+254722222222', role: 'Administrator', department: 'Administration', staffType: 'admin', status: 'active', hireDate: '2021-03-15' } }),
    prisma.staff.create({ data: { name: 'James Mwangi', email: 'accountant@school.com', phone: '+254722333333', role: 'Accountant', department: 'Finance', staffType: 'accountant', status: 'active', hireDate: '2022-06-01' } }),
    prisma.staff.create({ data: { name: 'Grace Akinyi', email: 'teacher1@school.com', phone: '+254722444444', role: 'Class Teacher', department: 'Academics', staffType: 'teaching', assignedClass: 'Grade 1 - Section A', assignedSubjects: JSON.stringify(['Mathematics', 'English']), assignedRouteId: routes[0].id, assignedRouteName: routes[0].name, status: 'active', hireDate: '2023-01-10' } }),
    prisma.staff.create({ data: { name: 'Peter Ochieng', email: 'teacher2@school.com', phone: '+254722555555', role: 'Subject Teacher', department: 'Academics', staffType: 'teaching', assignedClass: 'Grade 2 - Section B', assignedSubjects: JSON.stringify(['Science', 'Mathematics']), assignedRouteId: routes[1].id, assignedRouteName: routes[1].name, status: 'active', hireDate: '2023-02-20' } }),
    prisma.staff.create({ data: { name: 'Alice Wanjiku', email: 'nont@school.com', phone: '+254722666666', role: 'Librarian', department: 'Support', staffType: 'non-teaching', status: 'active', hireDate: '2024-09-01' } }),
  ]);

  await Promise.all([
    prisma.feeRecord.create({ data: { studentId: students[0].id, studentName: 'Brian Omondi', amount: 45000, paid: 45000, balance: 0, dueDate: '2026-04-30', status: 'paid' } }),
    prisma.feeRecord.create({ data: { studentId: students[1].id, studentName: 'Mary Wambui', amount: 45000, paid: 25000, balance: 20000, dueDate: '2026-04-30', status: 'partial' } }),
    prisma.feeRecord.create({ data: { studentId: students[2].id, studentName: 'Kevin Njenga', amount: 45000, paid: 0, balance: 45000, dueDate: '2026-04-30', status: 'unpaid' } }),
    prisma.feeRecord.create({ data: { studentId: students[3].id, studentName: 'Diana Chepkoech', amount: 50000, paid: 50000, balance: 0, dueDate: '2026-04-30', status: 'paid' } }),
    prisma.feeRecord.create({ data: { studentId: students[4].id, studentName: 'Eliud Kipchoge', amount: 50000, paid: 10000, balance: 40000, dueDate: '2026-05-15', status: 'partial' } }),
  ]);

  await Promise.all([
    prisma.subject.create({ data: { name: 'Mathematics', code: 'MATH01', teacher: 'Grace Akinyi', classId: classes[0].id } }),
    prisma.subject.create({ data: { name: 'English', code: 'ENG01', teacher: 'Grace Akinyi', classId: classes[0].id } }),
    prisma.subject.create({ data: { name: 'Science', code: 'SCI01', teacher: 'Peter Ochieng', classId: classes[1].id } }),
    prisma.subject.create({ data: { name: 'Mathematics', code: 'MATH02', teacher: 'Peter Ochieng', classId: classes[1].id } }),
  ]);

  await Promise.all([
    prisma.term.create({ data: { name: 'Term 1', academicYear: '2026', startDate: '2026-01-15', endDate: '2026-04-11', isActive: false } }),
    prisma.term.create({ data: { name: 'Term 2', academicYear: '2026', startDate: '2026-05-06', endDate: '2026-08-15', isActive: true } }),
    prisma.term.create({ data: { name: 'Term 3', academicYear: '2026', startDate: '2026-09-02', endDate: '2026-12-05', isActive: false } }),
  ]);

  await Promise.all([
    prisma.task.create({ data: { title: 'Prepare exam timetable', description: 'Draft the end-of-term exam schedule for all grades', assignedTo: users[0].id, assignedBy: users[0].id, status: 'in_progress', priority: 'high', dueDate: '2026-06-20' } }),
    prisma.task.create({ data: { title: 'Update student records', description: 'Ensure all new student data is entered correctly', assignedTo: users[1].id, assignedBy: users[0].id, status: 'pending', priority: 'medium', dueDate: '2026-06-25' } }),
    prisma.task.create({ data: { title: 'Process fee payments', description: 'Reconcile outstanding fee balances', assignedTo: users[2].id, assignedBy: users[0].id, status: 'pending', priority: 'urgent', dueDate: '2026-06-15' } }),
    prisma.task.create({ data: { title: 'Grade 1 lesson plans', description: 'Submit weekly lesson plans for Mathematics and English', assignedTo: users[3].id, assignedBy: users[0].id, status: 'completed', priority: 'medium', dueDate: '2026-06-10' } }),
  ]);

  await Promise.all([
    prisma.message.create({ data: { subject: 'Staff Meeting Friday', body: 'Reminder: All staff meeting this Friday at 8:00 AM in the staffroom.', fromId: users[0].id, toId: users[1].id, read: false } }),
    prisma.message.create({ data: { subject: 'Budget Approval Needed', body: 'Please review and approve the Q3 budget.', fromId: users[2].id, toId: users[0].id, read: false } }),
    prisma.message.create({ data: { subject: 'Class Trip Proposal', body: 'I would like to propose a science class trip to the museum.', fromId: users[4].id, toId: users[0].id, read: true } }),
  ]);

  await Promise.all([
    prisma.announcement.create({ data: { title: 'School Closed for Mid-Term Break', body: 'The school will be closed from August 12-16 for mid-term break.', authorId: users[0].id, priority: 'high' } }),
    prisma.announcement.create({ data: { title: 'New Library Hours', body: 'The library will now remain open until 5:00 PM on weekdays.', authorId: users[1].id, priority: 'normal' } }),
  ]);

  await Promise.all([
    prisma.notification.create({ data: { userId: users[0].id, type: 'fee_reminder', title: 'Fee Deadline', message: 'Term 2 fee payment deadline is June 30th.', read: false } }),
    prisma.notification.create({ data: { userId: users[3].id, type: 'task_deadline', title: 'Task Due Soon', message: 'Your lesson plans are due in 3 days.', read: false } }),
  ]);

  await Promise.all([
    prisma.attendance.create({ data: { studentId: students[0].id, studentName: 'Brian Omondi', classId: classes[0].id, className: 'Grade 1 - Section A', date: '2026-06-09', status: 'present' } }),
    prisma.attendance.create({ data: { studentId: students[1].id, studentName: 'Mary Wambui', classId: classes[0].id, className: 'Grade 1 - Section A', date: '2026-06-09', status: 'present' } }),
    prisma.attendance.create({ data: { studentId: students[2].id, studentName: 'Kevin Njenga', classId: classes[0].id, className: 'Grade 1 - Section A', date: '2026-06-09', status: 'absent' } }),
  ]);

  console.log('Seed complete!');
  console.log('Demo accounts (password: password123):');
  console.log('  headteacher@school.com');
  console.log('  admin@school.com');
  console.log('  accountant@school.com');
  console.log('  teacher1@school.com');
  console.log('  teacher2@school.com');
  console.log('  nont@school.com');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
