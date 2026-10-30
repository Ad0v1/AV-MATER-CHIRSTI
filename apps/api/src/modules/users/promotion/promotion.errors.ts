// Mensajes fijos de la promoción en bloque (RF-16). Nunca incluyen nombres ni correos.
export const PROMOTION_MSG = {
  targetNotFound: 'El año académico no existe',
  sourceNotFound: 'El año de origen no existe',
  sameYear: 'El año de origen y el de destino deben ser distintos',
  notConsecutive: 'El año de destino debe ser el siguiente al año de origen',
  openPeriods: 'Cierra todos los períodos del año de origen antes de promover',
  targetClosed: 'El año de destino está cerrado',
  targetReadOnly: 'El año de destino es de solo lectura',
  noTargetSections: 'El año de destino no tiene secciones activas',
  fingerprintChanged: 'La propuesta cambió; vuelve a cargarla',
  invalidDecisions: 'Hay decisiones que no se pueden aplicar',
} as const;
