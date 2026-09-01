-- AlterTable
ALTER TABLE "TutorUser" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "masteryStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveDate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "topicsMastered" TEXT,
ADD COLUMN     "renewalReminderDate" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TutorCurriculumProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '',
    "chapter" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'locked',
    "masteryScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorCurriculumProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorCurriculumProgress_userId_subject_chapter_key" ON "TutorCurriculumProgress"("userId", "subject", "chapter");

-- AddForeignKey
ALTER TABLE "TutorCurriculumProgress" ADD CONSTRAINT "TutorCurriculumProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TutorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
