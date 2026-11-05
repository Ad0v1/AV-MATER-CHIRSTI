-- Fase A del login por codigo de usuario (D-058 a D-061, docs/11 y docs/12).
-- Agrega el codigo de 10 digitos, el DNI cifrado y su hash, y el estado de la contrasena.

-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `code` CHAR(10) NULL,
    ADD COLUMN `dniEncrypted` VARCHAR(255) NULL,
    ADD COLUMN `dniHash` CHAR(64) NULL;

-- AlterTable
ALTER TABLE `LocalCredential`
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `passwordChangedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_code_key` ON `User`(`code`);

-- CreateIndex
CREATE UNIQUE INDEX `User_dniHash_key` ON `User`(`dniHash`);

-- CHECK (Prisma no los modela). Un valor nulo es valido: los usuarios existentes aun no tienen codigo.
ALTER TABLE `User` ADD CONSTRAINT `User_code_chk`
    CHECK (`code` IS NULL OR `code` REGEXP '^[0-9]{10}$');

ALTER TABLE `User` ADD CONSTRAINT `User_dniHash_chk`
    CHECK (`dniHash` IS NULL OR `dniHash` REGEXP '^[0-9a-f]{64}$');
