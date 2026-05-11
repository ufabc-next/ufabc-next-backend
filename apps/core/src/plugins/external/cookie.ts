import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';

import type { Auth } from '@/schemas/auth.ts';

declare module 'fastify' {
  interface Session {
    user: Auth;
  }
}

export default fp(
  async (app: FastifyInstance) => {
    app.register(fastifyCookie as unknown as FastifyPluginCallback);
  },
  {
    name: 'cookie',
  }
);
