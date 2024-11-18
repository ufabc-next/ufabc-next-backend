import gracefullyShutdown from "close-with-grace";
import { logger } from "@next/common";
import { buildApp } from "./app.js";
import { fastifyPlugin as fp } from "fastify-plugin";

import { fastify, type FastifyServerOptions } from "fastify";

const appOptions = {
  loggerInstance: logger,
} satisfies FastifyServerOptions;

const app = fastify(appOptions);

export async function start() {
  await app.register(fp(buildApp));
  if (process.stdout.isTTY) {
    app.log.info(app.printRoutes());
  }

  app.job.schedule("EnrolledSync");
  app.job.schedule("ComponentsSync");

  gracefullyShutdown({ delay: 500 }, async ({ err, signal }) => {
    if (err) {
      app.log.fatal({ err }, "error starting app");
    }

    app.log.warn(signal, "Gracefully exiting app");

    await app.close();
  });

  await app.ready();

  try {
    await app.listen({
      port: app.config?.PORT,
      host: app.config?.HOST,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
