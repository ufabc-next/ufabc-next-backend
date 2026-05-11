import type {
  RawServerBase,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
} from 'fastify';

declare module 'fastify' {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault
  > {
    redis: {
      keys(pattern: string): Promise<string[]>;
      get(key: string): Promise<string | null>;
      set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
      del(...keys: string[]): Promise<number>;
    };
    jwt: {
      sign(payload: unknown, options?: unknown): string;
      verify<T = unknown>(token: string, options?: unknown): T;
    };
  }

  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
    jwtVerify<Decoded = unknown>(options?: unknown): Promise<Decoded>;
    user: {
      _id: string;
      ra: number;
      confirmed: boolean;
      email: string;
      permissions: string[];
    };
    requestContext: {
      get<T>(key: string): T | undefined;
      set<T>(key: string, value: T): void;
    };
    parts(options?: Record<string, unknown>): AsyncIterableIterator<unknown>;
  }

  interface FastifyReply {
    badRequest(message?: string): FastifyReply;
    notFound(message?: string): FastifyReply;
    unauthorized(message?: string): FastifyReply;
    forbidden(message?: string): FastifyReply;
    internalServerError(message?: string): FastifyReply;
    setCookie(name: string, value: string, options?: Record<string, unknown>): FastifyReply;
  }
}
