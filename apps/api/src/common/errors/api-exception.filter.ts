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
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Error interno del servidor';
    let details: unknown[] = [];
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: unknown };
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
      error: { code: CODE_BY_STATUS[status] ?? 'ERROR', message, details },
      requestId,
    });
  }
}
