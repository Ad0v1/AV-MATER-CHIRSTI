import { Global, Module } from '@nestjs/common';
import { RedisSessionStore } from './redis-session.store.js';
import { SessionService } from './session.service.js';
import { SessionStore } from './session.store.js';

@Global()
@Module({
  providers: [{ provide: SessionStore, useClass: RedisSessionStore }, SessionService],
  exports: [SessionService],
})
export class SessionModule {}
