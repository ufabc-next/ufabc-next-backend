import type { FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify';
import { fastifyOauth2, type OAuth2Namespace } from '@fastify/oauth2';
import { fastifyPlugin as fp } from 'fastify-plugin';

import type { Auth } from '@/schemas/auth.ts';

import { REQUESTERS } from '@/constants.ts';

declare module 'fastify' {
  interface FastifyInstance {
    google: OAuth2Namespace;
  }
  interface Session {
    user: Auth;
  }
}

export type statePayloadType = {
  userId: string;
  requesterKey: 'ufabc-next' | 'ufabc-cronos';
};

export default fp(
  async (app: FastifyInstance) => {
    await app.register(fastifyOauth2 as unknown as FastifyPluginCallback<Record<string, unknown>>, {
      name: 'google',
      userAgent: 'UFABC next (2.0.0)',
      credentials: {
        client: {
          id: app.config.OAUTH_GOOGLE_CLIENT_ID,
          secret: app.config.OAUTH_GOOGLE_SECRET,
        },
        auth: fastifyOauth2.GOOGLE_CONFIGURATION,
      },
      scope: ['profile', 'email'],
      callbackUri: (req: FastifyRequest) =>
        `${app.config.PROTOCOL}://${req.host}/login/google/callback`,
      generateStateFunction: (request: FastifyRequest) => {
        // @ts-ignore
        const payload = {
          userId: (request.query as any).userId ?? null,
          requesterKey: (request.query as any).requesterKey ?? null,
        };

        return Buffer.from(JSON.stringify(payload)).toString('base64url');
      },
      checkStateFunction: (request: FastifyRequest) => {
        const { requesterKey } = JSON.parse(
          Buffer.from((request.query as any).state, 'base64url').toString(
            'utf8'
          )
        ) as statePayloadType;

        if (!REQUESTERS.includes(requesterKey))
          throw new Error('Invalid requester key');

        return true;
      },
    });

    app.log.info('[PLUGIN] Oauth');
  },
  { name: 'oauth2' }
);
