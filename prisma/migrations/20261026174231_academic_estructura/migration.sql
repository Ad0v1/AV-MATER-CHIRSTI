-- CreateTable
CREATE TABLE `AcademicYear` (
    `id` CHAR(36) NOT NULL,
    `year` SMALLINT NOT NULL,
    `isActive` BOOLEAN NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AcademicYear_year_key`(`year`),
    UNIQUE INDEX `AcademicYear_isActive_key`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcademicPeriod` (
    `id` CHAR(36) NOT NULL,
    `academicYearId` CHAR(36) NOT NULL,
    `sequence` TINYINT NOT NULL,
    `kind` ENUM('FIRST_BIMESTER', 'SECOND_BIMESTER', 'THIRD_TRIMESTER', 'FOURTH_TRIMESTER') NOT NULL,
    `label` VARCHAR(32) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AcademicPeriod_academicYearId_sequence_key`(`academicYearId`, `sequence`),
    UNIQUE INDEX `AcademicPeriod_academicYearId_kind_key`(`academicYearId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Section` (
    `id` CHAR(36) NOT NULL,
    `academicYearId` CHAR(36) NOT NULL,
    `gradeLevel` TINYINT NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Section_academicYearId_gradeLevel_code_key`(`academicYearId`, `gradeLevel`, `code`),
    UNIQUE INDEX `Section_id_academicYearId_key`(`id`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Course_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseSection` (
    `id` CHAR(36) NOT NULL,
    `sectionId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `teacherId` CHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseSection_teacherId_idx`(`teacherId`),
    INDEX `CourseSection_courseId_idx`(`courseId`),
    UNIQUE INDEX `CourseSection_sectionId_courseId_key`(`sectionId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Enrollment` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `sectionId` CHAR(36) NOT NULL,
    `academicYearId` CHAR(36) NOT NULL,
    `isCurrent` BOOLEAN NULL DEFAULT true,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveTo` DATETIME(3) NULL,
    `endReason` ENUM('TRANSFER', 'WITHDRAWAL', 'YEAR_END', 'CORRECTION') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Enrollment_studentId_effectiveFrom_idx`(`studentId`, `effectiveFrom`),
    INDEX `Enrollment_sectionId_academicYearId_isCurrent_idx`(`sectionId`, `academicYearId`, `isCurrent`),
    UNIQUE INDEX `Enrollment_academicYearId_studentId_isCurrent_key`(`academicYearId`, `studentId`, `isCurrent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuardianStudent` (
    `guardianId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GuardianStudent_studentId_idx`(`studentId`),
    PRIMARY KEY (`guardianId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AcademicPeriod` ADD CONSTRAINT `AcademicPeriod_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CourseSection` ADD CONSTRAINT `CourseSection_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CourseSection` ADD CONSTRAINT `CourseSection_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CourseSection` ADD CONSTRAINT `CourseSection_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Enrollment` ADD CONSTRAINT `Enrollment_sectionId_academicYearId_fkey` FOREIGN KEY (`sectionId`, `academicYearId`) REFERENCES `Section`(`id`, `academicYearId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GuardianStudent` ADD CONSTRAINT `GuardianStudent_guardianId_fkey` FOREIGN KEY (`guardianId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GuardianStudent` ADD CONSTRAINT `GuardianStudent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). Ninguno usa columnas de FK.
ALTER TABLE `AcademicYear`
  ADD CONSTRAINT `AcademicYear_isActive_chk` CHECK (`isActive` IS NULL OR `isActive` = 1),
  ADD CONSTRAINT `AcademicYear_year_chk` CHECK (`year` BETWEEN 2000 AND 2100);
ALTER TABLE `AcademicPeriod`
  ADD CONSTRAINT `AcademicPeriod_sequence_kind_chk` CHECK (
    (`sequence` = 1 AND `kind` = 'FIRST_BIMESTER') OR (`sequence` = 2 AND `kind` = 'SECOND_BIMESTER') OR
    (`sequence` = 3 AND `kind` = 'THIRD_TRIMESTER') OR (`sequence` = 4 AND `kind` = 'FOURTH_TRIMESTER')),
  ADD CONSTRAINT `AcademicPeriod_dates_chk` CHECK (`endDate` >= `startDate`);
ALTER TABLE `Section`
  ADD CONSTRAINT `Section_gradeLevel_chk` CHECK (`gradeLevel` BETWEEN 1 AND 5);
ALTER TABLE `Enrollment`
  ADD CONSTRAINT `Enrollment_isCurrent_chk` CHECK (
    (`isCurrent` = 1 AND `effectiveTo` IS NULL AND `endReason` IS NULL) OR
    (`isCurrent` IS NULL AND `effectiveTo` IS NOT NULL AND `endReason` IS NOT NULL)),
  ADD CONSTRAINT `Enrollment_dates_chk` CHECK (`effectiveTo` IS NULL OR `effectiveTo` >= `effectiveFrom`);
