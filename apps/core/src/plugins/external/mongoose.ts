import type { FastifyInstance } from 'fastify';
import mongoose, { connect, type Mongoose } from 'mongoose';
import fp from 'fastify-plugin';

declare module 'fastify' {
  export interface FastifyInstance {
    mongoose: Mongoose;
  }
}

export default fp(
  async (app: FastifyInstance) => {
    app.decorate('mongoose', await connect(app.config.MONGODB_CONNECTION_URL));
    app.log.info('[MONGOOSE] connected');

    app.addHook('onClose', async (instance) => {
      await instance.mongoose.disconnect();
    });

    mongoose.set('debug', (collection, method, query, doc) => {
      app.log.debug({ query, doc }, `[MONGOOSE] ${collection}.${method}`);
    });
  },
  { name: 'mongoose' },
);
