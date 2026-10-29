import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { Readable } from 'node:stream';
import { loadClamavConfig } from './clamav.config.js';
import { ClamavFileScanner, parseClamdReply } from './clamav.scanner.js';
import { ScannerUnavailableError } from './file-scanner.js';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** clamd simulado: decodifica INSTREAM y responde según `decide(payload)`. */
function fakeClamd(decide: (payload: Buffer) => string | null): Promise<{
  server: Server;
  port: number;
  received: Buffer[];
}> {
  const received: Buffer[] = [];
  const server = createServer((socket: Socket) => {
    let buffer = Buffer.alloc(0);
    let commandRead = false;
    const chunks: Buffer[] = [];
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      if (!commandRead) {
        const nul = buffer.indexOf(0);
        if (nul < 0) return;
        expect(buffer.subarray(0, nul).toString()).toBe('zINSTREAM');
        buffer = buffer.subarray(nul + 1);
        commandRead = true;
      }
      while (buffer.length >= 4) {
        const len = buffer.readUInt32BE(0);
        if (len === 0) {
          const payload = Buffer.concat(chunks);
          received.push(payload);
          const reply = decide(payload);
          if (reply === null) socket.destroy();
          else socket.end(`${reply}\0`);
          return;
        }
        if (buffer.length < 4 + len) return;
        chunks.push(buffer.subarray(4, 4 + len));
        buffer = buffer.subarray(4 + len);
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port, received }),
    ),
  );
}

const scannerOn = (port: number, timeoutMs = 2000) =>
  new ClamavFileScanner({ host: '127.0.0.1', port, timeoutMs });

describe('ClamavFileScanner (RF-40)', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  it('envía el archivo completo por INSTREAM y responde CLEAN', async () => {
    const fake = await fakeClamd(() => 'stream: OK');
    server = fake.server;
    const data = Buffer.alloc(200_000, 7);
    const result = await scannerOn(fake.port).scan(
      Readable.from([data.subarray(0, 70_000), data.subarray(70_000)]),
    );
    expect(result).toEqual({ status: 'CLEAN' });
    expect(fake.received[0].equals(data)).toBe(true);
  });

  it('marca INFECTED con la firma que devuelve clamd', async () => {
    const fake = await fakeClamd((p) =>
      p.toString().includes('EICAR') ? 'stream: Eicar-Test-Signature FOUND' : 'stream: OK',
    );
    server = fake.server;
    const result = await scannerOn(fake.port).scan(Readable.from([Buffer.from(EICAR)]));
    expect(result).toEqual({ status: 'INFECTED', signature: 'Eicar-Test-Signature' });
  });

  it('falla con ScannerUnavailableError si clamd está caído (503 y reintento)', async () => {
    const fake = await fakeClamd(() => 'stream: OK');
    const { port } = fake;
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
    await expect(scannerOn(port).scan(Readable.from([Buffer.from('x')]))).rejects.toBeInstanceOf(
      ScannerUnavailableError,
    );
  });

  it('falla con ScannerUnavailableError si clamd corta sin responder', async () => {
    const fake = await fakeClamd(() => null);
    server = fake.server;
    await expect(
      scannerOn(fake.port).scan(Readable.from([Buffer.from('x')])),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
  });

  it('falla con ScannerUnavailableError si clamd no responde a tiempo', async () => {
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', () => resolve()));
    server = silent;
    const port = (silent.address() as AddressInfo).port;
    await expect(
      scannerOn(port, 1000).scan(Readable.from([Buffer.from('x')])),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
    // Cierra el socket colgado del lado del servidor para que close() termine.
    silent.close();
    server = undefined;
  });

  it('interpreta las respuestas de clamd', () => {
    expect(parseClamdReply('stream: OK\0')).toEqual({ status: 'CLEAN' });
    expect(parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND\0')).toEqual({
      status: 'INFECTED',
      signature: 'Win.Test.EICAR_HDB-1',
    });
    expect(parseClamdReply('INSTREAM size limit exceeded. ERROR\0')).toEqual({
      status: 'TOO_LARGE',
    });
    expect(() => parseClamdReply('lo que sea ERROR\0')).toThrow(ScannerUnavailableError);
  });

  it('lee CLAMAV_HOST, CLAMAV_PORT y CLAMAV_TIMEOUT_MS con valores por defecto', () => {
    expect(loadClamavConfig({})).toEqual({ host: '127.0.0.1', port: 3310, timeoutMs: 30_000 });
    expect(
      loadClamavConfig({ CLAMAV_HOST: 'clamav', CLAMAV_PORT: '3311', CLAMAV_TIMEOUT_MS: '5000' }),
    ).toEqual({ host: 'clamav', port: 3311, timeoutMs: 5000 });
    expect(() => loadClamavConfig({ CLAMAV_PORT: 'x' })).toThrow(/CLAMAV_PORT/);
  });
});
