import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { StorageModule } from '../storage/index.js';
import { CLAMAV_CONFIG, loadClamavConfig } from './clamav.config.js';
import { ClamavFileScanner } from './clamav.scanner.js';
import { FileLifecycleService } from './file-lifecycle.service.js';
import { FileScanner } from './file-scanner.js';
import { FilesController } from './files.controller.js';
import { FilesEventPublisher } from './files-events.js';
import { FilesService } from './files.service.js';

// Archivos de Dev 3 (RF-33..35, RF-40, RNF-03/18), fase 3b: intent de subida, confirmación con
// validación PDF y antivirus, URL de descarga. Registrado por el orquestador el 29/10/2026.
// Exporta FilesEventPublisher (submission.rejected.v1, para Dev 5), FileScanner y
// FileLifecycleService (barrido de intents y purga para el worker de Dev 5, U12 del 30/10/2026).
@Module({
  imports: [StorageModule, AcademicModule],
  controllers: [FilesController],
  providers: [
    { provide: CLAMAV_CONFIG, useFactory: () => loadClamavConfig() },
    { provide: FileScanner, useClass: ClamavFileScanner },
    FilesEventPublisher,
    FilesService,
    FileLifecycleService,
  ],
  exports: [FilesEventPublisher, FileScanner, FileLifecycleService, StorageModule],
})
export class FilesModule {}
