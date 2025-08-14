import env, { type FastifyEnvOptions } from '@fastify/env';
import { z } from 'zod';

declare module 'fastify' {
  export interface FastifyInstance {
    config: z.infer<typeof configSchema>;
  }
}

const NEXT_WEB_LOCAL = 'http://localhost:3000' as const;
const JWT_SECRET = 'LWp9YJMiUtfQxoepoTL7RkWJi6W5C6ED';

const configSchema = z.object({
  PROTOCOL: z.enum(['http', 'https']).default('http'),
  NODE_ENV: z.enum(['dev', 'test', 'prod']).default('dev'),
  PORT: z.coerce.number().default(5000),
  HOST: z.string().min(4).default('0.0.0.0'),
  JWT_SECRET: z.string().default(JWT_SECRET),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  MONGODB_CONNECTION_URL: z.string().default('mongodb://127.0.0.1:27017/local'),
  REDIS_CONNECTION_URL: z.string().default('redis://localhost:6379'),
  WEB_URL: z.string().default(NEXT_WEB_LOCAL),
  ALLOWED_ORIGINS: z
    .string()
    .transform((origins) => origins.split(','))
    .pipe(z.string().array()),
  UFABC_PARSER_URL: z.string(),
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  USE_LOCALSTACK: z.coerce.boolean().default(true),
  AWS_LOGS_BUCKET: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_ID: z.string(),
  OAUTH_GOOGLE_SECRET: z.string().min(16),
  BACKOFFICE_EMAILS: z
    .string()
    .optional()
    .transform((s) => s?.split(','))
    .pipe(z.string().array()),
  EMAIL_API: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  BOARD_PATH: z.string().optional(),
  OAUTH_NOTION_SECRET: z.string().default('notion_secret'),
  OAUTH_NOTION_CLIENT_ID: z.string().default('notion_client_id'),
  NOTION_DATABASE_ID: z.string().default('teste'),
});

export const autoConfig = {
  schema: z.toJSONSchema(configSchema, {
    target: 'draft-7',
    io: 'input',
  }),
  dotenv: {
    path: '.env.dev',
  },
  confKey: 'config',
} satisfies FastifyEnvOptions;

/**
 * This plugins helps to check environment variables.
 *
 * @see {@link https://github.com/fastify/fastify-env}
 */
export default env;
