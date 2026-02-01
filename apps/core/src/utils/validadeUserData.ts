import type { FastifyReply, FastifyRequest } from 'fastify';

export function handleValidateUserDataError(
  err: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (err instanceof Error) {
    switch (err.message) {
      case 'RA_NOT_FOUND':
        return reply.badRequest('O RA digitado não existe.');
      case 'HAS_UFABC_CONTRACT':
        return reply.forbidden('O aluno não pode ter contrato com a UFABC.');
      case 'INVALID_EMAIL':
        return reply.forbidden('O email fornecido não é válido.');
      default:
        request.log.error({ err }, 'unexpected validation error');
        return reply.internalServerError('Erro de validação inesperado');
    }
  }

  request.log.error({ err }, 'non-error thrown in validation');
  return reply.internalServerError('Erro de validação inesperado');
}
