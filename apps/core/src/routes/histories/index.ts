import { GraduationModel } from '@/models/Graduation.js';
import {
  HistoryModel,
  type Situations,
  type Categories,
  type History,
} from '@/models/History.js';
import { StudentModel } from '@/models/Student.js';
import { getHistory } from '@/modules/ufabc-parser.js';
import { sigHistorySchema, type SigStatus } from '@/schemas/history.js';
import { currentQuad } from '@next/common';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  const historyCache = app.cache<History>();

  app.post(
    '/',
    { schema: sigHistorySchema },
    async ({ sessionId, headers }, reply) => {
      const viewState = headers['view-state'];

      if (!sessionId || !viewState) {
        return reply.badRequest('Missing sessionId');
      }

      const parsedHistory = await getHistory(sessionId, viewState as string);

      if (parsedHistory.error) {
        app.log.error(
          {
            error: parsedHistory.error,
            fields: parsedHistory.error.flatten().fieldErrors,
            issues: parsedHistory.error.issues,
          },
          'error parsing history',
        );
        return reply.status(400).send({
          msg: 'Erro ao analisar histórico',
          fields: parsedHistory.error.flatten().fieldErrors,
          issues: parsedHistory.error.issues,
        });
      }

      const { student, components, graduations, coefficients } =
        parsedHistory.data;

      if (!student.ra) {
        return reply.badRequest('Missing RA');
      }

      const cacheKey = `history:${student.ra}`;
      const cached = historyCache.get(cacheKey);
      if (cached) {
        return {
          msg: 'Cached history!',
        };
      }

      let history = await HistoryModel.findOne({
        ra: student.ra,
      });

      app.log.info({
        msg: 'starting student sync',
        student: student.ra,
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
            },
          );
        }
      }

      const componentsToInsert = components.map((c) => ({
        periodo: c.period,
        codigo: c.UFCode,
        disciplina: c.name,
        ano: c.year,
        creditos: c.credits,
        categoria: tranformCategory(c.category),
        situacao: transformStatus(c.status),
        conceito: c.grade,
        turma: c.class,
        teachers: c.teachers,
      }));

      if (!history && componentsToInsert.length > 0) {
        history = await HistoryModel.create({
          ra: student.ra,
          curso: student.course,
          disciplinas: componentsToInsert,
          grade: graduations.grade,
        });
      } else if (history) {
        history = await HistoryModel.findOneAndUpdate(
          { ra: student.ra, curso: student.course },
          {
            $set: {
              disciplinas: componentsToInsert,
              grade: graduations.grade,
            },
          },
          { new: true },
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

      if (!dbStudent) {
        await StudentModel.create(
          { ra: student.ra, season: currentQuad() },
          {
            $set: {
              cursos: [
                {
                  cp: coefficients.cp,
                  cr: coefficients.cr,
                  ca: coefficients.ca,
                  nome_curso: student.course,
                  ind_afinidade: coefficients.ik,
                },
              ],
            },
          },
        );
      }

      const hasGraduationChanged =
        student.course !== dbStudent?.cursos[0].nome_curso;

      if (hasGraduationChanged) {
        // update student with the new graduation, dont overwriting others
        await StudentModel.findOneAndUpdate(
          { ra: student.ra, season: currentQuad() },
          {
            $set: {
              cursos: [
                {
                  cp: coefficients.cp,
                  cr: coefficients.cr,
                  ca: coefficients.ca,
                  nome_curso: student.course,
                  ind_afinidade: coefficients.ik,
                },
              ],
            },
          },
          { upsert: true },
        );
      }

      await StudentModel.findOneAndUpdate(
        { ra: student.ra, season: currentQuad() },
        {
          $set: {
            cursos: [
              {
                cp: coefficients.cp,
                cr: coefficients.cr,
                ca: coefficients.ca,
                nome_curso: student.course,
                ind_afinidade: coefficients.ik,
              },
            ],
          },
        },
        { upsert: true },
      );

      const flattenJsonHistory = history?.toJSON({
        flattenObjectIds: true,
      });

      if (flattenJsonHistory) {
        historyCache.set(cacheKey, flattenJsonHistory);
      }

      // dispatch coefficients job.
      await app.job.dispatch('UserEnrollmentsUpdate', flattenJsonHistory);
      return {
        msg: flattenJsonHistory
          ? `Updated history for ${student.ra}`
          : `Created history for ${student.ra}`,
      };
    },
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

const tranformCategory = (
  category: 'free' | 'mandatory' | 'limited',
): Categories => {
  if (category === 'free') {
    return 'Livre Escolha';
  }

  if (category === 'limited') {
    return 'Opção Limitada';
  }

  return 'Obrigatória';
};

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
    REC: 'recuperacao',
    TRANC: null,
    '': null,
    TRANS: 'Aprovado',
  };

  return statusMap[status];
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
