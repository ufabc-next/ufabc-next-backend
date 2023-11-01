import { UserModel } from '@next/models';
import type { FastifyRequest } from 'fastify';

export async function resendUserEmail(request: FastifyRequest) {
  const user = await UserModel.findOne({
    _id: request.user?._id,
    active: true,
  });

  if (!user) {
    throw new Error('User Not found');
  }

  await user.sendConfirmation();
}
