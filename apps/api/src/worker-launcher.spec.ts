import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A4 (QA): lanzador del worker (apps/worker/src/index.ts) con y sin `--wait`. El worker no tiene
// runner de tests propio, por eso vive aqui. Se transpila el lanzador real a una carpeta
// temporal con la misma disposicion (worker/dist/index.js y api/dist/worker.main.js) y se ejecuta
// como proceso. Para no esperar 120 s reales, un precargado (-r) adelanta Date.now() cuando se
// pide; setTimeout/setInterval siguen siendo reales (el temporizador de 1 s dispara el chequeo).

const SOURCE = fileURLToPath(new URL('../../worker/src/index.ts', import.meta.url));
const FAKE_MAIN = `console.log('WORKER_STARTED'); process.exit(Number(process.env.FAKE_EXIT ?? 0));`;
const CLOCK_SHIM = `
const real = Date.now.bind(Date);
let calls = 0;
Date.now = () => (process.env.FAKE_CLOCK_JUMP && ++calls > 1 ? real() + 200_000 : real());
`;

let root: string;
let launcher: string;
let shim: string;
let apiDist: string;

type Run = { code: number | null; out: string; err: string; ms: number };

function run(args: string[], env: Record<string, string> = {}, killAfterMs = 15_000): Promise<Run> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['-r', shim, launcher, ...args], {
      env: { ...process.env, ...env },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    const timer = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, ms: Date.now() - started });
    });
  });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'worker-launcher-'));
  mkdirSync(join(root, 'worker', 'dist'), { recursive: true });
  apiDist = join(root, 'api', 'dist');
  mkdirSync(apiDist, { recursive: true });
  launcher = join(root, 'worker', 'dist', 'index.js');
  const js = ts.transpileModule(readFileSync(SOURCE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(launcher, js);
  // Sin package.json con "type": "module" en la carpeta temporal, .js es CommonJS.
  writeFileSync(join(root, 'package.json'), '{"type":"commonjs"}');
  shim = join(root, 'shim.cjs');
  writeFileSync(shim, CLOCK_SHIM);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const entry = () => join(apiDist, 'worker.main.js');
const removeEntry = () => rmSync(entry(), { force: true });

describe('worker launcher: sin --wait (comportamiento previo)', () => {
  it('A4: sin dist falla de inmediato con exit 1 y mensaje de build', async () => {
    removeEntry();
    const r = await run([]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('pnpm --filter api build');
    expect(r.out).not.toContain('esperando');
    expect(r.ms).toBeLessThan(5_000);
  });

  it('A4: con dist arranca el proceso hijo y propaga su codigo de salida', async () => {
    writeFileSync(entry(), FAKE_MAIN);
    const ok = await run([]);
    expect(ok.out).toContain('WORKER_STARTED');
    expect(ok.code).toBe(0);
    const ko = await run([], { FAKE_EXIT: '3' });
    expect(ko.code).toBe(3);
  });
});

describe('worker launcher: --wait', () => {
  it('A4: si dist ya existe arranca tras el margen de 1,5 s, sin mensaje de espera', async () => {
    writeFileSync(entry(), FAKE_MAIN);
    const r = await run(['--wait']);
    expect(r.out).toContain('WORKER_STARTED');
    expect(r.out).not.toContain('esperando');
    expect(r.code).toBe(0);
    expect(r.ms).toBeGreaterThanOrEqual(1_400);
  });

  it('A4: sin dist espera y arranca cuando la API lo compila', async () => {
    removeEntry();
    const pending = run(['--wait'], {}, 20_000);
    setTimeout(() => writeFileSync(entry(), FAKE_MAIN), 2_500);
    const r = await pending;
    expect(r.out).toContain('esperando a que la API compile');
    expect(r.out).toContain('WORKER_STARTED');
    expect(r.code).toBe(0);
    // Aparece a ~2,5 s, se detecta en el siguiente sondeo (1 s) y se suma el margen de 3 s.
    expect(r.ms).toBeGreaterThanOrEqual(5_000);
  }, 30_000);

  it('A4: si dist nunca aparece, expira a los 120 s (reloj adelantado) con exit 1', async () => {
    removeEntry();
    const r = await run(['--wait'], { FAKE_CLOCK_JUMP: '1' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('no aparecio en 120 s');
    expect(r.out).not.toContain('WORKER_STARTED');
  }, 30_000);

  it('A4: justo antes del limite todavia espera (reloj real, 3 s sin expirar)', async () => {
    removeEntry();
    const r = await run(['--wait'], {}, 3_500);
    // Matado por el test a los 3,5 s: seguia esperando, no salio con exit 1 por timeout.
    expect(r.err).not.toContain('no aparecio');
    expect(r.code).not.toBe(1);
  }, 10_000);
});
