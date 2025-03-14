import type { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';
import { z } from '@/lib/custom-zod.js';

export const syncEnrollmentsSchema = {
  body: z.object({
    season: z.string(),
    link: z.string().url(),
    hash: z.string().optional(),
  }),
} satisfies FastifyZodOpenApiSchema;
