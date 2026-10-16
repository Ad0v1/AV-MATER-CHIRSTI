import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { STORAGE_CLIENT, STORAGE_CONFIG } from './storage.constants';
import { loadStorageConfig } from './storage.config';
import { StorageService } from './storage.service';
import { StorageConfig } from './storage.types';

/**
 * Módulo de almacenamiento (Dev 3). Lo importan contents, submissions y, más adelante,
 * los módulos de Dev 4 (visor PDF) y Dev 5 (ZIP masivo, purga).
 */
@Module({
  providers: [
    { provide: STORAGE_CONFIG, useFactory: () => loadStorageConfig() },
    {
      provide: STORAGE_CLIENT,
      inject: [STORAGE_CONFIG],
      useFactory: (config: StorageConfig) =>
        new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: config.forcePathStyle,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
