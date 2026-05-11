import type { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';

import { z } from 'zod';

const paginatedGraduationSubjectsSchema = z.object({
  total: z.number().int(),
  pages: z.number().int(),
  data: z
    .object({
      name: z.string(),
      credits: z.number().int().optional(),
      _id: z.coerce.string(),
      category: z.string().nullish(),
      year: z.number().int(),
      quad: z.number().int(),
      UFCode: z.string(),
    })
    .array(),
});

export type PaginatedGraduationSubjectsSchema = z.infer<
  typeof paginatedGraduationSubjectsSchema
>;

export const listGraduationsSubjectsSchema = {
  
  querystring: z.object({
    limit: z.coerce.number().int().default(25),
    page: z.coerce.number().int().default(1),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: paginatedGraduationSubjectsSchema,
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;

export const listGraduationsSubjectsByIdSchema = {
  
  params: z.object({
    graduationId: z.string(),
  }),
  querystring: z.object({
    limit: z.number().int().default(200),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            docs: z.any(),
          }),
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;
