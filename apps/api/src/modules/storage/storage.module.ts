import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { STORAGE_CLIENT, STORAGE_CONFIG } from './storage.constants.js';
import { loadStorageConfig } from './storage.config.js';
import { StorageService } from './storage.service.js';
import type { StorageConfig } from './storage.types.js';

/**
 * Módulo de almacenamiento (Dev 3). No se registra en AppModule: lo importan los módulos
 * que lo necesitan (contents, submissions y, más adelante, los de Dev 4 y Dev 5).
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
