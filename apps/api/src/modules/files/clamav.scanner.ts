import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { CLAMAV_CONFIG, type ClamavConfig } from './clamav.config.js';
import { FileScanner, ScannerUnavailableError, type ScanResult } from './file-scanner.js';

const COMMAND = Buffer.from('zINSTREAM\0', 'latin1');
const END_OF_STREAM = Buffer.alloc(4);

/** Interpreta la respuesta de clamd a INSTREAM ("stream: OK", "stream: <firma> FOUND"). */
export function parseClamdReply(reply: string): ScanResult {
  const text = reply.replace(/\0/g, '').trim();
  if (/^stream: OK$/.test(text)) return { status: 'CLEAN' };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found) return { status: 'INFECTED', signature: found[1] };
  // "INSTREAM size limit exceeded. ERROR": supera StreamMaxLength de clamd → 413, no 503.
  if (/size limit exceeded/i.test(text)) return { status: 'TOO_LARGE' };
  // Otro "... ERROR" o algo inesperado: no hay veredicto.
  throw new ScannerUnavailableError('respuesta de clamd sin veredicto');
}

/**
 * Cliente mínimo de clamd por TCP (protocolo INSTREAM) con node:net, sin dependencias nuevas
 * (RF-40). Cada trozo va precedido por su longitud en 4 bytes big-endian y se termina con un
 * trozo de longitud cero.
 */
@Injectable()
export class ClamavFileScanner extends FileScanner {
  constructor(@Inject(CLAMAV_CONFIG) private readonly config: ClamavConfig) {
    super();
  }

  scan(stream: Readable): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      const socket = createConnection({ host: this.config.host, port: this.config.port });
      const abort = new AbortController();
      const reply: Buffer[] = [];
      let settled = false;

      const finish = (error: Error | null, result?: ScanResult) => {
        if (settled) return;
        settled = true;
        abort.abort();
        socket.destroy();
        if (error) {
          stream.destroy();
          reject(error);
        } else {
          resolve(result!);
        }
      };
      const settleFromReply = () => {
        try {
          finish(null, parseClamdReply(Buffer.concat(reply).toString('utf8')));
        } catch (error) {
          finish(error as Error);
        }
      };

      socket.setTimeout(this.config.timeoutMs, () =>
        finish(new ScannerUnavailableError('clamd no respondió a tiempo')),
      );
      socket.on('error', (error: NodeJS.ErrnoException) => {
        // Si clamd ya respondió (p. ej. cortó por tamaño), vale su respuesta.
        if (reply.length > 0) settleFromReply();
        else finish(new ScannerUnavailableError(`clamd: ${error.code ?? error.name}`));
      });
      socket.on('data', (data: Buffer) => {
        reply.push(data);
        if (data.includes(0)) settleFromReply();
      });
      socket.on('close', () => {
        if (reply.length > 0) settleFromReply();
        else finish(new ScannerUnavailableError('clamd cerró la conexión sin responder'));
      });
      socket.once('connect', () => {
        this.pump(socket, stream, abort.signal).catch((error: unknown) => {
          if (abort.signal.aborted) return;
          // Error del origen (S3) o del socket: el llamador distingue por el tipo.
          finish(error instanceof Error ? error : new Error(String(error)));
        });
      });
    });
  }

  private async pump(socket: Socket, stream: Readable, signal: AbortSignal): Promise<void> {
    await this.write(socket, COMMAND, signal);
    for await (const raw of stream) {
      if (signal.aborted) return;
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      if (chunk.length === 0) continue;
      const header = Buffer.alloc(4);
      header.writeUInt32BE(chunk.length, 0);
      await this.write(socket, Buffer.concat([header, chunk]), signal);
    }
    if (!signal.aborted) await this.write(socket, END_OF_STREAM, signal);
  }

  private async write(socket: Socket, data: Buffer, signal: AbortSignal): Promise<void> {
    if (signal.aborted || socket.destroyed) return;
    if (!socket.write(data)) await once(socket, 'drain', { signal });
  }
}
