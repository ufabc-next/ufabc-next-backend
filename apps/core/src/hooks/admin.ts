import type { FastifyReply, FastifyRequest } from 'fastify';

export const adminHook = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user;

  if (!user) {
    return reply.unauthorized();
  }

  if (!user.permissions?.includes('admin')) {
    return reply.forbidden();
  }

  return;
};
