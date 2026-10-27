-- GuardianStudent revocable (Decision 1, Dev 2 F3; RN-13/14, D-032).
-- SQL manual: Prisma generaria ADD COLUMN `id` NOT NULL, que falla con filas existentes.
ALTER TABLE `GuardianStudent`
  ADD COLUMN `id` CHAR(36) NULL FIRST,
  ADD COLUMN `isActive` BOOLEAN NULL DEFAULT true,
  ADD COLUMN `revokedAt` DATETIME(3) NULL;

-- Filas previas (solo datos de desarrollo): UUID() v1 es aceptable para ellas.
UPDATE `GuardianStudent` SET `id` = UUID() WHERE `id` IS NULL;

-- Indice unico antes de soltar la PK: la FK de guardianId necesita un indice que empiece por guardianId.
CREATE UNIQUE INDEX `GuardianStudent_guardianId_studentId_isActive_key`
  ON `GuardianStudent`(`guardianId`, `studentId`, `isActive`);

ALTER TABLE `GuardianStudent` DROP PRIMARY KEY, MODIFY `id` CHAR(36) NOT NULL, ADD PRIMARY KEY (`id`);

-- Invariantes (MySQL 8.4). Si MySQL responde 3823, quitar solo GuardianStudent_distinct_chk.
-- `isActive` IS NOT NULL en la primera rama: sin ella, (NULL, NULL) da UNKNOWN y un CHECK UNKNOWN pasa.
ALTER TABLE `GuardianStudent`
  ADD CONSTRAINT `GuardianStudent_isActive_chk` CHECK (
    (`isActive` IS NOT NULL AND `isActive` = 1 AND `revokedAt` IS NULL) OR
    (`isActive` IS NULL AND `revokedAt` IS NOT NULL)),
  ADD CONSTRAINT `GuardianStudent_dates_chk` CHECK (`revokedAt` IS NULL OR `revokedAt` >= `createdAt`),
  ADD CONSTRAINT `GuardianStudent_distinct_chk` CHECK (`guardianId` <> `studentId`);
