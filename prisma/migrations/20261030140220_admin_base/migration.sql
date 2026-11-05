-- CreateTable
CREATE TABLE `Announcement` (
    `id` CHAR(36) NOT NULL,
    `academicYearId` CHAR(36) NOT NULL,
    `scope` ENUM('INSTITUTION', 'GRADE', 'COURSE_SECTION') NOT NULL,
    `gradeLevel` TINYINT NULL,
    `courseSectionId` CHAR(36) NULL,
    `title` VARCHAR(150) NOT NULL,
    `body` TEXT NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `deletedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Announcement_academicYearId_scope_deletedAt_publishedAt_idx`(`academicYearId`, `scope`, `deletedAt`, `publishedAt`),
    INDEX `Announcement_courseSectionId_deletedAt_publishedAt_idx`(`courseSectionId`, `deletedAt`, `publishedAt`),
    INDEX `Announcement_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `recipientId` CHAR(36) NOT NULL,
    `type` ENUM('ASSIGNMENT_CREATED', 'ASSIGNMENT_DUE_SOON', 'GRADE_PUBLISHED', 'ANNOUNCEMENT_PUBLISHED') NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `emailStatus` ENUM('PENDING', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `emailSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_recipientId_readAt_createdAt_idx`(`recipientId`, `readAt`, `createdAt`),
    INDEX `Notification_emailStatus_createdAt_idx`(`emailStatus`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstitutionSettings` (
    `id` TINYINT NOT NULL DEFAULT 1,
    `name` VARCHAR(150) NOT NULL,
    `logoObjectKey` VARCHAR(255) NULL,
    `logoMime` VARCHAR(20) NULL,
    `literalScale` JSON NOT NULL,
    `purgeAfterDays` SMALLINT NOT NULL DEFAULT 60,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackgroundJob` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('SECTION_EXPORT', 'BULK_EXPORT', 'YEAR_BACKUP', 'PERSONAL_DATA_EXPORT', 'PURGE_YEAR') NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    `params` JSON NOT NULL,
    `academicYearId` CHAR(36) NULL,
    `requestedById` CHAR(36) NULL,
    `resultObjectKey` VARCHAR(255) NULL,
    `resultBytes` BIGINT NULL,
    `errorCode` VARCHAR(64) NULL,
    `attempts` SMALLINT NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BackgroundJob_requestedById_createdAt_idx`(`requestedById`, `createdAt`),
    INDEX `BackgroundJob_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `BackgroundJob_academicYearId_type_status_idx`(`academicYearId`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_courseSectionId_fkey` FOREIGN KEY (`courseSectionId`) REFERENCES `CourseSection`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BackgroundJob` ADD CONSTRAINT `BackgroundJob_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). SQL manual de modelador-bd (fase 5a de Dev 5).
-- En MySQL un CHECK UNKNOWN no falla: cada rama se escribe sin comparaciones contra NULL
-- (columnas NOT NULL o IS NOT NULL explicito, docs/04). Las FK son RESTRICT, asi que MySQL
-- admite esas columnas en un CHECK.
ALTER TABLE `Announcement`
  -- RF-32: el alcance decide que columna va; grado de 1 a 5 (secundaria).
  ADD CONSTRAINT `Announcement_scope_chk` CHECK (
    (`scope` = 'INSTITUTION' AND `gradeLevel` IS NULL AND `courseSectionId` IS NULL) OR
    (`scope` = 'GRADE' AND `gradeLevel` IS NOT NULL AND `gradeLevel` BETWEEN 1 AND 5 AND `courseSectionId` IS NULL) OR
    (`scope` = 'COURSE_SECTION' AND `courseSectionId` IS NOT NULL AND `gradeLevel` IS NULL)),
  -- Borrado logico: deletedAt y deletedById van juntos (como Material_deleted_chk).
  ADD CONSTRAINT `Announcement_deleted_chk` CHECK (
    (`deletedAt` IS NULL AND `deletedById` IS NULL) OR
    (`deletedAt` IS NOT NULL AND `deletedById` IS NOT NULL));
ALTER TABLE `Notification`
  -- emailSentAt solo y siempre con emailStatus = SENT.
  ADD CONSTRAINT `Notification_email_chk` CHECK (
    (`emailStatus` = 'SENT' AND `emailSentAt` IS NOT NULL) OR
    (`emailStatus` <> 'SENT' AND `emailSentAt` IS NULL));
ALTER TABLE `InstitutionSettings`
  -- U11: una sola fila.
  ADD CONSTRAINT `InstitutionSettings_id_chk` CHECK (`id` = 1),
  -- RF-66: plazo de purga entre 1 dia y 10 años.
  ADD CONSTRAINT `InstitutionSettings_purge_chk` CHECK (`purgeAfterDays` BETWEEN 1 AND 3650),
  -- U5: logo PNG o JPEG; clave y tipo van juntos.
  ADD CONSTRAINT `InstitutionSettings_logo_chk` CHECK (
    (`logoObjectKey` IS NULL AND `logoMime` IS NULL) OR
    (`logoObjectKey` IS NOT NULL AND `logoMime` IS NOT NULL AND `logoMime` IN ('image/png', 'image/jpeg'))),
  -- RN-04: la tabla de literales es un arreglo no vacio (el resto lo valida validateLiteralScale).
  ADD CONSTRAINT `InstitutionSettings_scale_chk` CHECK (
    JSON_TYPE(`literalScale`) = 'ARRAY' AND JSON_LENGTH(`literalScale`) > 0);
ALTER TABLE `BackgroundJob`
  -- Ciclo de vida: QUEUED -> RUNNING -> SUCCEEDED | FAILED; SUCCEEDED -> EXPIRED (U6).
  -- Un reintento vuelve a QUEUED con finishedAt NULL.
  ADD CONSTRAINT `BackgroundJob_status_chk` CHECK (
    ((`status` = 'QUEUED' AND `finishedAt` IS NULL) OR
     (`status` = 'RUNNING' AND `startedAt` IS NOT NULL AND `finishedAt` IS NULL) OR
     (`status` = 'SUCCEEDED' AND `startedAt` IS NOT NULL AND `finishedAt` IS NOT NULL AND `errorCode` IS NULL) OR
     (`status` = 'FAILED' AND `finishedAt` IS NOT NULL AND `errorCode` IS NOT NULL) OR
     (`status` = 'EXPIRED' AND `finishedAt` IS NOT NULL AND `expiresAt` IS NOT NULL AND `errorCode` IS NULL)) AND
    (`startedAt` IS NULL OR `finishedAt` IS NULL OR `finishedAt` >= `startedAt`)),
  -- Solo un trabajo exitoso (o ya vencido) tiene resultado; el tamaño va con la clave.
  ADD CONSTRAINT `BackgroundJob_result_chk` CHECK (
    (`resultObjectKey` IS NULL OR `status` IN ('SUCCEEDED', 'EXPIRED')) AND
    (`resultBytes` IS NULL OR (`resultObjectKey` IS NOT NULL AND `resultBytes` >= 0)) AND
    (`expiresAt` IS NULL OR `status` IN ('SUCCEEDED', 'EXPIRED'))),
  ADD CONSTRAINT `BackgroundJob_attempts_chk` CHECK (`attempts` >= 0),
  -- params es un objeto JSON (solo ids; lo valida el servicio).
  ADD CONSTRAINT `BackgroundJob_params_chk` CHECK (JSON_TYPE(`params`) = 'OBJECT');

-- Fila unica de configuracion (U11) con la tabla de literales por defecto (DEFAULT_LITERAL_SCALE
-- de packages/shared). El ADMIN cambia nombre, logo, escala y plazo desde RF-61.
INSERT INTO `InstitutionSettings` (`id`, `name`, `literalScale`, `purgeAfterDays`, `updatedAt`)
VALUES (1, 'I.E. Mater Christi',
  JSON_ARRAY(
    JSON_OBJECT('literal', 'AD', 'min', 18, 'max', 20),
    JSON_OBJECT('literal', 'A', 'min', 14, 'max', 17),
    JSON_OBJECT('literal', 'B', 'min', 11, 'max', 13),
    JSON_OBJECT('literal', 'C', 'min', 0, 'max', 10)),
  60, CURRENT_TIMESTAMP(3));
