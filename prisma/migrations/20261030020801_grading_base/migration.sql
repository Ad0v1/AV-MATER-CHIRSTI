-- CreateTable
CREATE TABLE `Grade` (
    `id` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `state` ENUM('GRADED', 'NE', 'EXEMPT') NOT NULL,
    `value` DECIMAL(4, 2) NULL,
    `comment` TEXT NULL,
    `exemptionReason` VARCHAR(500) NULL,
    `source` ENUM('MANUAL', 'AUTO') NOT NULL DEFAULT 'MANUAL',
    `gradedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Grade_enrollmentId_idx`(`enrollmentId`),
    UNIQUE INDEX `Grade_assignmentId_enrollmentId_key`(`assignmentId`, `enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `Enrollment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). SQL manual de modelador-bd (fase 4a de Dev 4).
-- En MySQL un CHECK UNKNOWN no falla: cada rama se escribe sin comparaciones contra NULL
-- (columnas NOT NULL o IS NOT NULL explicito, docs/04). Las FK son RESTRICT.
ALTER TABLE `Grade`
  -- RN-01: escala vigesimal 0..20; null solo para EXEMPT (lo exige Grade_state_chk).
  ADD CONSTRAINT `Grade_value_chk` CHECK (
    `value` IS NULL OR `value` BETWEEN 0 AND 20),
  -- GRADED y NE llevan nota y no llevan motivo; EXEMPT no lleva nota y si motivo (RF-41/44/46).
  ADD CONSTRAINT `Grade_state_chk` CHECK (
    (`state` IN ('GRADED', 'NE') AND `value` IS NOT NULL AND `exemptionReason` IS NULL) OR
    (`state` = 'EXEMPT' AND `value` IS NULL AND `exemptionReason` IS NOT NULL)),
  -- Solo la NE se materializa de forma automatica (RF-44, U1).
  ADD CONSTRAINT `Grade_source_chk` CHECK (
    `source` <> 'AUTO' OR `state` = 'NE');
