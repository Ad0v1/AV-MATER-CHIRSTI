import { PassThrough, type Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import type { JobResultStorage } from './job-result.storage.js';

// ZIP en streaming hacia S3 para los trabajos (respaldo anual RF-65, datos personales RF-63 y
// los ZIP masivos de 5f, RF-59). Nada pasa por disco ni se carga entero en memoria: archiver
// escribe en un PassThrough que JobResultStorage.upload sube por partes (lib-storage).
// Las entradas se agregan de a una: la siguiente fuente (p. ej. un PDF de S3) se abre recien
// cuando la anterior ya se escribio, asi no quedan decenas de conexiones abiertas.

const SEGMENT_MAX = 80;
const PATH_MAX = 240;

/** Escritor de entradas que recibe el constructor del ZIP. */
export interface ZipWriter {
  /** Agrega una entrada con contenido en memoria (indice, JSON). Devuelve el nombre final. */
  addBuffer(path: string, data: Buffer | string): Promise<string>;
  /**
   * Agrega una entrada leyendo un stream que se abre justo antes de escribirla. Devuelve el
   * nombre final (con sufijo " (2)" si ya existia).
   */
  addStream(path: string, open: () => Promise<Readable>): Promise<string>;
  /** Entradas escritas hasta ahora. */
  readonly count: number;
}

/**
 * Limpia un tramo de ruta del ZIP: sin separadores, sin caracteres de control ni de Windows
 * prohibidos, sin "." o ".." (zip slip) y con un largo maximo. Nunca devuelve vacio.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function zipSegment(value: string, fallback = 'sin-nombre'): string {
  const cleaned = Array.from(value.normalize('NFC'))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_')
    .replace(/[. ]+$/, '');
  const cut = Array.from(cleaned).slice(0, SEGMENT_MAX).join('').trim();
  if (cut === '') return fallback;
  // Nombres reservados de Windows (CON, NUL, COM1, "aux.pdf"…): no se pueden extraer tal cual.
  return WINDOWS_RESERVED.test(cut) ? `_${cut}` : cut;
}

/** Une tramos ya limpios con "/" (siempre relativo). */
export function zipPath(...segments: string[]): string {
  const path = segments.map((s) => zipSegment(s)).join('/');
  return Array.from(path).slice(0, PATH_MAX).join('');
}

function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot > slash + 1) return `${path.slice(0, dot)} (${n})${path.slice(dot)}`;
  return `${path} (${n})`;
}

/**
 * Arma un ZIP y lo sube a `key` (prefijo exports/ o backups/). `build` agrega las entradas en
 * orden; al terminar se cierra el ZIP y se espera la subida. Devuelve el tamaño en bytes.
 * Si `build`, una fuente o la subida fallan, se aborta el ZIP (lib-storage aborta la subida por
 * partes) y se relanza el error: el trabajo reintenta.
 */
export async function uploadZip(
  storage: Pick<JobResultStorage, 'upload'>,
  key: string,
  build: (zip: ZipWriter) => Promise<void>,
): Promise<number> {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const output = new PassThrough();
  let failure: Error | null = null;
  let rejectFailure: (error: Error) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  // Evita "unhandled rejection" si nadie llega a esperar `failed`.
  failed.catch(() => undefined);
  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    rejectFailure(error);
  };

  archive.on('error', fail);
  // Un aviso de archiver (p. ej. un archivo ausente) tambien es error: el ZIP quedaria incompleto.
  archive.on('warning', fail);
  // Los errores de la subida llegan por `uploading`; sin este listener, destruir el stream al
  // abortar seria una excepcion no capturada.
  output.on('error', () => undefined);
  archive.pipe(output);
  const uploading = storage.upload(key, output);
  uploading.catch((error: unknown) =>
    fail(error instanceof Error ? error : new Error('UPLOAD_FAILED')),
  );

  const used = new Set<string>();
  let count = 0;
  const unique = (path: string): string => {
    let name = path;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = withSuffix(path, n);
    used.add(name.toLowerCase());
    return name;
  };
  /** Espera a que archiver termine de escribir la entrada en curso. */
  const written = () =>
    Promise.race([new Promise<void>((resolve) => archive.once('entry', () => resolve())), failed]);

  const writer: ZipWriter = {
    get count() {
      return count;
    },
    async addBuffer(path, data) {
      if (failure) throw failure;
      const name = unique(path);
      const done = written();
      archive.append(typeof data === 'string' ? Buffer.from(data, 'utf8') : data, { name });
      await done;
      count++;
      return name;
    },
    async addStream(path, open) {
      if (failure) throw failure;
      const source = await Promise.race([open(), failed]);
      const name = unique(path);
      source.once('error', (error: Error) => fail(error));
      const done = written();
      archive.append(source, { name });
      await done;
      count++;
      return name;
    },
  };

  try {
    await build(writer);
    if (failure) throw failure;
    await Promise.race([archive.finalize(), failed]);
    return await uploading;
  } catch (error) {
    archive.abort();
    output.destroy(new Error('ZIP_ABORTED'));
    await uploading.catch(() => undefined);
    throw error;
  }
}
