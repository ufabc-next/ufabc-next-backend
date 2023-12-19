import { DisciplinaModel } from '@next/models';
import { syncMatriculas } from '@next/queue';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function sync(
  request: FastifyRequest<{ Querystring: string }>,
  reply: FastifyReply,
) {
  const { redis } = request.server;
  const operation = request.query;

  // for some reason, there is a type mismatch between the DisciplinaModel from the queue and the one from the models
  // TODO: fix this type mismatch
  const result = await syncMatriculas(operation, redis, DisciplinaModel);

  reply.send(result);
}
