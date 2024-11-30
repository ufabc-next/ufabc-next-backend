import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { findComment, findOne, listByRa } from './service.js';
import { listUserEnrollments } from '@/schemas/entities/enrollments.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.get('/', { schema: listUserEnrollments }, async ({ user }) => {
    const userEnrollments = await listByRa(user.ra);
    return userEnrollments;
  });

  app.get('/:enrollmentId', async (request, reply) => {
    const { enrollmentId } = request.params;
    const enrollment = await findOne(enrollmentId, request.user.ra);

    if (!enrollment) {
      return reply.badRequest('Enrollment not found');
    }

    const comments = await findComment(enrollmentId);

    if (!comments) {
      return reply.badRequest('No comments were found');
    }

    // biome-ignore lint/complexity/noForEach: <explanation>
    comments.forEach((c) => {
      // @ts-expect-error for now
      enrollment[c.type].comment = c;
    });

    const { ra, ...res } = enrollment;
    return res;
  });
};

export default plugin;