import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'BUSINESS_RULE_VIOLATION',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Status HTTP 413 de un error que no es HttpException (p. ej. el de body-parser cuando el cuerpo
 * supera el límite, que trae `status` y `statusCode`). Cambio autorizado por el usuario el
 * 29/10/2026 (Decisión del orquestador 5, F6 de Dev 2); PENDIENTE DE REVISIÓN por Dev 1.
 */
export function isPayloadTooLarge(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const e = exception as { status?: unknown; statusCode?: unknown };
  return e.status === 413 || e.statusCode === 413;
}

export const PAYLOAD_TOO_LARGE_MESSAGE = 'El cuerpo de la solicitud supera el tamaño permitido';

// Formato de error acordado en docs/03_CONTRATOS.md.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = req.header('x-request-id') ?? randomUUID();

    const isHttp = exception instanceof HttpException;
    // 413 de body-parser → 413 PAYLOAD_TOO_LARGE, no 500 (ver isPayloadTooLarge).
    const tooLarge = !isHttp && isPayloadTooLarge(exception);
    const status = isHttp
      ? exception.getStatus()
      : tooLarge
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Error interno del servidor';
    let code: string | undefined;
    let details: unknown[] = [];
    if (tooLarge) {
      message = PAYLOAD_TOO_LARGE_MESSAGE;
    } else if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: unknown; code?: unknown };
        if (typeof b.code === 'string') code = b.code;
        if (Array.isArray(b.message)) {
          message = 'Solicitud invalida';
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
      }
    } else {
      // Nunca se filtra el detalle de errores no controlados al cliente.
      this.logger.error(
        `[${requestId}] ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }

    res.status(status).json({
      error: { code: code ?? CODE_BY_STATUS[status] ?? 'ERROR', message, details },
      requestId,
    });
  }
}
