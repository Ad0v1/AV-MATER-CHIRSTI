import { Module } from '@nestjs/common';
import { CredentialIssuerService } from './credential-issuer.service.js';
import { DniService } from './dni.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { PasswordService } from './password.service.js';
import { UserCodeService } from './user-code.service.js';

// Piezas de credenciales que usan tanto el login como el alta de usuarios (modulo users).
// PrismaModule, SessionModule y ConfigModule son globales.
@Module({
  providers: [
    PasswordService,
    DniService,
    UserCodeService,
    LoginAttemptsService,
    CredentialIssuerService,
  ],
  exports: [
    PasswordService,
    DniService,
    UserCodeService,
    LoginAttemptsService,
    CredentialIssuerService,
  ],
})
export class CredentialsModule {}
