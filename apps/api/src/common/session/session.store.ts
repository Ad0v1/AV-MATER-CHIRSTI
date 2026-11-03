// Almacen de sesiones intercambiable: Redis en produccion, memoria en pruebas.
export abstract class SessionStore {
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  // Guarda solo si la clave no existe, de forma atomica. Devuelve true si la guardo.
  abstract setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  abstract get(key: string): Promise<string | null>;
  abstract del(key: string): Promise<void>;
}

export class MemorySessionStore extends SessionStore {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  // Sin await entre comprobar y guardar: en un solo hilo de JS esto es atomico, como SET NX en Redis.
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt > Date.now()) return Promise.resolve(false);
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve(true);
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
