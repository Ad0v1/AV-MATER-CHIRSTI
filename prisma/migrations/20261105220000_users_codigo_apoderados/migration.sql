-- Fase C del login por codigo de usuario (D-063, docs/11 y docs/12).
-- El correo del colegio deja de ser obligatorio, el usuario guarda telefono y direccion (RF-83)
-- y cada alumno tiene un apoderado principal (RF-86).

-- AlterTable
ALTER TABLE `User`
    MODIFY `institutionalEmail` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(20) NULL,
    ADD COLUMN `address` VARCHAR(255) NULL;

ALTER TABLE `User` ADD CONSTRAINT `User_phone_chk`
    CHECK (`phone` IS NULL OR `phone` REGEXP '^[0-9]{9}$');

-- AlterTable
ALTER TABLE `GuardianStudent` ADD COLUMN `isPrimary` BOOLEAN NULL;

-- Los vinculos vigentes que ya existen: el mas antiguo de cada alumno pasa a ser el principal.
-- La subconsulta con funcion de ventana se materializa y evita el error 1093 de MySQL.
UPDATE `GuardianStudent`
SET `isPrimary` = 1
WHERE `id` IN (
    SELECT `id` FROM (
        SELECT `id` FROM (
            SELECT `id`,
                   ROW_NUMBER() OVER (PARTITION BY `studentId` ORDER BY `createdAt`, `id`) AS `rn`
            FROM `GuardianStudent`
            WHERE `isActive` = 1
        ) AS `ranked`
        WHERE `rn` = 1
    ) AS `firsts`
);

-- CreateIndex
CREATE UNIQUE INDEX `GuardianStudent_studentId_isActive_isPrimary_key`
    ON `GuardianStudent`(`studentId`, `isActive`, `isPrimary`);

-- CHECK: marcador TRUE/NULL (nunca FALSE) y solo un vinculo vigente puede ser principal. La rama
-- TRUE lleva IS NOT NULL: sin eso MySQL acepta un NULL como si fuera verdadero (ver docs/04).
ALTER TABLE `GuardianStudent` ADD CONSTRAINT `GuardianStudent_isPrimary_chk`
    CHECK (
        `isPrimary` IS NULL
        OR (`isPrimary` IS NOT NULL AND `isPrimary` = 1 AND `isActive` IS NOT NULL AND `isActive` = 1)
    );
