-- CreateTable
CREATE TABLE `StoredFile` (
    `id` CHAR(36) NOT NULL,
    `objectKey` VARCHAR(255) NOT NULL,
    `purpose` ENUM('MATERIAL', 'ASSIGNMENT_ATTACHMENT', 'SUBMISSION') NOT NULL,
    `courseSectionId` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NULL,
    `uploadedById` CHAR(36) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `maxBytes` INTEGER NOT NULL,
    `sizeBytes` INTEGER NULL,
    `sha256` CHAR(64) NULL,
    `uploadStatus` ENUM('PENDING', 'COMPLETED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `scanStatus` ENUM('PENDING', 'CLEAN', 'INFECTED', 'INVALID') NOT NULL DEFAULT 'PENDING',
    `rejectReason` ENUM('TOO_LARGE', 'NOT_PDF', 'ENCRYPTED_PDF', 'INFECTED', 'MISSING_OBJECT') NULL,
    `intentExpiresAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `scannedAt` DATETIME(3) NULL,
    `purgedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StoredFile_objectKey_key`(`objectKey`),
    INDEX `StoredFile_uploadedById_uploadStatus_idx`(`uploadedById`, `uploadStatus`),
    INDEX `StoredFile_scanStatus_idx`(`scanStatus`),
    INDEX `StoredFile_courseSectionId_idx`(`courseSectionId`),
    INDEX `StoredFile_assignmentId_idx`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Material` (
    `id` CHAR(36) NOT NULL,
    `courseSectionId` CHAR(36) NOT NULL,
    `periodId` CHAR(36) NULL,
    `kind` ENUM('CLASS', 'READING') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `fileId` CHAR(36) NOT NULL,
    `isReusable` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` CHAR(36) NULL,
    `createdById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Material_fileId_key`(`fileId`),
    INDEX `Material_courseSectionId_kind_deletedAt_idx`(`courseSectionId`, `kind`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assignment` (
    `id` CHAR(36) NOT NULL,
    `courseSectionId` CHAR(36) NOT NULL,
    `periodId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `instructions` TEXT NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `maxSizeBytes` INTEGER NOT NULL DEFAULT 20971520,
    `noSubmissionGrade` DECIMAL(4, 2) NOT NULL DEFAULT 0,
    `allowLate` BOOLEAN NOT NULL DEFAULT false,
    `attachmentFileId` CHAR(36) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Assignment_attachmentFileId_key`(`attachmentFileId`),
    INDEX `Assignment_courseSectionId_periodId_dueAt_idx`(`courseSectionId`, `periodId`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Submission` (
    `id` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Submission_enrollmentId_idx`(`enrollmentId`),
    UNIQUE INDEX `Submission_assignmentId_enrollmentId_key`(`assignmentId`, `enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubmissionVersion` (
    `id` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NOT NULL,
    `versionNumber` SMALLINT NOT NULL,
    `fileId` CHAR(36) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `isLate` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SubmissionVersion_fileId_key`(`fileId`),
    UNIQUE INDEX `SubmissionVersion_submissionId_versionNumber_key`(`submissionId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StoredFile` ADD CONSTRAINT `StoredFile_courseSectionId_fkey` FOREIGN KEY (`courseSectionId`) REFERENCES `CourseSection`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StoredFile` ADD CONSTRAINT `StoredFile_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StoredFile` ADD CONSTRAINT `StoredFile_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_courseSectionId_fkey` FOREIGN KEY (`courseSectionId`) REFERENCES `CourseSection`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `AcademicPeriod`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `StoredFile`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_courseSectionId_fkey` FOREIGN KEY (`courseSectionId`) REFERENCES `CourseSection`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `AcademicPeriod`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_attachmentFileId_fkey` FOREIGN KEY (`attachmentFileId`) REFERENCES `StoredFile`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `Enrollment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubmissionVersion` ADD CONSTRAINT `SubmissionVersion_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `Submission`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubmissionVersion` ADD CONSTRAINT `SubmissionVersion_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `StoredFile`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). SQL manual de modelador-bd (fase 3a de Dev 3).
-- En MySQL un CHECK UNKNOWN no falla: cada rama condicional se escribe sin comparaciones contra NULL
-- (columnas NOT NULL o IS NOT NULL explicito, docs/04). Las FK usadas son RESTRICT, asi que MySQL
-- admite esas columnas en un CHECK. Topes en MiB: 52428800 = 50 MiB (RN-08).
ALTER TABLE `StoredFile`
  ADD CONSTRAINT `StoredFile_size_chk` CHECK (
    `maxBytes` BETWEEN 1 AND 52428800 AND
    (`sizeBytes` IS NULL OR (`sizeBytes` BETWEEN 1 AND 52428800 AND `sizeBytes` <= `maxBytes`))),
  ADD CONSTRAINT `StoredFile_clean_chk` CHECK (
    `scanStatus` <> 'CLEAN' OR
    (`uploadStatus` = 'COMPLETED' AND `sizeBytes` IS NOT NULL AND `sha256` IS NOT NULL)),
  ADD CONSTRAINT `StoredFile_purpose_chk` CHECK (
    `purpose` <> 'SUBMISSION' OR `assignmentId` IS NOT NULL);
ALTER TABLE `Material`
  ADD CONSTRAINT `Material_deleted_chk` CHECK (
    (`deletedAt` IS NULL AND `deletedById` IS NULL) OR
    (`deletedAt` IS NOT NULL AND `deletedById` IS NOT NULL));
ALTER TABLE `Assignment`
  ADD CONSTRAINT `Assignment_maxSize_chk` CHECK (`maxSizeBytes` BETWEEN 1 AND 52428800),
  ADD CONSTRAINT `Assignment_neGrade_chk` CHECK (`noSubmissionGrade` BETWEEN 0 AND 20);
ALTER TABLE `SubmissionVersion`
  ADD CONSTRAINT `SubmissionVersion_versionNumber_chk` CHECK (`versionNumber` >= 1);

-- Historial de entregas inmutable (RF-36, RN-09): la base rechaza UPDATE y DELETE sobre
-- SubmissionVersion, como AuditLog. Una sola sentencia por trigger, sin DELIMITER.
-- La purga (Dev 5) no toca estas filas: borra el objeto y marca StoredFile.purgedAt.
CREATE TRIGGER `SubmissionVersion_no_update` BEFORE UPDATE ON `SubmissionVersion` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubmissionVersion es inmutable';

CREATE TRIGGER `SubmissionVersion_no_delete` BEFORE DELETE ON `SubmissionVersion` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubmissionVersion es inmutable';
