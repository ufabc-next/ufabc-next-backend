import assert from 'node:assert';
import { mock } from 'node:test';
import { buildApp } from '@/app.js';

describe('Server startup', () => {
  it('should call start server', () => {
    const buildAppStub = mock.fn(buildApp);
    assert.strictEqual(buildAppStub.mock.calls.length, 1);
    mock.reset();
  });
});
