-- Fase F: `institutionalEmail` pasa a llamarse `email` (correo del colegio, opcional). Solo cambia
-- el nombre: los datos y la unicidad se conservan.
ALTER TABLE `User` RENAME COLUMN `institutionalEmail` TO `email`;
ALTER TABLE `User` RENAME INDEX `User_institutionalEmail_key` TO `User_email_key`;
