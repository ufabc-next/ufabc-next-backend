import type { FastifyReply, FastifyRequest } from 'fastify';

export const jwtVerifyHook = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply
      .status(401)
      .send({ message: 'You must be authenticated to access this route' });
  }
};
