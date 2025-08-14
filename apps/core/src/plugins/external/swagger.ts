import { fastifySwagger } from '@fastify/swagger';
import { fastifyPlugin as fp } from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
} from 'fastify-type-provider-zod';

export async function swagger(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'next - Documentation',
        description: 'Endpoints registrados pelo sistema',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'https://api.v2.ufabcnext.com',
        },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
    hideUntagged: true,
  });

  app.log.info('[PLUGIN] Swagger');
}

export default fp(swagger, { name: 'Documentation' });
