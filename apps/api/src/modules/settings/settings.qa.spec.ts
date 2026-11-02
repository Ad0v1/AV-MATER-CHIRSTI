import { S3Client } from '@aws-sdk/client-s3';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { FileScanner } from '../files/file-scanner.js';
import type { StorageConfig } from '../storage/index.js';
import { InstitutionLogoStorage } from './institution-logo.storage.js';
import { LiteralScaleProvider } from './literal-scale.provider.js';
import { jpegBytes, PNG_BASE_BYTES, pngBytes } from './logo-fixtures.mock-spec.js';
import { checkLogo, LOGO_MAX_BYTES } from './logo-image.js';
import { recordSettings } from './settings-audit.js';
import { SettingsService } from './settings.service.js';

// QA de 5c (RF-61, U5): casos límite que no cubren los specs de Dev 5.

const actor = { id: '0192f0c4-0000-7000-8000-0000000000aa', ip: '127.0.0.1' };
const KEY = 'institution/0192f0c4-0000-7000-8000-000000000001.png';

describe('checkLogo: límites exactos (U5)', () => {
  it('512 KiB justos pasan y 512 KiB + 1 byte no', () => {
    const exact = pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES);
    expect(exact.length).toBe(LOGO_MAX_BYTES);
    expect(checkLogo(exact).ok).toBe(true);
    expect(checkLogo(pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES + 1))).toEqual({
      ok: false,
      reason: 'TOO_LARGE',
    });
  });

  it('un archivo de 1 byte es UNSUPPORTED; un PNG de 32 bytes (sin IHDR completo) es INVALID', () => {
    expect(checkLogo(Buffer.from([0x89]))).toEqual({ ok: false, reason: 'UNSUPPORTED' });
    expect(checkLogo(pngBytes().subarray(0, 32))).toEqual({ ok: false, reason: 'INVALID' });
    expect(checkLogo(pngBytes().subarray(0, 8))).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('PNG con un solo lado mayor de 4096 o de 0 px es INVALID, también al revés', () => {
    expect(checkLogo(pngBytes(10, 4097))).toEqual({ ok: false, reason: 'INVALID' });
    expect(checkLogo(pngBytes(10, 0))).toEqual({ ok: false, reason: 'INVALID' });
    expect(checkLogo(pngBytes(0, 4096)).ok).toBe(false);
    expect(checkLogo(pngBytes(1, 1)).ok).toBe(true);
  });

  it('PNG con un IHDR de longitud distinta de 13 es INVALID', () => {
    const bad = pngBytes();
    bad.writeUInt32BE(12, 8);
    expect(checkLogo(bad)).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('JPEG: salta relleno 0xFF, TEM, RSTn y segmentos DHT antes del SOF', () => {
    const sof = jpegBytes(200, 100).subarray(20, 20 + 19); // SOF0 del fixture
    const dht = Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]);
    const withExtras = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xff, 0x01, 0xff, 0xd3]),
      dht,
      sof,
      Buffer.from([0xff, 0xd9]),
    ]);
    expect(checkLogo(withExtras)).toEqual({ ok: true, format: 'jpg', width: 200, height: 100 });
  });

  it('JPEG: un SOF2 (progresivo) también trae dimensiones; un SOF corto o de 0 px no', () => {
    const progressive = jpegBytes(30, 20);
    const at = progressive.indexOf(Buffer.from([0xff, 0xc0]));
    progressive[at + 1] = 0xc2;
    expect(checkLogo(progressive)).toEqual({ ok: true, format: 'jpg', width: 30, height: 20 });

    const short = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x05, 0x08, 0x00, 0x10, 0x00]);
    expect(checkLogo(short)).toEqual({ ok: false, reason: 'INVALID' });
    expect(checkLogo(jpegBytes(4097, 10)).ok).toBe(false);
    expect(checkLogo(jpegBytes(4096, 4096)).ok).toBe(true);
  });
});

describe('recordSettings: la bitácora nunca rompe la operación', () => {
  it('si audit.record falla, no lanza', async () => {
    const audit = { record: vi.fn(() => Promise.reject(new Error('sin bitácora'))) };
    await expect(
      recordSettings(audit as unknown as AuditService, actor, 'settings.update', {
        after: { changedFields: ['name'] },
      }),
    ).resolves.toBeUndefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('InstitutionLogoStorage.delete', () => {
  const config = {
    bucket: 'aula-privado',
    endpoint: 'http://127.0.0.1:9000',
    region: 'us-east-1',
    accessKeyId: 'a',
    secretAccessKey: 'b',
    forcePathStyle: true,
    uploadUrlTtlSeconds: 300,
    downloadUrlTtlSeconds: 60,
  } satisfies StorageConfig;

  it('borra solo claves institution/ del bucket configurado', async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const storage = new InstitutionLogoStorage({ send } as unknown as S3Client, config);
    await storage.delete(KEY);
    const input = (send.mock.calls[0] as unknown as [{ input: Record<string, unknown> }])[0].input;
    expect(input).toEqual({ Bucket: 'aula-privado', Key: KEY });
    await expect(storage.delete('institution/../x.png')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsService.uploadLogo: rechazos de entrada y fila ausente', () => {
  function build(rowExists = true) {
    const tx = {
      $queryRaw: vi.fn(() => Promise.resolve(rowExists ? [{ id: 1, logoObjectKey: null }] : [])),
      institutionSettings: { update: vi.fn() },
    };
    const prisma = {
      institutionSettings: { findUnique: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const scanner = { scan: vi.fn(() => Promise.resolve({ status: 'CLEAN' })) };
    const logos = {
      upload: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      signedUrl: vi.fn(),
    };
    const service = new SettingsService(
      prisma,
      audit as unknown as AuditService,
      scanner as unknown as FileScanner,
      logos as unknown as InstitutionLogoStorage,
      new LiteralScaleProvider(prisma),
    );
    return { service, tx, scanner, logos, audit };
  }
  const errorOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const e = error as HttpException;
      return { status: e.getStatus(), body: e.getResponse() as { code?: string } };
    }
    throw new Error('no lanzó');
  };

  it('sin archivo → 400 FILE_REQUIRED; 0 bytes → 400 EMPTY_FILE; no se toca el antivirus', async () => {
    const { service, scanner } = build();
    expect(await errorOf(service.uploadLogo(undefined, actor))).toMatchObject({
      status: 400,
      body: { code: 'FILE_REQUIRED' },
    });
    expect(
      await errorOf(service.uploadLogo({ size: 0, buffer: Buffer.alloc(0) }, actor)),
    ).toMatchObject({ status: 400, body: { code: 'EMPTY_FILE' } });
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('512 KiB + 1 → 413; GIF → 415 UNSUPPORTED_IMAGE; IHDR roto → 415 INVALID_IMAGE', async () => {
    const { service, scanner, logos } = build();
    const big = pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES + 1);
    expect(
      await errorOf(service.uploadLogo({ size: big.length, buffer: big }, actor)),
    ).toMatchObject({ status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
    const gif = Buffer.from('GIF89a0000');
    expect(await errorOf(service.uploadLogo({ size: 10, buffer: gif }, actor))).toMatchObject({
      status: 415,
      body: { code: 'UNSUPPORTED_IMAGE' },
    });
    const broken = pngBytes();
    broken.write('IDAT', 12, 'latin1');
    expect(await errorOf(service.uploadLogo({ size: 33, buffer: broken }, actor))).toMatchObject({
      status: 415,
      body: { code: 'INVALID_IMAGE' },
    });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(logos.upload).not.toHaveBeenCalled();
  });

  it('si la fila id = 1 no existe → 500 SETTINGS_MISSING, borra el objeto subido y no deja bitácora', async () => {
    const { service, tx, logos, audit } = build(false);
    const png = pngBytes();
    expect(
      await errorOf(service.uploadLogo({ size: png.length, buffer: png }, actor)),
    ).toMatchObject({
      status: 500,
      body: { code: 'SETTINGS_MISSING' },
    });
    expect(tx.institutionSettings.update).not.toHaveBeenCalled();
    expect(logos.upload).toHaveBeenCalledTimes(1);
    const uploaded = (logos.upload.mock.calls[0] as unknown as [string])[0];
    expect(logos.delete).toHaveBeenCalledWith(uploaded);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
