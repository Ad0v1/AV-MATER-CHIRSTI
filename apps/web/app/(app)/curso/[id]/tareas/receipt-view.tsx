// Constancia de entrega (RF-39), visible en el historial y tras entregar (INFORME 15 de UX):
// frases cortas y el código en un elemento con aria-label para que el lector no lo deletree.
// Sin hooks propios (el botón de descarga es un componente cliente): se usa desde la página (servidor) y desde el formulario (cliente).
import { formatDateTime, formatDelay, formatSize } from './assignment-format';
import { DownloadFileButton } from './download-file-button';
import type { SubmissionReceipt } from './types';

export function ReceiptView({
  r,
  title,
  downloadable = false,
}: {
  r: SubmissionReceipt;
  title?: string;
  /** Muestra "Descargar mi PDF" (estudiante dueño; el API vuelve a verificar el permiso). */
  downloadable?: boolean;
}) {
  const tail = r.reference.slice(-4);
  return (
    <div className="text-sm">
      <p className="font-medium">
        {title ? `${title}.` : `Versión ${r.versionNumber}.`}
        {!title && r.isOfficial ? ' Es la versión oficial.' : ''}
      </p>
      <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 min-[400px]:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Recibida</dt>
        <dd>{formatDateTime(r.receivedAt)}.</dd>
        <dt className="text-muted-foreground">Puntualidad</dt>
        <dd>{r.isLate ? `Con retraso de ${formatDelay(r.lateBySeconds)}.` : 'A tiempo.'}</dd>
        <dt className="text-muted-foreground">Archivo</dt>
        <dd className="break-words">
          {r.file.originalName}, {formatSize(r.file.sizeBytes)}.
        </dd>
        <dt className="text-muted-foreground">Código de constancia</dt>
        <dd>
          <code
            className="break-all text-xs"
            aria-label={`Código de constancia que termina en ${tail}`}
          >
            {r.reference}
          </code>
        </dd>
      </dl>
      {downloadable && (
        <div className="mt-2">
          <DownloadFileButton
            fileId={r.file.fileId}
            label="Descargar mi PDF"
            ariaLabel={`Descargar el PDF de la versión ${r.versionNumber}`}
          />
        </div>
      )}
    </div>
  );
}
