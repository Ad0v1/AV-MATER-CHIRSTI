import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { logoStorageProviders } from './institution-logo.storage.js';
import { AdminSettingsController, BrandingController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

// Configuración institucional de Dev 5 (RF-61, U5, U11). FilesModule aporta el FileScanner
// (ClamAV) de Dev 3. LiteralScaleProvider viene de LiteralScaleModule (global). PrismaModule y
// AuditModule son globales. Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  imports: [FilesModule],
  controllers: [AdminSettingsController, BrandingController],
  providers: [...logoStorageProviders, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
