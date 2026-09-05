-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN "allowRetake" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Question" ADD COLUMN "shuffleGroup" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ExamSubmission" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'started';
ALTER TABLE "ExamSubmission" ADD COLUMN "gradedAnswers" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ExamSubmission" ADD COLUMN "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ExamSubmission" ADD COLUMN "gradedBy" TEXT;
ALTER TABLE "ExamSubmission" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "ExamSubmission" ALTER COLUMN "submittedAt" DROP NOT NULL;
ALTER TABLE "ExamSubmission" ALTER COLUMN "submittedAt" DROP DEFAULT;

-- DropIndex
DROP INDEX "ExamSubmission_examId_studentId_key";