import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
// Hojas client: se sustituyen por funciones con nombre para poder buscarlas en el árbol.
const leaves = vi.hoisted(() => ({
  CreateAssignmentForm: () => null,
  DeleteAssignmentButton: () => null,
  DownloadFileButton: () => null,
  EditAssignmentForm: () => null,
  SubmitForm: () => null,
}));

vi.mock('@/lib/api/server', () => ({ apiServer: api }));
vi.mock('@/lib/session', () => session);
vi.mock('./create-assignment-form', () => ({ CreateAssignmentForm: leaves.CreateAssignmentForm }));
vi.mock('./delete-assignment-button', () => ({
  DeleteAssignmentButton: leaves.DeleteAssignmentButton,
  LIST_HEADING_ID: 't-list',
  LIST_STATUS_ID: 't-list-status',
}));
vi.mock('./download-file-button', () => ({ DownloadFileButton: leaves.DownloadFileButton }));
vi.mock('./edit-assignment-form', () => ({ EditAssignmentForm: leaves.EditAssignmentForm }));
vi.mock('./submit-form', () => ({ SubmitForm: leaves.SubmitForm }));

import Page from './page';
import { ReceiptView } from './receipt-view';
import type { SubmissionReceipt } from './types';

const ID = '0190a6f0-0000-7000-8000-000000000001';
const AID = '0190a6f0-0000-7000-8000-0000000000a1';
const FILE = '0190a6f0-0000-7000-8000-0000000000f1';
const stubs = new Set<unknown>(Object.values(leaves));

type Found = { type: unknown; props: Record<string, unknown> };

/** Expande componentes (incluso async) salvo las hojas simuladas; junta hojas y textos. */
async function walk(node: unknown, out: Found[], texts: string[]): Promise<void> {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) await walk(n, out, texts);
    return;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    if (stubs.has(el.type)) {
      out.push({ type: el.type, props: el.props });
      return;
    }
    const render = el.type as (p: unknown) => unknown;
    await walk(await render(el.props), out, texts);
    return;
  }
  await walk(el.props?.children, out, texts);
}

async function renderPage(role: string, items: unknown[], extra?: (path: string) => unknown) {
  session.requireUser.mockResolvedValue({ role });
  api.get.mockImplementation(async (path: string) => {
    const custom = extra?.(path);
    if (custom !== undefined) return custom;
    if (path.endsWith('/assignments')) return { items };
    if (path.endsWith('/context')) return { periods: [], currentPeriodId: null };
    if (path.endsWith('/submissions/me')) {
      return {
        submissionId: null,
        displayStatus: 'PENDING',
        isLate: false,
        isOverdue: false,
        latestVersion: null,
        versions: [],
      };
    }
    if (path.endsWith('/submissions')) return { items: [] };
    throw new Error(`ruta inesperada ${path}`);
  });
  const out: Found[] = [];
  const texts: string[] = [];
  await walk(Page({ params: Promise.resolve({ id: ID }) }), out, texts);
  return { out, texts, has: (t: unknown) => out.some((f) => f.type === t) };
}

const assignment = (periodIsOpen: boolean) => ({
  id: AID,
  periodId: ID,
  title: 'Práctica 1',
  instructions: 'Resolver',
  dueAt: '2099-01-01T00:00:00.000Z',
  maxSizeBytes: 20971520,
  noSubmissionGrade: '0.00',
  allowLate: false,
  periodIsOpen,
});

beforeEach(() => vi.clearAllMocks());

describe('Tareas: botones Editar y Eliminar (RF-29, RF-30, RN-10)', () => {
  it('RF-29: TEACHER con período abierto ve Editar y Eliminar', async () => {
    const r = await renderPage('TEACHER', [assignment(true)]);
    expect(r.has(leaves.EditAssignmentForm)).toBe(true);
    expect(r.has(leaves.DeleteAssignmentButton)).toBe(true);
    expect(r.texts).toContain('Editar tarea');
  });

  it('RF-29: ADMIN con período abierto también los ve', async () => {
    const r = await renderPage('ADMIN', [assignment(true)]);
    expect(r.has(leaves.EditAssignmentForm)).toBe(true);
    expect(r.has(leaves.DeleteAssignmentButton)).toBe(true);
  });

  it('RN-10: con período cerrado no aparecen Editar ni Eliminar', async () => {
    const r = await renderPage('TEACHER', [assignment(false)]);
    expect(r.has(leaves.EditAssignmentForm)).toBe(false);
    expect(r.has(leaves.DeleteAssignmentButton)).toBe(false);
    expect(r.texts).not.toContain('Editar tarea');
    expect(r.texts.join('')).toContain('Período cerrado');
  });

  it('RF-29: STUDENT nunca ve Editar ni Eliminar (período abierto o cerrado)', async () => {
    for (const open of [true, false]) {
      const r = await renderPage('STUDENT', [assignment(open)]);
      expect(r.has(leaves.EditAssignmentForm)).toBe(false);
      expect(r.has(leaves.DeleteAssignmentButton)).toBe(false);
      expect(r.has(leaves.CreateAssignmentForm)).toBe(false);
    }
  });

  it('RF-29: un rol sin acceso (GUARDIAN) no ve acciones ni llama a la API', async () => {
    const r = await renderPage('GUARDIAN', [assignment(true)]);
    expect(r.out).toHaveLength(0);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('Tareas: descarga de entregas (RF-39)', () => {
  it('RF-39: el docente ve un botón de descarga por la última versión', async () => {
    const r = await renderPage('TEACHER', [assignment(true)], (p) =>
      p.endsWith(`/assignments/${AID}/submissions`)
        ? {
            items: [
              {
                enrollmentId: 'e1',
                fullName: 'Ana',
                submissionId: 's1',
                latestVersion: {
                  versionId: 'v',
                  versionNumber: 2,
                  receivedAt: '2026-11-01T00:00:00Z',
                  isLate: false,
                  fileId: FILE,
                },
                versionCount: 2,
                displayStatus: 'SUBMITTED',
              },
            ],
          }
        : undefined,
    );
    const d = r.out.find((f) => f.type === leaves.DownloadFileButton);
    expect(d?.props).toMatchObject({
      fileId: FILE,
      label: 'Descargar v2',
      ariaLabel: expect.stringMatching(/^Descargar versión 2 de la entrega de /),
    });
  });
});

describe('ReceiptView (RF-39)', () => {
  const receipt: SubmissionReceipt = {
    reference: 'ABCD-1234-WXYZ',
    submissionId: 's',
    versionId: 'v',
    versionNumber: 1,
    receivedAt: '2026-11-01T10:00:00Z',
    isLate: false,
    lateBySeconds: 0,
    isOfficial: true,
    file: { fileId: FILE, originalName: 'tarea.pdf', sizeBytes: 1024, sha256: 'a' },
  };

  it('RF-39: downloadable muestra el botón con el fileId de la constancia', async () => {
    const out: Found[] = [];
    await walk(ReceiptView({ r: receipt, downloadable: true }), out, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.props).toMatchObject({ fileId: FILE, label: 'Descargar mi PDF' });
  });

  it('RF-39: sin downloadable no hay botón', async () => {
    const out: Found[] = [];
    await walk(ReceiptView({ r: receipt }), out, []);
    expect(out).toHaveLength(0);
  });

  it('RF-39: indica retraso informado', async () => {
    const texts: string[] = [];
    await walk(
      ReceiptView({ r: { ...receipt, isLate: true, lateBySeconds: 125 * 60 } }),
      [],
      texts,
    );
    expect(texts.join('')).toContain('Con retraso de 2 h 5 min.');
  });
});
