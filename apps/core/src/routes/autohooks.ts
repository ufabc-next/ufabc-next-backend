import type { FastifyInstance } from 'fastify';

const PUBLIC_ROUTES = [
  '/public',
  '/login',
  '/backoffice',
  '/histories',
  '/histories/me',
  '/entities/components',
  '/entities/subjects/reviews/',
  '/entities/teachers/reviews/',
  '/entities/students/stats/components',
  '/entities/students/courses',
  '/entities/students/student',
  '/entities/students',
  '/public/stats/components',
  '/users/check-email',
  '/users/facebook',
  '/users/recover',
];

const EXTENSION_ROUTES = ['/entities/students/sig'];

const isPublicRoute = (url: string): boolean => {
  return PUBLIC_ROUTES.some((route) => url.startsWith(route));
};

const isExtensionRoute = (url: string) => {
  return EXTENSION_ROUTES.some((route) => url.startsWith(route));
};

export default async function (app: FastifyInstance) {
  app.decorateRequest('sessionId');
  app.addHook('onRequest', async (request, reply) => {
    const isPublic = isPublicRoute(request.url);
    const isExtension = isExtensionRoute(request.url);

    if (isExtension) {
      try {
        await request.isStudent(reply);
        request.sessionId = request.headers['session-id'] as string | undefined;
      } catch (error) {
        return reply.unauthorized('Missing sessionId');
      }
    }

    if (isPublic) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch (error) {
      return reply.unauthorized(
        'You must be authenticated to access this route',
      );
    }
  });
}
