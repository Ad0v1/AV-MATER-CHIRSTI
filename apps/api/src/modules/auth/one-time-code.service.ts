import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SessionStore } from '../../common/session/session.store.js';

// Codigos de un solo uso de 6 digitos (RF-80, RF-82, D-061, D-062): vigencia de 5 minutos,
// 5 intentos y reenvio limitado a 1 por minuto y 3 por hora. Se guardan con hash, nunca en claro.
export const CODE_TTL_SECONDS = 5 * 60;
export const CODE_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const RESEND_PER_HOUR = 3;

export type CheckResult<T> =
  | { ok: true; payload: T }
  // EXPIRED: no hay codigo vigente. EXHAUSTED: se agotaron los intentos y el codigo se invalido.
  | { ok: false; reason: 'EXPIRED' | 'WRONG' | 'EXHAUSTED' };

export type SendGate = 'OK' | 'COOLDOWN' | 'HOURLY';

type Stored<T> = { hash: string; payload: T };

@Injectable()
export class OneTimeCodeService {
  constructor(private readonly store: SessionStore) {}

  // Decide si se puede enviar otro codigo a este sujeto. Solo cuenta si se puede enviar.
  async allowSend(namespace: string, subjectId: string): Promise<SendGate> {
    const free = await this.store.setIfAbsent(
      this.key('cool', namespace, subjectId),
      '1',
      RESEND_COOLDOWN_SECONDS,
    );
    if (!free) return 'COOLDOWN';
    const sent = await this.store.incr(this.key('hour', namespace, subjectId), 3600);
    return sent > RESEND_PER_HOUR ? 'HOURLY' : 'OK';
  }

  // Crea un codigo nuevo; el anterior y sus intentos dejan de valer.
  async issue<T>(namespace: string, subjectId: string, payload: T): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.store.del(this.key('attempts', namespace, subjectId));
    const stored: Stored<T> = { hash: this.hash(subjectId, code), payload };
    await this.store.set(
      this.key('code', namespace, subjectId),
      JSON.stringify(stored),
      CODE_TTL_SECONDS,
    );
    return code;
  }

  // Comprueba el codigo sin consumirlo; cada fallo cuenta como intento.
  async check<T>(namespace: string, subjectId: string, code: string): Promise<CheckResult<T>> {
    const raw = await this.store.get(this.key('code', namespace, subjectId));
    if (!raw) return { ok: false, reason: 'EXPIRED' };
    const attempts = Number(
      (await this.store.get(this.key('attempts', namespace, subjectId))) ?? 0,
    );
    if (attempts >= CODE_MAX_ATTEMPTS) {
      await this.consume(namespace, subjectId);
      return { ok: false, reason: 'EXHAUSTED' };
    }

    const stored = JSON.parse(raw) as Stored<T>;
    if (this.same(stored.hash, this.hash(subjectId, code)))
      return { ok: true, payload: stored.payload };

    const failures = await this.store.incr(
      this.key('attempts', namespace, subjectId),
      CODE_TTL_SECONDS,
    );
    if (failures >= CODE_MAX_ATTEMPTS) {
      await this.consume(namespace, subjectId);
      return { ok: false, reason: 'EXHAUSTED' };
    }
    return { ok: false, reason: 'WRONG' };
  }

  async consume(namespace: string, subjectId: string): Promise<void> {
    await this.store.del(this.key('code', namespace, subjectId));
    await this.store.del(this.key('attempts', namespace, subjectId));
  }

  private hash(subjectId: string, code: string): string {
    return createHash('sha256').update(`${subjectId}:${code}`).digest('hex');
  }

  private same(a: string, b: string): boolean {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private key(kind: string, namespace: string, subjectId: string): string {
    return `otc-${kind}:${namespace}:${subjectId}`;
  }
}
