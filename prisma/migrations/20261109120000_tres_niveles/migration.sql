-- Tres niveles: inicial, primaria y secundaria (decisiones del usuario del 09/11/2026).
-- SQL de modelador-bd. Backfill: las secciones existentes quedan en SECUNDARIA (DEFAULT).
-- La escala (literal o vigesimal) no se guarda: sale de Section.level en packages/shared.

-- AlterTable: nivel de la seccion (NOT NULL con default para las filas existentes)
ALTER TABLE `Section` ADD COLUMN `level` ENUM('INICIAL', 'PRIMARIA', 'SECUNDARIA') NOT NULL DEFAULT 'SECUNDARIA';

-- El indice unico nuevo empieza por academicYearId, asi que sostiene la FK Section_academicYearId_fkey:
-- se crea antes de borrar el viejo y la FK no se toca.
CREATE UNIQUE INDEX `Section_academicYearId_level_gradeLevel_code_key` ON `Section`(`academicYearId`, `level`, `gradeLevel`, `code`);
DROP INDEX `Section_academicYearId_gradeLevel_code_key` ON `Section`;

-- AlterTable
ALTER TABLE `Announcement` ADD COLUMN `level` ENUM('INICIAL', 'PRIMARIA', 'SECUNDARIA') NULL;

-- AlterTable
ALTER TABLE `Assignment` ADD COLUMN `noSubmissionLiteral` ENUM('AD', 'A', 'B', 'C') NULL;

-- AlterTable
ALTER TABLE `Grade` ADD COLUMN `literal` ENUM('AD', 'A', 'B', 'C') NULL;

-- CreateTable
CREATE TABLE `PeriodAchievement` (
    `id` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `courseSectionId` CHAR(36) NOT NULL,
    `periodId` CHAR(36) NOT NULL,
    `literal` ENUM('AD', 'A', 'B', 'C') NOT NULL,
    `comment` TEXT NULL,
    `gradedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PeriodAchievement_courseSectionId_periodId_idx`(`courseSectionId`, `periodId`),
    INDEX `PeriodAchievement_periodId_idx`(`periodId`),
    UNIQUE INDEX `PeriodAchievement_enrollmentId_courseSectionId_periodId_key`(`enrollmentId`, `courseSectionId`, `periodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PeriodAchievement` ADD CONSTRAINT `PeriodAchievement_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `Enrollment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `PeriodAchievement` ADD CONSTRAINT `PeriodAchievement_courseSectionId_fkey` FOREIGN KEY (`courseSectionId`) REFERENCES `CourseSection`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `PeriodAchievement` ADD CONSTRAINT `PeriodAchievement_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `AcademicPeriod`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). En MySQL un CHECK UNKNOWN no falla:
-- cada rama se escribe sin comparaciones contra NULL (docs/04).

-- Grado dentro del nivel: INICIAL 3..5 (años), PRIMARIA 1..6, SECUNDARIA 1..5.
ALTER TABLE `Section` DROP CHECK `Section_gradeLevel_chk`;
ALTER TABLE `Section`
  ADD CONSTRAINT `Section_gradeLevel_chk` CHECK (
    (`level` = 'INICIAL' AND `gradeLevel` BETWEEN 3 AND 5) OR
    (`level` = 'PRIMARIA' AND `gradeLevel` BETWEEN 1 AND 6) OR
    (`level` = 'SECUNDARIA' AND `gradeLevel` BETWEEN 1 AND 5));

-- RF-32: GRADE lleva nivel y grado con el mismo rango que Section; los otros alcances, ninguno.
-- Backfill: los anuncios GRADE anteriores a los tres niveles eran todos de secundaria.
UPDATE `Announcement` SET `level` = 'SECUNDARIA' WHERE `scope` = 'GRADE' AND `level` IS NULL;

ALTER TABLE `Announcement` DROP CHECK `Announcement_scope_chk`;
ALTER TABLE `Announcement`
  ADD CONSTRAINT `Announcement_scope_chk` CHECK (
    (`scope` = 'INSTITUTION' AND `level` IS NULL AND `gradeLevel` IS NULL AND `courseSectionId` IS NULL) OR
    (`scope` = 'GRADE' AND `courseSectionId` IS NULL AND `level` IS NOT NULL AND `gradeLevel` IS NOT NULL AND (
      (`level` = 'INICIAL' AND `gradeLevel` BETWEEN 3 AND 5) OR
      (`level` = 'PRIMARIA' AND `gradeLevel` BETWEEN 1 AND 6) OR
      (`level` = 'SECUNDARIA' AND `gradeLevel` BETWEEN 1 AND 5))) OR
    (`scope` = 'COURSE_SECTION' AND `courseSectionId` IS NOT NULL AND `level` IS NULL AND `gradeLevel` IS NULL));

-- GRADED y NE llevan exactamente uno de value o literal y no llevan motivo; EXEMPT no lleva
-- ninguno y si motivo. Que el campo coincida con Section.level lo valida el servicio (Dev 4).
ALTER TABLE `Grade` DROP CHECK `Grade_state_chk`;
ALTER TABLE `Grade`
  ADD CONSTRAINT `Grade_state_chk` CHECK (
    (`state` IN ('GRADED', 'NE') AND `exemptionReason` IS NULL AND (
      (`value` IS NOT NULL AND `literal` IS NULL) OR
      (`value` IS NULL AND `literal` IS NOT NULL))) OR
    (`state` = 'EXEMPT' AND `value` IS NULL AND `literal` IS NULL AND `exemptionReason` IS NOT NULL));
