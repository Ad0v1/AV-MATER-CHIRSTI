import { Logger } from '@nestjs/common';
import { AcademicEventPublisher } from './academic-events.js';

const closed = {
  type: 'period.closed.v1',
  payload: { periodId: 'p1', academicYearId: 'y1', closedAt: '2026-05-05T00:00:00.000Z' },
} as const;

describe('AcademicEventPublisher (D-031)', () => {
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entrega el evento a los handlers del tipo y permite desuscribirse', () => {
    const events = new AcademicEventPublisher();
    const handler = vi.fn();
    const other = vi.fn();
    const off = events.on('period.closed.v1', handler);
    events.on('period.reopened.v1', other);

    events.publish(closed);
    expect(handler).toHaveBeenCalledWith(closed);
    expect(other).not.toHaveBeenCalled();

    off();
    events.publish(closed);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('un handler que falla no corta a los demás ni lanza', async () => {
    const events = new AcademicEventPublisher();
    const after = vi.fn();
    events.on('period.closed.v1', () => {
      throw new Error('sync');
    });
    events.on('period.closed.v1', () => Promise.reject(new Error('async')));
    events.on('period.closed.v1', after);

    expect(() => events.publish(closed)).not.toThrow();
    expect(after).toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logError).toHaveBeenCalledTimes(2);
  });
});
