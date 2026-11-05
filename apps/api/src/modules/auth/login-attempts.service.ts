import { Inject, Injectable } from '@nestjs/common';
import { SessionStore } from '../../common/session/session.store.js';
import { ENV, type Env } from '../../config/config.module.js';

// Bloqueo temporal por cuenta (RF-75, D-061): N fallos seguidos dentro de la ventana bloquean el
// ingreso por la misma cantidad de tiempo. Se cuenta por codigo, exista o no, para que el
// contador no revele que codigos estan registrados. Se suma al limite por IP del controlador.
@Injectable()
export class LoginAttemptsService {
  constructor(
    private readonly store: SessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async isLocked(code: string): Promise<boolean> {
    return (await this.store.get(this.lockKey(code))) !== null;
  }

  // Cuenta un fallo. Devuelve true solo en el fallo que acaba de bloquear la cuenta.
  async registerFailure(code: string): Promise<boolean> {
    const failures = await this.store.incr(this.failKey(code), this.env.LOGIN_LOCK_SECONDS);
    if (failures < this.env.LOGIN_MAX_FAILED_ATTEMPTS) return false;
    return this.store.setIfAbsent(this.lockKey(code), '1', this.env.LOGIN_LOCK_SECONDS);
  }

  // Un ingreso correcto reinicia el contador.
  clear(code: string): Promise<void> {
    return this.store.del(this.failKey(code));
  }

  // Levanta el bloqueo y reinicia el contador (recuperacion de contrasena por correo, RF-82).
  async unlock(code: string): Promise<void> {
    await this.store.del(this.failKey(code));
    await this.store.del(this.lockKey(code));
  }

  private failKey(code: string): string {
    return `login-fail:${code}`;
  }

  private lockKey(code: string): string {
    return `login-lock:${code}`;
  }
}
