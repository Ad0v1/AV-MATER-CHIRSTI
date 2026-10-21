-- Solo desarrollo local. Prisma migrate dev necesita crear una base "shadow" temporal.
-- Se ejecuta unicamente la primera vez que se crea el volumen de MySQL.
GRANT ALL PRIVILEGES ON *.* TO 'aula'@'%';
FLUSH PRIVILEGES;
