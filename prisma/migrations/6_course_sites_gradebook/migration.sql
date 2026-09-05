-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN "classId" TEXT;

-- CreateTable
CREATE TABLE "GradeConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "weights" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeConfig_schoolId_key" ON "GradeConfig"("schoolId");

-- AddForeignKey
ALTER TABLE "GradeConfig" ADD CONSTRAINT "GradeConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;