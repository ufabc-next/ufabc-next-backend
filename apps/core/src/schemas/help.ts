import { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';
import { z } from 'zod';

const helpFormBody = z.object({
  email: z.string().email(),
  ra: z.string(),
  problemTitle: z
    .string()
    .max(120)
    .openapi({ description: 'pequeno titulo explicando o problema' }),
  problemDescription: z
    .string()
    .max(5000)
    .openapi({ description: 'descrição do problema' }),
});

export const helpFormSchema = {
  tags: ['help'],
  body: helpFormBody,
} satisfies FastifyZodOpenApiSchema;

export type HelpForm = z.infer<typeof helpFormBody>;
