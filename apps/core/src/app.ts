import { type FastifyServerOptions, fastify } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { loadPlugins } from './plugins.js';
import { internalRoutes, nextRoutes, publicRoutes } from './modules/routes.js';
import { nextUserRoutes } from './modules/NextUser/nextUser.module.js';
import { entitiesModule } from './modules/Entities/entities.module.js';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = fastify(opts);
  // Zod validation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  try {
    await loadPlugins(app);
    await app.register(nextUserRoutes, {
      prefix: '/v2',
    });
    await app.register(entitiesModule, {
      prefix: '/v2',
    });
    await app.register(publicRoutes);
    await app.register(nextRoutes, {
      prefix: '/v2',
    });
    await app.register(internalRoutes, {
      prefix: '/v2',
    });
  } catch (error) {
    app.log.fatal({ error }, 'build app error');
    throw error;
  }

  return app;
}
