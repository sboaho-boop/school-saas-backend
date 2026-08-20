const prisma = require('./prisma');

async function resolveAudience(schoolId, audience, filter = {}) {
  switch (audience) {
    case 'all':
      return resolveAllUsers(schoolId);
    case 'all_parents':
      return resolveAllParents(schoolId);
    case 'all_staff':
      return resolveAllStaff(schoolId);
    case 'all_students':
      return resolveAllStudents(schoolId);
    case 'teaching_staff':
      return resolveUsersByStaffType(schoolId, 'teaching');
    case 'non_teaching_staff':
      return resolveUsersByStaffType(schoolId, 'non-teaching');
    case 'admins':
      return resolveUsersByRole(schoolId, ['headteacher', 'admin']);
    case 'accountants':
      return resolveUsersByRole(schoolId, ['accountant']);
    case 'class_parents':
      return resolveClassParents(schoolId, filter.classId);
    case 'class_students':
      return resolveClassStudents(schoolId, filter.classId);
    case 'specific_users':
      return filter.userIds || [];
    case 'campus':
      return resolveCampusUsers(schoolId, filter.campusId);
    case 'department':
      return resolveDepartmentStaff(schoolId, filter.department);
    default:
      return resolveAllUsers(schoolId);
  }
}

async function resolveAllUsers(schoolId) {
  const users = await prisma.user.findMany({ where: { schoolId }, select: { id: true } });
  return users.map(u => u.id);
}

async function resolveAllParents(schoolId) {
  const students = await prisma.student.findMany({ where: { schoolId }, select: { parentEmail: true } });
  const parentEmails = [...new Set(students.map(s => s.parentEmail).filter(Boolean))];
  if (parentEmails.length === 0) return [];
  const parents = await prisma.user.findMany({
    where: { schoolId, email: { in: parentEmails } },
    select: { id: true },
  });
  return parents.map(p => p.id);
}

async function resolveAllStaff(schoolId) {
  const staff = await prisma.staff.findMany({ where: { schoolId }, select: { email: true } });
  const emails = [...new Set(staff.map(s => s.email).filter(Boolean))];
  if (emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { schoolId, email: { in: emails } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveAllStudents(schoolId) {
  const students = await prisma.student.findMany({ where: { schoolId }, select: { email: true } });
  const emails = [...new Set(students.map(s => s.email).filter(Boolean))];
  if (emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { schoolId, email: { in: emails } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveUsersByStaffType(schoolId, staffType) {
  const staff = await prisma.staff.findMany({ where: { schoolId, staffType }, select: { email: true } });
  const emails = [...new Set(staff.map(s => s.email).filter(Boolean))];
  if (emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { schoolId, email: { in: emails } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveUsersByRole(schoolId, roles) {
  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: roles } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveClassParents(schoolId, classId) {
  if (!classId) return [];
  const students = await prisma.student.findMany({
    where: { schoolId, classId },
    select: { parentEmail: true },
  });
  const parentEmails = [...new Set(students.map(s => s.parentEmail).filter(Boolean))];
  if (parentEmails.length === 0) return [];
  const parents = await prisma.user.findMany({
    where: { schoolId, email: { in: parentEmails } },
    select: { id: true },
  });
  return parents.map(p => p.id);
}

async function resolveClassStudents(schoolId, classId) {
  if (!classId) return [];
  const students = await prisma.student.findMany({
    where: { schoolId, classId },
    select: { email: true },
  });
  const emails = [...new Set(students.map(s => s.email).filter(Boolean))];
  if (emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { schoolId, email: { in: emails } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveCampusUsers(schoolId, campusId) {
  if (!campusId) return resolveAllUsers(schoolId);
  const users = await prisma.user.findMany({
    where: { schoolId, campusId },
    select: { id: true },
  });
  return users.map(u => u.id);
}

async function resolveDepartmentStaff(schoolId, department) {
  if (!department) return [];
  const staff = await prisma.staff.findMany({
    where: { schoolId, department },
    select: { email: true },
  });
  const emails = [...new Set(staff.map(s => s.email).filter(Boolean))];
  if (emails.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { schoolId, email: { in: emails } },
    select: { id: true },
  });
  return users.map(u => u.id);
}

module.exports = {
  resolveAudience,
  resolveAllUsers,
  resolveAllParents,
  resolveAllStaff,
  resolveAllStudents,
  resolveClassParents,
  resolveClassStudents,
  resolveUsersByStaffType,
  resolveUsersByRole,
  resolveCampusUsers,
  resolveDepartmentStaff,
};
