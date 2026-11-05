-- RF-69: marca de "DNI verificado contra el documento", que pone el administrador.
ALTER TABLE `User` ADD COLUMN `dniVerifiedAt` DATETIME(3) NULL;

-- Solo se puede verificar un DNI que existe.
ALTER TABLE `User` ADD CONSTRAINT `User_dniVerified_chk`
    CHECK (`dniVerifiedAt` IS NULL OR `dniHash` IS NOT NULL);
