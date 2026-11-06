import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.js';
import {
  RECOVERY_CODE_COUNT,
  RecoveryCodesService,
  normalizeRecoveryCode,
} from './recovery-codes.service.js';

type Row = { userId: string; codeHash: string; usedAt: Date | null };

function setup(keyByte = 3) {
  const rows: Row[] = [];
  const prisma = {
    recoveryCode: {
      deleteMany: vi.fn((args: { where: { userId: string } }) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]!.userId === args.where.userId) rows.splice(i, 1);
        }
        return Promise.resolve({ count: 0 });
      }),
      createMany: vi.fn((args: { data: Array<{ userId: string; codeHash: string }> }) => {
        for (const d of args.data) rows.push({ ...d, usedAt: null });
        return Promise.resolve({ count: args.data.length });
      }),
      updateMany: vi.fn(
        (args: { where: { userId: string; codeHash: string; usedAt: null }; data: object }) => {
          const hit = rows.filter(
            (r) =>
              r.userId === args.where.userId && r.codeHash === args.where.codeHash && !r.usedAt,
          );
          for (const r of hit) r.usedAt = new Date();
          return Promise.resolve({ count: hit.length });
        },
      ),
      count: vi.fn((args: { where: { userId: string; usedAt: null } }) =>
        Promise.resolve(rows.filter((r) => r.userId === args.where.userId && !r.usedAt).length),
      ),
    },
  };
  const env = { TOTP_ENCRYPTION_KEY: Buffer.alloc(32, keyByte).toString('base64') } as Env;
  return {
    rows,
    prisma,
    service: new RecoveryCodesService(prisma as unknown as PrismaService, env),
  };
}

describe('RecoveryCodesService (RF-85)', () => {
  it('entrega 10 codigos distintos con formato XXXXX-XXXXX y guarda solo su hash', async () => {
    const { service, rows } = setup();
    const codes = await service.issue('u1');
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    expect(rows).toHaveLength(RECOVERY_CODE_COUNT);
    const stored = JSON.stringify(rows);
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(normalizeRecoveryCode(code));
    }
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.codeHash))).toBe(true);
  });

  it('un codigo sirve una sola vez, sin importar mayusculas, guion ni espacios', async () => {
    const { service } = setup();
    const [first, second] = await service.issue('u1');
    expect(await service.consume('u1', first!.toLowerCase())).toBe(true);
    expect(await service.consume('u1', first!)).toBe(false);
    expect(await service.consume('u1', second!.replace('-', ' '))).toBe(true);
    expect(await service.remaining('u1')).toBe(RECOVERY_CODE_COUNT - 2);
  });

  it('un codigo de otro usuario o inventado no sirve', async () => {
    const { service } = setup();
    const [code] = await service.issue('u1');
    await service.issue('u2');
    expect(await service.consume('u2', code!)).toBe(false);
    expect(await service.consume('u1', 'AAAAA-AAAAA')).toBe(false);
    expect(await service.consume('u1', 'corto')).toBe(false);
    expect(await service.remaining('u1')).toBe(RECOVERY_CODE_COUNT);
  });

  it('emitir de nuevo invalida el juego anterior', async () => {
    const { service } = setup();
    const [old] = await service.issue('u1');
    const fresh = await service.issue('u1');
    expect(await service.consume('u1', old!)).toBe(false);
    expect(await service.consume('u1', fresh[0]!)).toBe(true);
  });

  it('revokeAll borra todos los codigos del usuario y solo los suyos', async () => {
    const { service } = setup();
    await service.issue('u1');
    await service.issue('u2');
    await service.revokeAll('u1');
    expect(await service.remaining('u1')).toBe(0);
    expect(await service.remaining('u2')).toBe(RECOVERY_CODE_COUNT);
  });

  it('el hash depende de la clave del servidor', () => {
    expect(setup(3).service.hash('ABCDEFGHJK')).not.toBe(setup(4).service.hash('ABCDEFGHJK'));
    expect(setup(3).service.hash('ABCDEFGHJK')).toBe(setup(3).service.hash('ABCDEFGHJK'));
  });
});
