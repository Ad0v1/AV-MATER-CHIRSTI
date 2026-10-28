import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { BackupConfig } from './backup.config.js';
import { parseBackupKey, type BackupEntry } from './backup-naming.js';

export function createS3(cfg: BackupConfig): S3Client {
  return new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY },
  });
}

// En produccion el bucket lo crea quien administra R2; en local se crea solo.
export async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

// Lista solo los respaldos reconocibles de esta base; cualquier otro archivo se ignora.
export async function listBackups(s3: S3Client, cfg: BackupConfig): Promise<BackupEntry[]> {
  const found: BackupEntry[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: cfg.S3_BACKUP_BUCKET,
        Prefix: cfg.BACKUP_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const entry = obj.Key ? parseBackupKey(obj.Key, cfg.BACKUP_PREFIX, cfg.db.database) : null;
      if (entry) found.push(entry);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return found.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function deleteKeys(s3: S3Client, bucket: string, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
