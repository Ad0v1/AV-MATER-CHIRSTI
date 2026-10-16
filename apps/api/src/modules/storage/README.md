# Módulo `storage` — Dev 3

Servicio de almacenamiento privado para PDF (**RNF-03, RNF-18**). Entregable de Dev 3 en el **Sprint 0** según `docs/fuentes/Plan_Trabajo_Aula_Virtual.pdf`.

> Estado: **propuesta para revisión** en PR hacia `develop`. No crea endpoints todavía.

## Qué hace

| Método | Uso | Lo usará |
|---|---|---|
| `createUploadUrl()` | URL firmada (PUT) para que el navegador suba el PDF directo al bucket | `POST /files/upload-intents` |
| `inspectObject()` | Verifica que el archivo exista, no supere el límite y empiece con `%PDF-` | `POST /files/:id/complete` |
| `createDownloadUrl()` | URL firmada (GET) de corta duración, `attachment` o `inline` | `POST /files/:id/download-url`, visor PDF (Dev 4), ZIP (Dev 5) |
| `deleteObject()` | Borra un objeto | Purga (Dev 5, `file.purge-requested.v1`) |
| `isHealthy()` | Comprueba que el bucket responda | Health check / Uptime Kuma (Dev 1) |
| `buildObjectKey()` | Clave `{scope}/{año}/{mes}/{uuid}.pdf` | Todos los que suban archivos |

**El servicio no decide permisos.** Los controladores que lo llamen deben validar rol y pertenencia antes, con los guards de Dev 1.

## Qué queda fuera del Sprint 0

- Endpoints `/files/*`: necesitan el modelo `File` del esquema Prisma acordado y los guards de Dev 1.
- Validación completa del PDF (cifrado, legible): RF-34, Sprint 2.
- Escaneo con ClamAV: RF-40, Sprint 3.

## Decisiones técnicas (PROPUESTA)

1. **Subida con PUT firmado, no con POST con política.** Cloudflare R2 no admite POST con política, así que se firma un PUT con `Content-Type` y `Content-Length` incluidos. Como respaldo, `inspectObject()` vuelve a verificar tamaño y tipo después de la subida.
2. **MB = MiB (1 048 576 bytes)**, igual que el ejemplo de `docs/03_CONTRATOS.md`. La ERS no lo define; está en `storage.constants.ts` para cambiarlo fácilmente si el equipo decide otra cosa.
3. **La clave del objeto nunca usa el nombre original del archivo.** El nombre visible se guarda en la base de datos y se aplica solo al descargar, ya limpio.
4. **Duración de URLs:** subida 5 minutos, descarga 2 minutos (configurable).

## Dependencias a instalar (en PR aparte, avisando al grupo)

```
pnpm --filter api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Variables de entorno (para `.env.example`, las agrega Dev 1)

```
STORAGE_ENDPOINT=http://minio:9000
STORAGE_REGION=us-east-1          # "auto" en Cloudflare R2
STORAGE_BUCKET=aula-virtual
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true     # true con MinIO
STORAGE_UPLOAD_URL_TTL=300
STORAGE_DOWNLOAD_URL_TTL=120
```

## Propuesta para `docker-compose.yml` (lo integra Dev 1)

```yaml
  minio:
    image: minio/minio   # fijar una versión concreta y verificar que la imagen siga publicada
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"   # API S3
      - "9001:9001"   # consola web
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 2; done;
      mc mb --ignore-existing local/aula-virtual;
      mc anonymous set none local/aula-virtual;
      "
```

El bucket queda **privado** (`anonymous set none`), como exige RNF-03. Para que el navegador pueda subir directo al bucket hará falta configurar CORS con el dominio de la web; eso se acuerda con Dev 1 cuando exista `apps/web`.

## Cómo usarlo desde otro módulo

```ts
@Module({ imports: [StorageModule] })
export class SubmissionsModule {}

// dentro de un servicio:
const key = buildObjectKey('submissions');
const upload = await this.storage.createUploadUrl({
  key,
  contentType: 'application/pdf',
  sizeBytes: dto.sizeBytes,
  maxSizeBytes: assignment.maxSizeBytes,
});
```

## Tests

`storage.service.spec.ts` no necesita MinIO levantado: firmar URLs es un cálculo local y las llamadas a S3 se simulan.
