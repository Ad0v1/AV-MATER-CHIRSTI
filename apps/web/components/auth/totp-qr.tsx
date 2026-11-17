'use client';

// QR de la verificación en dos pasos (D-064): se genera en el navegador con `uqr`, así la clave
// secreta nunca sale hacia un servicio externo. Funciona con la app Contraseñas de iPhone,
// Google Authenticator y Microsoft Authenticator (Android e iOS). Se dibuja con <rect> y sin
// innerHTML, sobre fondo blanco y con margen, como necesitan las cámaras para leerlo.
import { useMemo } from 'react';
import { encode } from 'uqr';

const MARGIN = 4;

export function TotpQr({ otpauthUrl, size = 208 }: { otpauthUrl: string; size?: number }) {
  const qr = useMemo(() => encode(otpauthUrl, { ecc: 'M', border: 0 }), [otpauthUrl]);
  const total = qr.size + MARGIN * 2;

  // Una sola ruta para todos los módulos oscuros: más liviano que un <rect> por módulo.
  const path = useMemo(() => {
    const parts: string[] = [];
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) parts.push(`M${x + MARGIN} ${y + MARGIN}h1v1h-1z`);
      }),
    );
    return parts.join('');
  }, [qr]);

  return (
    <svg
      role="img"
      aria-label="Código QR para configurar la verificación en dos pasos"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
