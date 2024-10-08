import {
  getFacebookUserDetails,
  getGoogleUserDetails,
} from './utils/oauthProviderHandler.js';
import type { Providers } from './utils/oauthTypes.js';
import type { fastifyOauth2 } from '@fastify/oauth2';
import type { NextOauthOptions } from './oauth2.js';

export function supportedProviders(
  opts: NextOauthOptions,
  oauth2: typeof fastifyOauth2,
): Providers {
  return {
    google: {
      credentials: {
        client: {
          id: opts.googleId,
          secret: opts.googleSecret,
        },
      },
      config: oauth2.GOOGLE_CONFIGURATION,
      scope: ['profile', 'email'],
      getUserDetails: getGoogleUserDetails,
    },
    facebook: {
      credentials: {
        client: {
          id: opts.facebookId ?? '',
          secret: opts.facebookSecret ?? '',
        },
      },
      config: oauth2.FACEBOOK_CONFIGURATION,
      scope: ['public_profile', 'email'],
      getUserDetails: getFacebookUserDetails,
    },
  };
}
