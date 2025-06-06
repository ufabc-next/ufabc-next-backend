import type { FastifySchema } from 'fastify';
import type { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';
import { z } from 'zod';
import 'zod-openapi/extend';

const SOURCE_TYPE = {
  SOURCE_TYPE_UNSPECIFIED: 'SOURCE_TYPE_UNSPECIFIED',
  ACCOUNT: 'ACCOUNT',
  PROFILE: 'PROFILE',
  DOMAIN_PROFILE: 'DOMAIN_PROFILE',
  CONTACT: 'CONTACT',
  OTHER_CONTACT: 'OTHER_CONTACT',
  DOMAIN_CONTACT: 'DOMAIN_CONTACT	',
} as const;
type SourceType = keyof typeof SOURCE_TYPE;

type Metadata = {
  primary: boolean;
  verified: boolean;
  source: {
    type: SourceType;
    id: string;
  };
  sourcePrimary: boolean;
};

type EmailAddresses = {
  metadata: Metadata;
  value: string;
};

/**
 * @link https://developers.google.com/people/api/rest/v1/people?hl=pt-br#resource:-person
 */
export type GoogleUser = {
  readonly resourceName: string;
  readonly etag: string;
  emailAddresses: EmailAddresses[];
};

/**
 * @description Necessario devido ao token de oauth que utilizamos,
 * user do antigo endpoint de oauth da google
 */
export type LegacyGoogleUser = {
  id: string;
  displayName: string;
  image: {
    url: string;
  };
  emails: Array<{ value: string; account: string }>;
  nickname: string;
  language: string;
  kind: string;
  etag: string;
};

export const loginSchema = {
  querystring: z.object({
    inApp: z.coerce.boolean().default(false).openapi({
      description:
        'Váriavel legada que informava, se o acesso estava acontecendo pelo aplicativo',
      example: false,
    }),
    state: z.string(),
    code: z.string(),
    authuser: z.string(),
    prompt: z.string(),
  }),
  tags: ['Login'],
} satisfies FastifySchema;

export const loginNotionSchema = {
  querystring: z.object({
    code: z.string(),
  }),
  tags: ['Login'],
} satisfies FastifySchema;

export const createCardSchema = {
  body: z.object({
    accessToken: z.string(),
    ra: z.coerce.number(),
    email: z
      .string()
      .email()
      .refine((val) => val.includes('ufabc.edu.br'), {
        message: 'Invalid UFABC email',
      }),
    admissionYear: z.string(),
    proofOfError: z.string(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            data: z.any(),
          }),
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;
