-- Corrige Enrollment_isCurrent_chk (Fase 1): con isCurrent NULL, effectiveTo NULL y endReason NULL
-- la primera rama daba UNKNOWN (NULL = 1) y MySQL acepta un CHECK UNKNOWN. Se protege la rama TRUE
-- con IS NOT NULL para que la expresion nunca sea UNKNOWN (RN-10, D-032).
ALTER TABLE `Enrollment` DROP CHECK `Enrollment_isCurrent_chk`;
ALTER TABLE `Enrollment`
  ADD CONSTRAINT `Enrollment_isCurrent_chk` CHECK (
    (`isCurrent` IS NOT NULL AND `isCurrent` = 1 AND `effectiveTo` IS NULL AND `endReason` IS NULL) OR
    (`isCurrent` IS NULL AND `effectiveTo` IS NOT NULL AND `endReason` IS NOT NULL));
