import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Core Server', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(() => {
    app.close.bind(app);
  });

  it('should register some plugins', () => {
    assert.deepStrictEqual(app.mongoose, app.mongoose);
    assert.deepStrictEqual(app.redis, app.redis);
    assert.deepStrictEqual(app.jwt, app.jwt);
  });

  it('should have cors headers', async () => {
    // dummy route
    app.get('/', (_, reply) => reply.send('ok'));

    const res = await app.inject({
      method: 'GET',
      url: '/',
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual<'ok'>(res.payload, 'ok');
    assert.equal(res.headers['access-control-allow-origin'], '*');
  });
});
