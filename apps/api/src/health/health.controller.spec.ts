import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('responde ok con marca de tiempo ISO', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
