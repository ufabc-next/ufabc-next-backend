import type {
  FastifyPluginAsyncZodOpenApi,
} from 'fastify-zod-openapi';

import { currentQuad } from '@next/common';

import { GraduationModel } from '@/models/Graduation.js';
import {
  HistoryModel,
  type Categories,
  type History,
  type HistoryDocument,
  type Situations,
} from '@/models/History.js';
import { StudentModel } from '@/models/Student.js';
import { UserModel } from '@/models/User.js';
import { UserRaHistoryModel } from '@/models/UserRaHistory.js';
import {
  sigHistoryBodySchema,
  sigHistoryResponseSchema,
  type SigStatus,
} from '@/schemas/history.js';
import { handleValidateUserDataError } from '@/utils/handle-validate-user-data-error.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  const historyCache = app.cache<History>();
  const studentEmailDomain = '@aluno.ufabc.edu.br';
  app.post(
    '/',
    { schema: sigHistoryBodySchema },
    async (request, reply) => {
      const { sessionId, headers, body } = request;
      const viewState = headers['view-state'] ?? headers['View-State'];
      const { login, ra } = body;
      const currentRaNumber = ra;
      const studentEmail = `${login}${studentEmailDomain}`;

      if (!sessionId || !viewState) {
        return reply.badRequest('Missing sessionId');
      }

      if (currentRaNumber <= 0) {
        return reply.badRequest('RA inválido');
      }

      const user = await UserModel.findOne({ email: studentEmail });

      if (!user) {
        return reply.badRequest(`E-mail inválido: ${studentEmail}`);
      }

      if (user.ra !== currentRaNumber) {
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
        } catch (err: unknown) {
          return handleValidateUserDataError(err, request, reply);
        }
      }

      const cacheKey = `history:${ra}`;
      const cached = historyCache.get(cacheKey);
      if (cached) {
        return {
          msg: 'Cached history!',
        };
      }

      const historyUrl = new URL('/v1/sig/history', app.config.UFABC_PARSER_URL);
      historyUrl.searchParams.set('action', 'history');

      const parserResponse = await fetch(historyUrl, {
        method: 'POST',
        headers: {
          'session-id': sessionId,
          'view-state': viewState as string,
        },
      });

      const parserPayload = (await parserResponse.json()) as {
        data: unknown;
        error: string | null;
      };

      if (parserPayload.error) {
        app.log.error(
          {
            ra,
            error: parserPayload.error,
          },
          'error parsing history from parser'
        );
        return reply.internalServerError('Failed to fetch history from UFABC');
      }

      const parsedHistory = sigHistoryResponseSchema.safeParse(parserPayload.data);

      if (!parsedHistory.success) {
        app.log.error(
          {
            ra,
            error: parsedHistory.error.issues.map(
              (issue: { message: string; path: Array<string | number>; code: string }) => ({
                reason: issue.message,
                path: issue.path,
                code: issue.code,
              })
            ),
          },
          'error parsing history payload'
        );
        return reply.internalServerError('Failed to fetch history from UFABC');
      }

      const { student, components, graduations, coefficients } = parsedHistory.data;

      if (!parsedHistory.data?.graduations.grade) {
        app.log.warn(
          {
            ra: student.ra,
            course: graduations.course,
          },
          'graduation.grade is invalid'
        );
      }

      let history: HistoryDocument | null = await HistoryModel.findOne({
        ra: student.ra,
      });

      app.log.info({
        msg: 'starting student sync',
        student: ra,
      });

      if (student.course && graduations.grade) {
        const doc = await GraduationModel.findOne({
          curso: student.course,
          grade: graduations.grade,
        }).lean();

        if (!doc?.locked) {
          await GraduationModel.findOneAndUpdate(
            {
              curso: student.course,
              grade: graduations.grade,
            },
            {
              mandatory_credits_number: graduations.mandatoryCredits,
              free_credits_number: graduations.freeCredits,
              credits_total: graduations.totalCredits,
              limited_credits_number: graduations.limitedCredits,
            },
            {
              upsert: true,
              new: true,
            }
          );
        }
      }

      const componentsToInsert = components.map((c) => ({
        periodo: c.period,
        codigo: c.UFCode,
        disciplina: c.name,
        ano: c.year,
        creditos: c.credits,
        categoria: transformCategory(c.category),
        situacao: transformStatus(c.status),
        conceito: c.grade,
        turma: c.class,
        teachers: c.teachers,
      }));

      if (!history && componentsToInsert.length > 0) {
        history = await HistoryModel.create({
          ra: student.ra,
          curso: student.course,
          // @ts-ignore - deprecated endpoint
          disciplinas: componentsToInsert,
          grade: graduations.grade,
        });
      } else if (history) {
        history = await HistoryModel.findOneAndUpdate(
          {
            $or: [
              // Busca exata pelo curso normalizado
              { curso: student.course },
              // Busca parcial pelo curso (case insensitive)
              { curso: { $regex: student.course, $options: 'i' } },
              // Busca por palavras individuais do curso
              {
                curso: {
                  $regex: student.course
                    .split(/\s+/)
                    .map((word: string) => `(?=.*${word})`)
                    .join(''),
                  $options: 'i',
                },
              },
            ],
            ra: student.ra,
          },
          {
            $set: {
              disciplinas: componentsToInsert,
              grade: graduations.grade,
            },
          },
          { new: true }
        );
      }

      app.log.debug({
        student: student.ra,
        dbGrade: history?.grade,
        rawGrade: graduations.grade,
        msg: 'Synced Successfully',
      });

      const dbStudent = await StudentModel.findOne({
        ra: student.ra,
        season: currentQuad(),
      });

      const graduationsToInsert = {
        cp: coefficients.cp,
        cr: coefficients.cr,
        ca: coefficients.ca,
        nome_curso: student.course,
        ind_afinidade: coefficients.ik,
        turno: student.shift,
      };

      if (!dbStudent) {
        await StudentModel.create({
          ra: student.ra,
          login,
          season: currentQuad(),
          cursos: [graduationsToInsert],
        });
      }

      const hasGraduationChanged =
        student.course !== dbStudent?.cursos[0].nome_curso;

      if (hasGraduationChanged) {
        // update student with the new graduation, dont overwriting others
        await StudentModel.findOneAndUpdate(
          { ra: student.ra, season: currentQuad() },
          {
            $set: {
              cursos: [graduationsToInsert],
            },
          },
          { new: true }
        );
      }

      if (history) {
        historyCache.set(cacheKey, history);
        await app.job.dispatch('UserEnrollmentsUpdate', history);
      }

      return {
        msg: 'Sync sucessfully',
      };
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

const transformCategory = (
  category: 'free' | 'mandatory' | 'limited'
): Categories => {
  if (category === 'free') {
    return 'Livre Escolha';
  }

  if (category === 'limited') {
    return 'Opção Limitada';
  }

  return 'Obrigatória';
};

function findMode<T extends string | number>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot find mode of an empty array');
  }

  const frequencyMap = new Map<T, number>();

  for (const value of arr) {
    const currentFrequency = frequencyMap.get(value) ?? 0;
    frequencyMap.set(value, currentFrequency + 1);
  }

  let maxFrequency = 0;
  let mode = arr[0];

  for (const [value, frequency] of frequencyMap.entries()) {
    if (frequency > maxFrequency) {
      mode = value;
      maxFrequency = frequency;
    }
  }

  return mode;
}

const transformStatus = (status: SigStatus): Situations => {
  const statusMap: Record<SigStatus, Situations> = {
    APR: 'Aprovado',
    APRN: 'Aprovado',
    REPN: 'Reprovado',
    REP: 'Reprovado',
    REPF: 'Reprovado',
    REPMF: 'Reprovado',
    REPNF: 'Reprovado',
    CANC: 'Trt. Total',
    MATR: null,
    CUMP: 'Aprovado',
    DISP: 'Aprovado',
    INCORP: null,
    REC: 'Aprovado',
    TRANC: null,
    '': null,
    TRANS: 'Aprovado',
  };

  return statusMap[status];
};
