import { spawn, type ChildProcess } from 'node:child_process';
import type { BackupConfig } from './backup.config.js';

export type ProcessSpec = { command: string; args: string[]; env: NodeJS.ProcessEnv };
export type RunningProcess = {
  child: ChildProcess;
  done: Promise<{ code: number; stderr: string }>;
};

// Arma el comando de mysqldump/mysql. La contrasena viaja por la variable MYSQL_PWD y nunca
// en los argumentos, donde cualquiera podria verla con `ps` o en el historial.
function wrap(cfg: BackupConfig, tool: string, dockerTool: string, args: string[]): ProcessSpec {
  const env = { ...process.env, MYSQL_PWD: cfg.db.password };
  const user = `--user=${cfg.db.user}`;

  if (cfg.BACKUP_MYSQL_CONTAINER) {
    // `-e MYSQL_PWD` sin valor reenvia la variable del entorno actual al contenedor.
    return {
      command: 'docker',
      args: [
        'exec',
        '-i',
        '-e',
        'MYSQL_PWD',
        cfg.BACKUP_MYSQL_CONTAINER,
        dockerTool,
        user,
        ...args,
      ],
      env,
    };
  }
  return {
    command: tool,
    args: [`--host=${cfg.db.host}`, `--port=${cfg.db.port}`, '--protocol=TCP', user, ...args],
    env,
  };
}

export function buildDumpSpec(cfg: BackupConfig): ProcessSpec {
  return wrap(cfg, cfg.MYSQLDUMP_PATH, 'mysqldump', [
    '--single-transaction', // copia consistente sin bloquear la aplicacion
    '--routines',
    '--triggers',
    '--events',
    '--hex-blob',
    '--set-gtid-purged=OFF',
    '--no-tablespaces', // no exige el privilegio PROCESS
    cfg.db.database,
  ]);
}

export function buildMysqlSpec(cfg: BackupConfig, extraArgs: string[]): ProcessSpec {
  return wrap(cfg, cfg.MYSQL_PATH, 'mysql', extraArgs);
}

export function startProcess(spec: ProcessSpec): RunningProcess {
  const child = spawn(spec.command, spec.args, { env: spec.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    // Se guarda solo el final: basta para diagnosticar y no crece sin limite.
    stderr = (stderr + chunk.toString('utf8')).slice(-4000);
  });
  const done = new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    child.on('error', (err) =>
      reject(new Error(`No se pudo ejecutar ${spec.command}: ${err.message}`)),
    );
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
  return { child, done };
}

// Ejecuta una sentencia SQL y devuelve su salida (sin cabeceras).
export async function runQuery(cfg: BackupConfig, sql: string): Promise<string> {
  const proc = startProcess(buildMysqlSpec(cfg, ['-N', '-B', '-e', sql]));
  let out = '';
  proc.child.stdout?.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
  const { code, stderr } = await proc.done;
  if (code !== 0) throw new Error(`mysql fallo (codigo ${code}): ${stderr.trim()}`);
  return out.trim();
}
