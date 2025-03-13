import gracefullyShutdown from 'close-with-grace';
import { buildApp } from './app.js';
import { fastifyPlugin as fp } from 'fastify-plugin';
import { fastify, type FastifyServerOptions } from 'fastify';
import { logger } from './utils/logger.js';
import { JOBS } from './queue/definitions.js';
import type { JobNames } from './queue/types.js';

const appOptions = {
  loggerInstance: logger,
} satisfies FastifyServerOptions;

const app = fastify(appOptions);

export async function start() {
  await app.register(fp(buildApp));
  if (app.config.NODE_ENV === 'dev') {
    app.log.info(app.printRoutes());
  }

  const recurringJobs = Object.entries(JOBS).filter(
    ([_, job]) => job.every != null,
  );

  // for (const [name, _] of recurringJobs) {
  //   const typeSafeName = name as JobNames;
  //   app.job.schedule(typeSafeName);
  // }
  app.job.schedule('EnrolledSync');
  app.job.schedule('ComponentsSync');
  app.job.schedule('LogsUpload');
  app.job.schedule('EnrollmentsSyncAjuste');

  gracefullyShutdown({ delay: 500 }, async ({ err, signal }) => {
    if (err) {
      app.log.fatal({ err }, 'error starting app');
    }

    app.log.warn(signal, 'Gracefully exiting app');

    await app.close();
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
