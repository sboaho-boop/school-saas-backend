const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const schoolId = 'cms08z1re0000wk9nx0of1k6o';

  // Get all students
  const students = await prisma.student.findMany({ where: { schoolId } });
  console.log(`Found ${students.length} students`);

  // Get existing subjects
  const subjects = await prisma.subject.findMany({ where: { schoolId } });
  console.log(`Found ${subjects.length} subjects`);

  // Get active term
  const term = await prisma.term.findFirst({ where: { schoolId, isActive: true } });
  if (!term) {
    console.log('No active term found. Creating one...');
    // Will skip grades if no term
  } else {
    console.log(`Active term: ${term.name}`);
  }

  // Create attendance records for the last 10 days
  const statuses = ['present', 'present', 'present', 'present', 'absent', 'present', 'late', 'present', 'present', 'present'];
  let attendanceCount = 0;

  for (const student of students) {
    for (let d = 0; d < 10; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const exists = await prisma.attendance.findFirst({
        where: { studentId: student.id, date: dateStr, schoolId }
      });
      if (!exists) {
        await prisma.attendance.create({
          data: {
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`,
            classId: student.classId,
            className: student.className,
            date: dateStr,
            status: statuses[d % statuses.length],
            schoolId,
          }
        });
        attendanceCount++;
      }
    }
  }
  console.log(`Created ${attendanceCount} attendance records`);

  // Create grade records if we have subjects and term
  if (subjects.length > 0 && term) {
    let gradeCount = 0;
    const scores = [85, 72, 68, 91, 55, 78, 82, 63, 75, 88];

    for (const student of students) {
      // Assign 3-4 random subjects per student
      const numSubjects = Math.min(4, subjects.length);
      const shuffledSubjs = [...subjects].sort(() => Math.random() - 0.5).slice(0, numSubjects);

      for (const subject of shuffledSubjs) {
        const score = scores[Math.floor(Math.random() * scores.length)];
        const grade = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';
        const components = JSON.stringify({
          classExercise: Math.floor(Math.random() * 10),
          homework: Math.floor(Math.random() * 10),
          quiz: Math.floor(Math.random() * 30),
          midterm: Math.floor(Math.random() * 20),
          exam: Math.floor(Math.random() * 30),
        });

        const exists = await prisma.grade.findFirst({
          where: { studentId: student.id, subjectId: subject.id, termId: term.id }
        });
        if (!exists) {
          await prisma.grade.create({
            data: {
              studentId: student.id,
              subjectId: subject.id,
              classId: student.classId,
              termId: term.id,
              score,
              grade,
              components,
              remarks: 'Good performance',
              schoolId,
            }
          });
          gradeCount++;
        }
      }
    }
    console.log(`Created ${gradeCount} grade records`);
  }

  console.log('Done!');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
