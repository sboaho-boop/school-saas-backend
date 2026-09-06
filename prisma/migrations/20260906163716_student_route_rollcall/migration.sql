-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "pickupStop" TEXT,
ADD COLUMN     "routeId" TEXT;

-- CreateTable
CREATE TABLE "DriverStudent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "pickupStop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting',
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "DriverStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverStudent_schoolId_idx" ON "DriverStudent"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverStudent_tripId_studentId_key" ON "DriverStudent"("tripId", "studentId");

-- AddForeignKey
ALTER TABLE "DriverStudent" ADD CONSTRAINT "DriverStudent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "DriverTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverStudent" ADD CONSTRAINT "DriverStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
