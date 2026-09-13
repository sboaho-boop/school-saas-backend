-- CreateTable
CREATE TABLE "MarketplaceTeacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "pricePerLesson" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subjects" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "earnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceStudent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceLesson" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL DEFAULT '',
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "maxStudents" INTEGER NOT NULL DEFAULT 50,
    "joinLink" TEXT NOT NULL DEFAULT '',
    "roomReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceEnrollment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "teacherEarn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceTeacher_email_key" ON "MarketplaceTeacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceStudent_email_key" ON "MarketplaceStudent"("email");

-- AddForeignKey
ALTER TABLE "MarketplaceLesson" ADD CONSTRAINT "MarketplaceLesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "MarketplaceTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEnrollment" ADD CONSTRAINT "MarketplaceEnrollment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "MarketplaceLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEnrollment" ADD CONSTRAINT "MarketplaceEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "MarketplaceStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEnrollment" ADD CONSTRAINT "MarketplaceEnrollment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "MarketplaceTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
