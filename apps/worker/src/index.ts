// Lanzador fino del worker (Dev 5, RNF-19, U1). Los procesadores viven en apps/api
// (src/worker.main.ts y src/modules/jobs): aqui solo se arranca ese proceso y se le reenvian
// las senales de apagado para que termine los trabajos en curso.
type ChildProcess = {
  kill(signal: string): boolean;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void;
};
type ChildProcessModule = {
  spawn(
    command: string,
    args: string[],
    options: { stdio: 'inherit'; env: Record<string, string | undefined> },
  ): ChildProcess;
};

const { spawn } = require('node:child_process') as ChildProcessModule;
const { existsSync } = require('node:fs') as { existsSync(path: string): boolean };
const { resolve } = require('node:path') as { resolve(...parts: string[]): string };

const entry = resolve(__dirname, '../../api/dist/worker.main.js');

// A4 (Dev 1): en desarrollo (`--wait`) el worker NO compila la API: `api dev`/`start:dev`
// (nest --watch) es el unico que escribe apps/api/dist. Aqui solo se espera a que exista el
// punto de entrada (nest borra dist al arrancar y lo vuelve a generar). Sin `--wait`: falla ya.
const WAIT = process.argv.includes('--wait');
const WAIT_MS = 120_000;

function start(): void {
  const child = spawn(process.execPath, ['--enable-source-maps', entry], {
    stdio: 'inherit',
    env: process.env,
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (existsSync(entry)) {
  // Margen para que nest termine de escribir todos los archivos si justo esta compilando.
  setTimeout(start, WAIT ? 1500 : 0);
} else if (!WAIT) {
  console.error(`worker: no existe ${entry}. Ejecuta primero: pnpm --filter api build`);
  process.exit(1);
} else {
  console.log(
    'worker: esperando a que la API compile apps/api/dist (pnpm --filter api start:dev)...',
  );
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (existsSync(entry)) {
      clearInterval(timer);
      setTimeout(start, 3000);
    } else if (Date.now() - startedAt > WAIT_MS) {
      clearInterval(timer);
      console.error(
        `worker: ${entry} no aparecio en ${WAIT_MS / 1000} s. Arranca la API en modo dev.`,
      );
      process.exit(1);
    }
  }, 1000);
}
