// Comprobaciones puras de archivos PDF en el navegador (Dev 3, materiales y entregas). El servidor
// vuelve a validar el contenido real y lo analiza con antivirus (RF-34, RF-40).

export const MIB = 1024 * 1024;

/** Tamaño legible: "1,5 MiB" o "820 KiB". */
export function formatSize(bytes: number): string {
  if (bytes >= MIB) {
    return `${(bytes / MIB).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MiB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

/** Mensaje para el campo de archivo, separado por tipo y por tamaño, o null si está bien. */
export function checkPdf(file: { name: string; size: number }, maxBytes: number): string | null {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return 'El archivo no es un PDF. Elige un archivo con extensión .pdf.';
  }
  if (file.size < 1) return 'El archivo está vacío. Elige otro PDF.';
  if (file.size > maxBytes) {
    return `El archivo pesa ${formatSize(file.size)} y supera el máximo de ${formatSize(maxBytes)}. Reduce su tamaño o elige otro.`;
  }
  return null;
}
