/*
  Warnings:

  - The primary key for the `AuditLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.
  - You are about to alter the column `actorId` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.
  - You are about to alter the column `ip` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(45)`.
  - The primary key for the `LocalCredential` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `userId` on the `LocalCredential` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.
  - The primary key for the `PolicyAcceptance` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `PolicyAcceptance` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.
  - You are about to alter the column `userId` on the `PolicyAcceptance` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `User` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Char(36)`.

*/
-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_actorId_fkey`;

-- DropForeignKey
ALTER TABLE `LocalCredential` DROP FOREIGN KEY `LocalCredential_userId_fkey`;

-- DropForeignKey
ALTER TABLE `PolicyAcceptance` DROP FOREIGN KEY `PolicyAcceptance_userId_fkey`;

-- AlterTable
ALTER TABLE `AuditLog` DROP PRIMARY KEY,
    ADD COLUMN `entityId` CHAR(36) NULL,
    ADD COLUMN `entityType` VARCHAR(64) NULL,
    MODIFY `id` CHAR(36) NOT NULL,
    MODIFY `actorId` CHAR(36) NULL,
    MODIFY `ip` VARCHAR(45) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `LocalCredential` DROP PRIMARY KEY,
    MODIFY `userId` CHAR(36) NOT NULL,
    ADD PRIMARY KEY (`userId`);

-- AlterTable
ALTER TABLE `PolicyAcceptance` DROP PRIMARY KEY,
    ADD COLUMN `ip` VARCHAR(45) NULL,
    ADD COLUMN `userAgent` VARCHAR(255) NULL,
    MODIFY `id` CHAR(36) NOT NULL,
    MODIFY `userId` CHAR(36) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `User` DROP PRIMARY KEY,
    MODIFY `id` CHAR(36) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE INDEX `AuditLog_entityType_entityId_idx` ON `AuditLog`(`entityType`, `entityId`);

-- CreateIndex
CREATE INDEX `AuditLog_occurredAt_idx` ON `AuditLog`(`occurredAt`);

-- AddForeignKey
ALTER TABLE `LocalCredential` ADD CONSTRAINT `LocalCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PolicyAcceptance` ADD CONSTRAINT `PolicyAcceptance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Bitacora solo insercion (RNF-14/15): la base rechaza UPDATE y DELETE sobre AuditLog.
-- SQL manual (Prisma no modela triggers). Una sola sentencia por trigger, sin DELIMITER.
-- Nota: TRUNCATE/DROP no disparan triggers; en produccion el usuario de la app no debe
-- tener privilegios DROP/ALTER/TRIGGER.
CREATE TRIGGER `AuditLog_no_update` BEFORE UPDATE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog es solo insercion';

CREATE TRIGGER `AuditLog_no_delete` BEFORE DELETE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog es solo insercion';
