import { Logger } from '@nestjs/common';
import { ContentsEventPublisher, type ContentsEvent } from './contents-events.js';

const created: ContentsEvent = {
  type: 'assignment.created.v1',
  payload: {
    assignmentId: 'a',
    courseSectionId: 'cs',
    periodId: 'p',
    dueAt: '2099-01-01T00:00:00.000Z',
    allowLate: false,
    createdAt: '2026-10-29T00:00:00.000Z',
  },
};

describe('ContentsEventPublisher (D-031)', () => {
  it('entrega el evento a los suscriptores del tipo y permite desuscribirse', () => {
    const publisher = new ContentsEventPublisher();
    const seen: string[] = [];
    const off = publisher.on(
      'assignment.created.v1',
      (e) => void seen.push(e.payload.assignmentId),
    );
    publisher.on('assignment.updated.v1', () => void seen.push('otro'));
    publisher.publish(created);
    off();
    publisher.publish(created);
    expect(seen).toEqual(['a']);
  });

  it('un handler que falla no corta a los demás ni lanza', async () => {
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const publisher = new ContentsEventPublisher();
    const seen: string[] = [];
    publisher.on('assignment.created.v1', () => {
      throw new Error('falla con dato sensible');
    });
    publisher.on('assignment.created.v1', () => Promise.reject(new Error('async')));
    publisher.on('assignment.created.v1', () => void seen.push('ok'));
    expect(() => publisher.publish(created)).not.toThrow();
    await Promise.resolve();
    expect(seen).toEqual(['ok']);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.flat().join(' ')).not.toContain('dato sensible');
    spy.mockRestore();
  });
});
