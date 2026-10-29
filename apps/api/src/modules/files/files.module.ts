import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { StorageModule } from '../storage/index.js';
import { CLAMAV_CONFIG, loadClamavConfig } from './clamav.config.js';
import { ClamavFileScanner } from './clamav.scanner.js';
import { FileScanner } from './file-scanner.js';
import { FilesController } from './files.controller.js';
import { FilesEventPublisher } from './files-events.js';
import { FilesService } from './files.service.js';

// Archivos de Dev 3 (RF-33..35, RF-40, RNF-03/18), fase 3b: intent de subida, confirmación con
// validación PDF y antivirus, URL de descarga. Registrado por el orquestador el 29/10/2026.
// Exporta FilesEventPublisher (submission.rejected.v1, para Dev 5) y FileScanner.
@Module({
  imports: [StorageModule, AcademicModule],
  controllers: [FilesController],
  providers: [
    { provide: CLAMAV_CONFIG, useFactory: () => loadClamavConfig() },
    { provide: FileScanner, useClass: ClamavFileScanner },
    FilesEventPublisher,
    FilesService,
  ],
  exports: [FilesEventPublisher, FileScanner, StorageModule],
})
export class FilesModule {}
