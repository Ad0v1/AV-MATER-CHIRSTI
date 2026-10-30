import type { Readable } from 'node:stream';

// Antivirus detrás de una interfaz (decisión del usuario del 29/10/2026): hoy el escaneo es
// síncrono dentro de POST /files/:id/complete con clamd; más adelante Dev 5 puede moverlo al
// worker sin cambiar a quien lo llama.

// TOO_LARGE: el antivirus no admite un archivo tan grande (clamd StreamMaxLength). Es un
// rechazo definitivo (413), no una caída: reintentar no cambia el resultado.
export type ScanResult =
  { status: 'CLEAN' } | { status: 'INFECTED'; signature: string } | { status: 'TOO_LARGE' };

/** El antivirus no respondió o falló: el archivo queda pendiente y se puede reintentar (503). */
export class ScannerUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ScannerUnavailableError';
  }
}

export abstract class FileScanner {
  /** Lee el stream completo. Rechaza con ScannerUnavailableError si el antivirus no está. */
  abstract scan(stream: Readable): Promise<ScanResult>;
}
