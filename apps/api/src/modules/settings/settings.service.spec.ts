import { HttpException } from '@nestjs/common';
import { DEFAULT_LITERAL_SCALE } from '@aula/shared';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { ScannerUnavailableError, type FileScanner } from '../files/file-scanner.js';
import type { InstitutionLogoStorage } from './institution-logo.storage.js';
import { LiteralScaleProvider } from './literal-scale.provider.js';
import { jpegBytes, pngBytes } from './logo-fixtures.mock-spec.js';
import { SettingsService } from './settings.service.js';

const actor = { id: '0192f0c4-0000-7000-8000-0000000000aa', ip: '127.0.0.1' };
const OLD_KEY = 'institution/0192f0c4-0000-7000-8000-000000000001.png';

type Row = {
  name: string;
  logoObjectKey: string | null;
  logoMime: string | null;
  literalScale: unknown;
  purgeAfterDays: number;
  updatedAt: Date;
};

function setup(initial: Partial<Row> = {}) {
  const row: Row = {
    name: 'I.E. Mater Christi',
    logoObjectKey: null,
    logoMime: null,
    literalScale: DEFAULT_LITERAL_SCALE.map((b) => ({ ...b })),
    purgeAfterDays: 60,
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    ...initial,
  };
  const state = { row: row as Row | null, failUpdate: false };
  const settings = {
    findUnique: vi.fn(() => Promise.resolve(state.row ? { ...state.row } : null)),
    findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...state.row! })),
    update: vi.fn(({ data }: { data: Partial<Row> }) => {
      if (state.failUpdate) return Promise.reject(new Error('db'));
      state.row = { ...state.row!, ...data, updatedAt: new Date() };
      return Promise.resolve({ ...state.row });
    }),
  };
  const tx = {
    institutionSettings: settings,
    $queryRaw: vi.fn(() =>
      Promise.resolve(state.row ? [{ id: 1, logoObjectKey: state.row.logoObjectKey }] : []),
    ),
  };
  const prisma = {
    institutionSettings: settings,
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const scanner = { scan: vi.fn(() => Promise.resolve({ status: 'CLEAN' })) };
  const logos = {
    upload: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    signedUrl: vi.fn((key: string) =>
      Promise.resolve({ url: `https://s3.local/${key}?sig`, expiresAt: '2026-10-30T10:10:00Z' }),
    ),
  };
  const scales = new LiteralScaleProvider(prisma);
  const invalidate = vi.spyOn(scales, 'invalidate');
  const service = new SettingsService(
    prisma,
    audit as unknown as AuditService,
    scanner as unknown as FileScanner,
    logos as unknown as InstitutionLogoStorage,
    scales,
  );
  return { service, state, settings, tx, audit, scanner, logos, invalidate };
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

const dto = (over: Record<string, unknown> = {}) => ({
  name: 'I.E. Mater Christi',
  literalScale: DEFAULT_LITERAL_SCALE.map((b) => ({ ...b })),
  purgeAfterDays: 60,
  ...over,
});

describe('SettingsService.get / branding (RF-61)', () => {
  it('lee siempre where { id: 1 } y no firma URL si no hay logo', async () => {
    const { service, settings, logos } = setup();
    const view = await service.get();
    expect(settings.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    expect(view).toMatchObject({ name: 'I.E. Mater Christi', purgeAfterDays: 60, logo: null });
    expect(view.literalScale.map((b) => b.literal)).toEqual(['AD', 'A', 'B', 'C']);
    expect(logos.signedUrl).not.toHaveBeenCalled();
  });

  it('branding devuelve nombre y URL firmada del logo', async () => {
    const { service } = setup({ logoObjectKey: OLD_KEY, logoMime: 'image/png' });
    expect(await service.branding()).toEqual({
      name: 'I.E. Mater Christi',
      logo: {
        mime: 'image/png',
        url: expect.stringContaining(OLD_KEY),
        expiresAt: expect.any(String),
      },
    });
  });

  it('si la firma falla, la página sigue sin logo', async () => {
    const { service, logos } = setup({ logoObjectKey: OLD_KEY, logoMime: 'image/png' });
    logos.signedUrl.mockRejectedValueOnce(new Error('sign'));
    expect((await service.branding()).logo).toBeNull();
  });

  it('una clave de logo ajena al prefijo institution/ no se firma', async () => {
    const { service, logos } = setup({
      logoObjectKey: 'submissions/2026/10/x.pdf',
      logoMime: 'image/png',
    });
    expect((await service.branding()).logo).toBeNull();
    expect(logos.signedUrl).not.toHaveBeenCalled();
  });

  it('sin la fila id = 1 responde 500 SETTINGS_MISSING y nunca la crea', async () => {
    const { service, state, settings } = setup();
    state.row = null;
    const err = await errorOf(service.get());
    expect(err).toMatchObject({ status: 500, body: { code: 'SETTINGS_MISSING' } });
    expect(settings).not.toHaveProperty('create');
    expect(settings).not.toHaveProperty('upsert');
  });
});

describe('SettingsService.update (RF-61)', () => {
  it('actualiza los tres campos, invalida la caché y registra solo lo que cambió', async () => {
    const { service, settings, audit, invalidate } = setup();
    const scale = [
      { literal: 'AD', min: 17, max: 20 },
      { literal: 'A', min: 14, max: 16 },
      { literal: 'B', min: 11, max: 13 },
      { literal: 'C', min: 0, max: 10 },
    ];
    const view = await service.update(dto({ literalScale: scale, purgeAfterDays: 90 }), actor);
    expect(settings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ purgeAfterDays: 90, updatedById: actor.id }),
      }),
    );
    expect(view.literalScale[0]).toEqual({ literal: 'AD', min: 17, max: 20 });
    expect(invalidate).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        module: 'settings',
        entityType: 'InstitutionSettings',
        entityId: '1',
        actorId: actor.id,
        beforeState: expect.objectContaining({
          changedFields: ['literalScale', 'purgeAfterDays'],
          purgeAfterDays: 60,
        }),
        afterState: expect.objectContaining({ purgeAfterDays: 90 }),
      }),
    );
  });

  it('un cambio de nombre se registra sin el valor', async () => {
    const { service, audit } = setup();
    await service.update(dto({ name: 'Colegio Mater Christi' }), actor);
    const call = (audit.record as Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(call.afterState).toEqual({ changedFields: ['name'] });
    expect(JSON.stringify(call)).not.toContain('Colegio Mater Christi');
  });

  it('sin cambios no deja bitácora; el mismo orden distinto de tramos no es un cambio', async () => {
    const { service, audit } = setup();
    await service.update(dto({ literalScale: [...DEFAULT_LITERAL_SCALE].reverse() }), actor);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('una tabla inválida responde 400 antes de abrir la transacción', async () => {
    const { service, settings } = setup();
    const err = await errorOf(
      service.update(dto({ literalScale: [{ literal: 'A', min: 0, max: 15 }] }), actor),
    );
    expect(err.status).toBe(400);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('bloquea la fila con FOR UPDATE', async () => {
    const { service, tx } = setup();
    await service.update(dto({ purgeAfterDays: 30 }), actor);
    const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
    expect(sql.join('')).toContain('FOR UPDATE');
  });
});

describe('SettingsService.uploadLogo (U5)', () => {
  it('PNG limpio: antivirus, subida a institution/, fila y borrado del anterior', async () => {
    const { service, scanner, logos, settings, audit } = setup({
      logoObjectKey: OLD_KEY,
      logoMime: 'image/png',
    });
    const buffer = pngBytes(200, 100);
    const view = await service.uploadLogo({ size: buffer.length, buffer }, actor);
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    const [key] = logos.upload.mock.calls[0] as unknown as [string];
    expect(key).toMatch(/^institution\/[0-9a-f-]{36}\.png$/);
    expect(settings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { logoObjectKey: key, logoMime: 'image/png', updatedById: actor.id },
      }),
    );
    expect(logos.delete).toHaveBeenCalledWith(OLD_KEY);
    expect(view.logo?.mime).toBe('image/png');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.logo.update',
        beforeState: { hadLogo: true },
        afterState: expect.objectContaining({ mime: 'image/png', width: 200, height: 100 }),
      }),
    );
  });

  it('JPEG se guarda como .jpg con image/jpeg', async () => {
    const { service, logos } = setup();
    const buffer = jpegBytes();
    const view = await service.uploadLogo({ size: buffer.length, buffer }, actor);
    expect((logos.upload.mock.calls[0] as unknown as [string])[0]).toMatch(/\.jpg$/);
    expect(view.logo?.mime).toBe('image/jpeg');
    expect(logos.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['sin archivo', undefined, 400, 'FILE_REQUIRED'],
    ['vacío', Buffer.alloc(0), 400, 'EMPTY_FILE'],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 415, 'UNSUPPORTED_IMAGE'],
    ['PNG dañado', pngBytes().subarray(0, 16), 415, 'INVALID_IMAGE'],
  ])('%s → %i %s sin llamar al antivirus ni a S3', async (_n, buffer, status, code) => {
    const { service, scanner, logos } = setup();
    const file = buffer ? { size: buffer.length, buffer } : undefined;
    expect(await errorOf(service.uploadLogo(file, actor))).toMatchObject({
      status,
      body: { code },
    });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(logos.upload).not.toHaveBeenCalled();
  });

  it('infectado → 422 FILE_INFECTED; sin antivirus → 503; nada se sube', async () => {
    const { service, scanner, logos } = setup();
    const buffer = pngBytes();
    scanner.scan.mockResolvedValueOnce({ status: 'INFECTED', signature: 'Eicar' } as never);
    expect(await errorOf(service.uploadLogo({ size: 1, buffer }, actor))).toMatchObject({
      status: 422,
      body: { code: 'FILE_INFECTED' },
    });
    scanner.scan.mockRejectedValueOnce(new ScannerUnavailableError('down'));
    expect(await errorOf(service.uploadLogo({ size: 1, buffer }, actor))).toMatchObject({
      status: 503,
      body: { code: 'SCANNER_UNAVAILABLE' },
    });
    scanner.scan.mockResolvedValueOnce({ status: 'TOO_LARGE' } as never);
    expect((await errorOf(service.uploadLogo({ size: 1, buffer }, actor))).status).toBe(413);
    expect(logos.upload).not.toHaveBeenCalled();
  });

  it('S3 caído → 503 STORAGE_UNAVAILABLE sin tocar la fila', async () => {
    const { service, logos, settings } = setup();
    logos.upload.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const buffer = pngBytes();
    expect(await errorOf(service.uploadLogo({ size: 1, buffer }, actor))).toMatchObject({
      status: 503,
      body: { code: 'STORAGE_UNAVAILABLE' },
    });
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('si la fila no se actualiza, borra el objeto nuevo y conserva el anterior', async () => {
    const { service, state, logos, audit } = setup({
      logoObjectKey: OLD_KEY,
      logoMime: 'image/png',
    });
    state.failUpdate = true;
    const buffer = pngBytes();
    await expect(service.uploadLogo({ size: 1, buffer }, actor)).rejects.toThrow('db');
    const [newKey] = logos.upload.mock.calls[0] as unknown as [string];
    expect(logos.delete).toHaveBeenCalledWith(newKey);
    expect(logos.delete).not.toHaveBeenCalledWith(OLD_KEY);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('si falla el borrado del logo anterior, la subida igual termina', async () => {
    const { service, logos } = setup({ logoObjectKey: OLD_KEY, logoMime: 'image/png' });
    logos.delete.mockRejectedValueOnce(new Error('s3'));
    const buffer = pngBytes();
    await expect(service.uploadLogo({ size: 1, buffer }, actor)).resolves.toMatchObject({
      logo: { mime: 'image/png' },
    });
  });
});
