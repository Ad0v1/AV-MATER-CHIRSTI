import { describe, expect, it, vi } from 'vitest';
import { recordAnnouncement } from '../../modules/announcements/announcements-audit.js';
import { recordContents } from '../../modules/contents/contents-audit.js';
import { recordFiles } from '../../modules/files/files-audit.js';
import { recordGrading } from '../../modules/grading/grading-audit.js';
import { recordSettings } from '../../modules/settings/settings-audit.js';
import type { AuditService, AuditTx } from './audit.service.js';

// D-047: con tx el fallo de la bitácora se propaga (revierte la transacción); sin tx el
// comportamiento de siempre: se llama con un solo argumento y el fallo solo va al log.
const actor = { id: 'u1', ip: '127.0.0.1' };
const state = { state: 'NE', value: null, source: 'MANUAL' } as never;
const tx = { auditLog: { create: vi.fn() } } as unknown as AuditTx;

type Call = (audit: AuditService, withTx: boolean) => Promise<void>;
const calls: Record<string, Call> = {
  contents: (a, t) =>
    recordContents(
      a,
      actor,
      'assignment.created',
      'Assignment',
      'e1',
      { after: {} },
      t ? tx : undefined,
    ),
  grading: (a, t) =>
    recordGrading(
      a,
      actor,
      'grade.create',
      'g1',
      { after: state, changedFields: [], assignmentId: 'a', enrollmentId: 'e' },
      t ? tx : undefined,
    ),
  settings: (a, t) => recordSettings(a, actor, 'settings.update', {}, t ? tx : undefined),
  files: (a, t) => recordFiles(a, actor, 'upload.accepted', 'f1', {}, t ? tx : undefined),
  announcements: (a, t) =>
    recordAnnouncement(a, actor, 'announcement.create', 'n1', {}, t ? tx : undefined),
};

describe('D-047: bitácora con y sin tx', () => {
  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: sin tx llama record con un solo argumento y el fallo no lanza`, async () => {
      const record = vi.fn().mockRejectedValue(new Error('sink caído'));
      await expect(call({ record } as unknown as AuditService, false)).resolves.toBeUndefined();
      expect(record).toHaveBeenCalledTimes(1);
      expect(record.mock.calls[0]).toHaveLength(1);
    });

    it(`${name}: con tx pasa la tx y propaga el fallo`, async () => {
      const record = vi.fn().mockRejectedValue(new Error('auditLog.create falló'));
      await expect(call({ record } as unknown as AuditService, true)).rejects.toThrow(
        'auditLog.create falló',
      );
      expect(record.mock.calls[0][1]).toBe(tx);
    });
  }
});
