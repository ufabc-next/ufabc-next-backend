import { helpFormSchema } from '@/schemas/help.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
const plugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/form',
    {
      schema: helpFormSchema,
    },
    async (request, reply) => {
      const formData = request.body;

      await app.job.dispatch('InsertNotionPage', formData);
    },
  );
};

export default plugin;
