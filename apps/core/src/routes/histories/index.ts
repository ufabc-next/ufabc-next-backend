import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

import { currentQuad } from '@next/common';

import { UserModel, UserRaHistoryModel } from '@/models/User.js';
import { StudentModel } from '@/models/Student.js';

import { handleValidateUserDataError } from '@/utils/handle-validate-user-data-error.js';

import {
  sigHistoryBodySchema
} from '@/schemas/user.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  const studentEmailDomain = '@aluno.ufabc.edu.br';

  app.post(
    '/',
    { schema: sigHistoryBodySchema },
    async (request, reply) => {
      const { body } = request;
      const { login, ra } = body;

      const currentRaNumber = ra;
      const studentEmail = `${login}${studentEmailDomain}`;

      if (!isValidRaNumber(currentRaNumber)) {
        return reply.badRequest('RA inválido');
      }

      const user = await UserModel.findOne({ email: studentEmail });

      if (!user) {
        return reply.badRequest(`E-mail inválido: ${studentEmail}`);
      }

      if (user.ra === currentRaNumber) {
        return {
          msg: 'RA já está atualizado',
        };
      }

      try {
        const raInUse = await UserModel.exists({
          ra: currentRaNumber,
          _id: { $ne: user._id },
        });

        if (raInUse) {
          return reply.badRequest('Este RA já está em uso.');
        }

        const previousRa = user.ra;

        if (previousRa !== null && previousRa !== undefined) {
          await UserRaHistoryModel.create({
            userId: user._id,
            oldRa: Number(previousRa),
            newRa: currentRaNumber,
          });
        }

        user.ra = currentRaNumber;
        await user.save();

        return {
          msg: 'RA atualizado com sucesso',
        };
      } catch (err: unknown) {
        return handleValidateUserDataError(err, request, reply);
      }
    }
  );

  app.get('/courses', async (request, reply) => {
    const season = currentQuad();
    const coursesAggregate = await StudentModel.aggregate<{
      _id: string;
      ids: string[];
    }>([
      { $match: { season } },
      { $unwind: '$cursos' },
      { $match: { 'cursos.id_curso': { $ne: null } } },
      {
        $project: {
          'cursos.id_curso': 1,
          'cursos.nome_curso': { $trim: { input: '$cursos.nome_curso' } },
        },
      },
      {
        $group: {
          _id: '$cursos.nome_curso',
          ids: { $push: '$cursos.id_curso' },
        },
      },
    ]);

    const courses = coursesAggregate.map((course) => {
      const validIds = course.ids.filter((id) => id != null && id !== '');

      // Find the most frequent ID
      const courseModeId = validIds.length > 0 ? findMode(validIds) : undefined;

      return {
        name: course._id,
        curso_id: courseModeId,
      };
    });

    return courses;
  });
};

export default plugin;

const MIN_RA_DIGITS = 4;
const MAX_RA_DIGITS = 12;

const isValidRaNumber = (ra: number): boolean => {
  if (!Number.isInteger(ra) || ra <= 0) {
    return false;
  }

  const raDigits = ra.toString().length;

  return raDigits >= MIN_RA_DIGITS && raDigits <= MAX_RA_DIGITS;
};

function findMode(arr: any[]) {
  const frequencyMap = arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});

  let maxFrequency = 0;
  let modes: number[] = [];

  for (const [value, frequency] of Object.entries(frequencyMap)) {
    if (Number(frequency) > maxFrequency) {
      modes = [Number(value)];
      maxFrequency = frequency as number;
    } else if (frequency === maxFrequency) {
      modes.push(Number(value));
    }
  }

  return modes[0]; // Return first mode if multiple exist
}
