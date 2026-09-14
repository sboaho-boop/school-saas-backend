-- CreateTable
CREATE TABLE "MarketplaceSubscription" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'platform',
    "teacherId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceSubscription_studentId_idx" ON "MarketplaceSubscription"("studentId");

-- CreateIndex
CREATE INDEX "MarketplaceSubscription_teacherId_idx" ON "MarketplaceSubscription"("teacherId");

-- AddForeignKey
ALTER TABLE "MarketplaceSubscription" ADD CONSTRAINT "MarketplaceSubscription_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "MarketplaceStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSubscription" ADD CONSTRAINT "MarketplaceSubscription_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "MarketplaceTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddColumn
ALTER TABLE "MarketplaceTeacher" ADD COLUMN "subscriptionPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;