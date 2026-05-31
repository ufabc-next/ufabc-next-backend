import type { preHandlerAsyncHookHandler } from 'fastify';

import LRUWeakCache from 'lru-weak-cache';

import { MoodleConnector } from '@/connectors/moodle.js';

declare module '@fastify/request-context' {
  interface RequestContextData {
    moodleSession: {
      sessionId: string;
      sessKey: string;
    };
    moodleUser: {
      fullname: string;
    };
  }
}

export type Session = {
  sessionId: string;
  sessKey: string;
};

type SessionCacheEntry = {
  sessionId: string;
  fullname?: string;
};

const sessionCache = new LRUWeakCache<SessionCacheEntry>({
  capacity: 5000,
  maxAge: 1000 * 60 * 5,
});

export const moodleSession: preHandlerAsyncHookHandler = async (
  request,
  reply
) => {
  const { 'session-id': sessionId, 'sess-key': sessKey } = request.headers;

  if (
    !sessionId ||
    !sessKey ||
    typeof sessionId !== 'string' ||
    typeof sessKey !== 'string'
  ) {
    // should never happen, cause the schema validation runs before this hook
    return reply.unauthorized('Missing Session');
  }

  if (sessionCache.has(sessionId)) {
    const cached = sessionCache.get(sessionId)!;
    request.log.debug({ sessionId }, 'Session found in cache');
    request.requestContext.set('moodleSession', {
      sessionId,
      sessKey,
    });

    if (cached.fullname) {
      request.requestContext.set('moodleUser', {
        fullname: cached.fullname,
      });
    }

    return;
  }

  const [isTokenValid, userInfo] = await Promise.all([
    validateToken(sessionId, sessKey),
    resolveUserInfo(sessionId, sessKey),
  ]);

  request.log.debug({ isTokenValid }, 'Token validated');
  if (!isTokenValid) {
    return reply.forbidden('Invalid Session');
  }
  request.log.debug({ sessionId }, 'Session validated');

  const cacheEntry: SessionCacheEntry = { sessionId };

  request.requestContext.set('moodleSession', {
    sessionId,
    sessKey,
  });

  if (userInfo) {
    cacheEntry.fullname = userInfo.fullname;
    request.requestContext.set('moodleUser', {
      fullname: userInfo.fullname,
    });
  }

  sessionCache.set(sessionId, cacheEntry);
};

async function validateToken(sessionId: string, sessKey: string) {
  const connector = new MoodleConnector();
  const response = await connector.validateToken(sessionId, sessKey);
  const hasError = response.some((item) => item.error);
  const hasException = response.some((item) => item.exception);

  if (hasError || hasException) {
    return false;
  }

  return true;
}

async function resolveUserInfo(sessionId: string, sessKey: string) {
  try {
    const connector = new MoodleConnector();
    const response = await connector.getUserInfo(sessionId, sessKey);
    const data = response?.[0];

    if (data?.error || !data?.data?.fullname) {
      return null;
    }

    return {
      fullname: data.data.fullname,
    };
  } catch {
    return null;
  }
}
