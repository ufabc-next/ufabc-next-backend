import gracefullyShutdown from 'close-with-grace';
import { buildApp } from './app.js';
import { fastifyPlugin as fp } from 'fastify-plugin';
import { fastify, type FastifyServerOptions } from 'fastify';
import { logger } from './utils/logger.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const appOptions = {
  loggerInstance: logger,
  pluginTimeout: 35_000,
} satisfies FastifyServerOptions;

const app = fastify(appOptions).withTypeProvider<ZodTypeProvider>();

export async function start() {
  await app.register(fp(buildApp));
  if (app.config.NODE_ENV === 'dev') {
    app.log.info(app.printRoutes());
  }

  // app.job.schedule('EnrolledSync');
  // app.job.schedule('ComponentsSync');
  // app.job.schedule('EnrollmentSync');
  // app.job.schedule('LogsUpload');

  gracefullyShutdown({ delay: 500 }, async ({ err, signal }) => {
    if (err) {
      app.log.fatal({ err }, 'error starting app');
    }

    app.log.warn(signal, 'Gracefully exiting app');

    await app.close();
  });

  app.get('/openapi.json', async () => {
    return app.swagger();
  });

  await app.ready();

  try {
    await app.listen({
      port: app.config.PORT,
      host: app.config.HOST,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
