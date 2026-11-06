import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/config.module.js';
import { SessionStore } from './session.store.js';

@Injectable()
export class RedisSessionStore extends SessionStore implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSessionStore.name);
  private readonly redis: Redis;

  constructor(@Inject(ENV) env: Env) {
    super();
    this.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    // Sin este listener, ioredis imprime "Unhandled error event" en cada reintento.
    this.redis.on('error', (err: Error) => this.logger.error(`Redis: ${err.message}`));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.redis.incr(key);
    // Solo la primera vez: la ventana no se alarga con cada intento.
    if (value === 1) await this.redis.expire(key, ttlSeconds);
    return value;
  }

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
