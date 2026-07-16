const prisma = require('../lib/prisma');

const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

async function getSchoolCode(schoolId) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  return school?.code || 'SCH-XXXXXX';
}

async function generateStudentIndexNumber(schoolId) {
  const schoolCode = await getSchoolCode(schoolId);
  for (let i = 0; i < 50; i++) {
    const count = await prisma.student.count({ where: { schoolId } });
    const seq = String(count + 1).padStart(3, '0');
    const idx = `${schoolCode}-STU-${seq}`;
    const existing = await prisma.student.findFirst({ where: { schoolId, indexNumber: idx } });
    if (!existing) return idx;
  }
  const fallback = `${schoolCode}-STU-${Date.now().toString(36).toUpperCase()}`;
  return fallback;
}

async function generateStaffIndexNumber(schoolId) {
  const schoolCode = await getSchoolCode(schoolId);
  for (let i = 0; i < 50; i++) {
    const count = await prisma.staff.count({ where: { schoolId } });
    const seq = String(count + 1).padStart(3, '0');
    const idx = `${schoolCode}-STF-${seq}`;
    const existing = await prisma.staff.findFirst({ where: { schoolId, indexNumber: idx } });
    if (!existing) return idx;
  }
  const fallback = `${schoolCode}-STF-${Date.now().toString(36).toUpperCase()}`;
  return fallback;
}

async function generateStudentIndexNumbers(schoolId, count) {
  const schoolCode = await getSchoolCode(schoolId);
  const existingCount = await prisma.student.count({ where: { schoolId } });
  const numbers = [];
  for (let i = 0; i < count; i++) {
    const seq = String(existingCount + i + 1).padStart(3, '0');
    numbers.push(`${schoolCode}-STU-${seq}`);
  }
  return numbers;
}

async function generateStaffIndexNumbers(schoolId, count) {
  const schoolCode = await getSchoolCode(schoolId);
  const existingCount = await prisma.staff.count({ where: { schoolId } });
  const numbers = [];
  for (let i = 0; i < count; i++) {
    const seq = String(existingCount + i + 1).padStart(3, '0');
    numbers.push(`${schoolCode}-STF-${seq}`);
  }
  return numbers;
}

module.exports = { generateStudentIndexNumber, generateStaffIndexNumber, generateStudentIndexNumbers, generateStaffIndexNumbers };