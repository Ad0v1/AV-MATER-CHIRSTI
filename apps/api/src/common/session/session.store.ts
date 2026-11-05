// Almacen de sesiones intercambiable: Redis en produccion, memoria en pruebas.
export abstract class SessionStore {
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  // Guarda solo si la clave no existe, de forma atomica. Devuelve true si la guardo.
  abstract setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  // Suma 1 al contador de la clave y devuelve el valor nuevo. El tiempo de vida se fija al crearlo
  // y no se renueva: es una ventana fija, como la del bloqueo por intentos fallidos (RF-75).
  abstract incr(key: string, ttlSeconds: number): Promise<number>;
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

  incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.data.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.data.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
      return Promise.resolve(1);
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return Promise.resolve(next);
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
