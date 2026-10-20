// Almacen de sesiones intercambiable: Redis en produccion, memoria en pruebas.
export abstract class SessionStore {
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  abstract get(key: string): Promise<string | null>;
  abstract del(key: string): Promise<void>;
}

export class MemorySessionStore extends SessionStore {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  del(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}
