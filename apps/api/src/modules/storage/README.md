# Módulo `storage` — Dev 3

Servicio de almacenamiento privado para PDF (**RNF-03, RNF-18**). Entregable de Dev 3 en el **Sprint 0**.

## Qué hace

| Método | Uso | Lo usará |
|---|---|---|
| `createUploadUrl()` | URL firmada (PUT) para que el navegador suba el PDF directo al bucket | `POST /files/upload-intents` |
| `inspectObject()` | Verifica que el archivo exista, no supere el límite y empiece con `%PDF-` | `POST /files/:id/complete` |
| `createDownloadUrl()` | URL firmada (GET) de corta duración, `attachment` o `inline` | `POST /files/:id/download-url`, visor PDF (Dev 4), ZIP (Dev 5) |
| `deleteObject()` | Borra un objeto | Purga (Dev 5, `file.purge-requested.v1`) |
| `isHealthy()` | Comprueba que el bucket responda | Health check (Dev 1) |
| `buildObjectKey()` | Clave `{scope}/{año}/{mes}/{uuid}.pdf` | Todos los que suban archivos |

**El servicio no decide permisos.** Los controladores que lo llamen deben usar antes `RolesGuard` y la validación de pertenencia.

El módulo **no se registra en `AppModule`**: lo importan los módulos que lo necesitan.

```ts
@Module({ imports: [StorageModule] })
export class SubmissionsModule {}
```

## Configuración

Usa las variables `S3_*` de `.env.example`. En desarrollo no hace falta agregar nada.

| Variable | Por defecto (desarrollo) | Notas |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` | En R2: `https://<cuenta>.r2.cloudflarestorage.com` |
| `S3_REGION` | `us-east-1` | En R2: `auto` |
| `S3_BUCKET` | `aula-privado` | |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | **Obligatorias en producción** |
| `S3_FORCE_PATH_STYLE` | `true` | |
| `S3_UPLOAD_URL_TTL_SECONDS` | `300` | 30 a 3600 |
| `S3_DOWNLOAD_URL_TTL_SECONDS` | `120` | 30 a 3600 |

## Decisiones técnicas (PROPUESTA)

1. **Subida con PUT firmado**: Cloudflare R2 no admite POST con política. Tipo y tamaño quedan firmados y `inspectObject()` vuelve a verificarlos.
2. **MB = MiB (1 048 576 bytes)**, como en `docs/03_CONTRATOS.md`. Pendiente de confirmar en `docs/08_DECISIONES.md`.
3. **La clave del objeto nunca usa el nombre original del archivo.**

## Pendiente

- Endpoints `/files/*` (necesitan el modelo `File` en Prisma).
- Validación completa del PDF (RF-34) y ClamAV (RF-40).
- CORS del bucket para subidas desde `apps/web`.
- Sugerencia para Dev 1: `ApiExceptionFilter` podría respetar el `code` específico que envían las excepciones (`FILE_TOO_LARGE`, `INVALID_PDF`…); hoy usa uno genérico por estado HTTP.

## Tests

```
pnpm --filter api test
```

No necesitan MinIO levantado: firmar URLs es un cálculo local y las llamadas a S3 se simulan.
