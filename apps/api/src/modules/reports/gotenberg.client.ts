import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/config.module.js';
import { JobError } from '../jobs/index.js';

// Cliente HTTP de Gotenberg (U4, RF-58): HTML -> PDF con Chromium. El contenedor corre sin
// JavaScript y solo en 127.0.0.1 (docker-compose). Timeout y tope de tamaño de la respuesta; un
// fallo es JobError PDF_UNAVAILABLE (reintentable) y nunca lleva el cuerpo de la respuesta.

export const GOTENBERG_TIMEOUT_MS = 30_000;
/** Un registro de una sección no debería pasar de unos pocos MiB. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export const PDF_RENDERER = Symbol('PDF_RENDERER');

/** Lo inyectan los procesadores; los tests lo reemplazan sin red. */
export interface PdfRenderer {
  htmlToPdf(html: string): Promise<Buffer>;
}

type FetchLike = typeof fetch;

@Injectable()
export class GotenbergClient implements PdfRenderer {
  private fetcher: FetchLike = (...args) => fetch(...args);

  constructor(@Inject(ENV) private readonly env: Pick<Env, 'GOTENBERG_URL'>) {}

  /** Solo para tests unitarios. */
  useFetch(fetcher: FetchLike): this {
    this.fetcher = fetcher;
    return this;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // A4 horizontal en pulgadas; márgenes por @page del propio HTML.
    form.append('paperWidth', '11.7');
    form.append('paperHeight', '8.27');
    form.append('preferCssPageSize', 'true');
    form.append('printBackground', 'true');
    const url = new URL('/forms/chromium/convert/html', this.env.GOTENBERG_URL);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      throw new JobError('PDF_UNAVAILABLE');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new JobError('PDF_UNAVAILABLE');
    }
    // content-length ausente o no numérico = no declarado: se cuenta al leer.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new JobError('PDF_TOO_LARGE', false);
    }
    const buffer = await readCapped(response);
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new JobError('PDF_INVALID');
    return buffer;
  }
}

/** Lee el cuerpo por trozos y corta en cuanto pasa MAX_PDF_BYTES (respuestas chunked). */
async function readCapped(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new JobError('PDF_TOO_LARGE', false);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JobError) throw error;
    throw new JobError('PDF_UNAVAILABLE');
  }
  return Buffer.concat(chunks, total);
}
