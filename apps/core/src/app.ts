import { fastify, type FastifyServerOptions } from 'fastify';
import { fastifyAutoload } from '@fastify/autoload';
import { join } from 'node:path';
import { Config } from './config';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = fastify(opts);

  try {
    app.register(fastifyAutoload, {
      dir: join(__dirname, 'plugins'),
      dirNameRoutePrefix: false,
      encapsulate: false,
      maxDepth: 1,
      options: Config,
    });
    app.register(fastifyAutoload, {
      dir: join(__dirname, 'modules'),
      dirNameRoutePrefix: false,
      encapsulate: false,
      maxDepth: 1,
    });
  } catch (error) {
    app.log.fatal({ error }, 'build app error');
    throw error;
  }

  return app;
}
