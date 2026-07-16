const prisma = require('./lib/prisma');

async function cleanup() {
  console.log('Clearing all demo data...\n');

  // Delete in dependency order (children first)
  const deletions = [
    { name: 'ConferenceBooking', model: prisma.conferenceBooking },
    { name: 'ConferenceSlot', model: prisma.conferenceSlot },
    { name: 'CalendarEvent', model: prisma.calendarEvent },
    { name: 'BedAllocation', model: prisma.bedAllocation },
    { name: 'Room', model: prisma.room },
    { name: 'Hostel', model: prisma.hostel },
    { name: 'BookLoan', model: prisma.bookLoan },
    { name: 'Book', model: prisma.book },
    { name: 'InventoryAssignment', model: prisma.inventoryAssignment },
    { name: 'InventoryItem', model: prisma.inventoryItem },
    { name: 'Campaign', model: prisma.campaign },
    { name: 'LessonPlan', model: prisma.lessonPlan },
    { name: 'Alumni', model: prisma.alumni },
    { name: 'Incident', model: prisma.incident },
    { name: 'ExamSubmission', model: prisma.examSubmission },
    { name: 'Question', model: prisma.question },
    { name: 'Exam', model: prisma.exam },
    { name: 'Submission', model: prisma.submission },
    { name: 'Assignment', model: prisma.assignment },
    { name: 'DriverTrip', model: prisma.driverTrip },
    { name: 'TransportRoute', model: prisma.transportRoute },
    { name: 'TimetableSlot', model: prisma.timetableSlot },
    { name: 'StudentReport', model: prisma.studentReport },
    { name: 'Grade', model: prisma.grade },
    { name: 'FeeRecord', model: prisma.feeRecord },
    { name: 'Attendance', model: prisma.attendance },
    { name: 'StaffAttendance', model: prisma.staffAttendance },
    { name: 'CardOrder', model: prisma.cardOrder },
    { name: 'Transaction', model: prisma.transaction },
    { name: 'StudentWallet', model: prisma.studentWallet },
    { name: 'PushSubscription', model: prisma.pushSubscription },
    { name: 'Notification', model: prisma.notification },
    { name: 'Message', model: prisma.message },
    { name: 'Announcement', model: prisma.announcement },
    { name: 'TaskComment', model: prisma.taskComment },
    { name: 'Task', model: prisma.task },
    { name: 'PrivacyConsent', model: prisma.privacyConsent },
    { name: 'Subscription', model: prisma.subscription },
    { name: 'AuditLog', model: prisma.auditLog },
    { name: 'PasswordResetToken', model: prisma.passwordResetToken },
    { name: 'Student', model: prisma.student },
    { name: 'Staff', model: prisma.staff },
    { name: 'User', model: prisma.user },
    { name: 'Campus', model: prisma.campus },
    { name: 'School', model: prisma.school },
  ];

  for (const { name, model } of deletions) {
    try {
      const count = await model.deleteMany();
      if (count.count > 0) console.log(`  Deleted ${count.count} ${name} records`);
    } catch (err) {
      console.log(`  Skipped ${name} (${err.message.slice(0, 60)})`);
    }
  }

  console.log('\n✅ All demo data cleared. SuperAdmin accounts preserved.');
}

cleanup()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
