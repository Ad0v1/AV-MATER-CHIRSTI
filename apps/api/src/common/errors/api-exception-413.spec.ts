import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import {
  ApiExceptionFilter,
  PAYLOAD_TOO_LARGE_MESSAGE,
  isPayloadTooLarge,
} from './api-exception.filter.js';

// 413 de body-parser (cambio autorizado por el usuario, Decisión del orquestador 5 de la F6).

function hostFor() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ header: () => 'req-1' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('ApiExceptionFilter: 413', () => {
  it('isPayloadTooLarge reconoce status o statusCode 413', () => {
    expect(isPayloadTooLarge({ status: 413 })).toBe(true);
    expect(isPayloadTooLarge({ statusCode: 413 })).toBe(true);
    expect(isPayloadTooLarge({ status: 400 })).toBe(false);
    expect(isPayloadTooLarge(null)).toBe(false);
    expect(isPayloadTooLarge('413')).toBe(false);
  });

  it('el error de body-parser responde 413 PAYLOAD_TOO_LARGE en español, sin detalles', () => {
    const { host, res } = hostFor();
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      limit: 524288,
    });
    new ApiExceptionFilter().catch(error, host);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'PAYLOAD_TOO_LARGE', message: PAYLOAD_TOO_LARGE_MESSAGE, details: [] },
      requestId: 'req-1',
    });
  });

  it('las HttpException y los errores no controlados no cambian', () => {
    const http = hostFor();
    new ApiExceptionFilter().catch(new BadRequestException('x'), http.host);
    expect(http.res.status).toHaveBeenCalledWith(400);
    const other = hostFor();
    new ApiExceptionFilter().catch(new Error('boom'), other.host);
    expect(other.res.status).toHaveBeenCalledWith(500);
  });
});
