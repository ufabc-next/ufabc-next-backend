import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { fastifyAutoload } from '@fastify/autoload';
import { join } from 'node:path';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import scalarApiReference from '@scalar/fastify-api-reference';

export async function buildApp(
  app: FastifyInstance,
  opts: FastifyServerOptions = {},
) {
  // for zod open api
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyAutoload, {
    dir: join(import.meta.dirname, 'plugins/external'),
    options: { ...opts },
  });

  await app.register(fastifyAutoload, {
    dir: join(import.meta.dirname, 'plugins/custom'),
    options: { ...opts },
  });

  app.register(fastifyAutoload, {
    dir: join(import.meta.dirname, 'routes'),
    autoHooks: true,
    cascadeHooks: true,
    ignorePattern: /^.*(?:test|spec|service).(ts|js)$/,
    options: { ...opts },
  });

  app.register(scalarApiReference, {
    routePrefix: '/docs',
  });

  app.worker.setup();
  app.job.setup();

  app.setNotFoundHandler(
    {
      preHandler: app.rateLimit({
        max: 3,
        timeWindow: 500,
      }),
    },
    (request, reply) => {
      request.log.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            params: request.params,
          },
        },
        'Resource not found',
      );

      reply.code(404);

      return { message: 'Not Found' };
    },
  );
}
