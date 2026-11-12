// Tipos minimos de Node para el lanzador (el paquete no depende de @types/node a proposito:
// todo el codigo del worker vive en apps/api, U1).
declare const __dirname: string;
declare function require(id: string): unknown;
declare const process: {
  execPath: string;
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): void;
  exit(code?: number): never;
};
