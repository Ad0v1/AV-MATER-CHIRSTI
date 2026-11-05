-- Fase B del login por codigo de usuario (D-062, docs/11 y docs/12).
-- Correo de contacto verificado (RF-80, RF-81) y aceptacion en nombre de los alumnos (RF-07).

-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `contactEmail` VARCHAR(191) NULL,
    ADD COLUMN `contactEmailIsGuardian` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `PolicyAcceptance`
    ADD COLUMN `onBehalfOfWards` BOOLEAN NOT NULL DEFAULT false;

-- Un correo verificado exige tener correo.
ALTER TABLE `User` ADD CONSTRAINT `User_emailVerified_chk`
    CHECK (`emailVerifiedAt` IS NULL OR `contactEmail` IS NOT NULL);
