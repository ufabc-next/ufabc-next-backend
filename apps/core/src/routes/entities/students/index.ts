import { ComponentModel } from '@/models/Component.js';
import {
  type CreateStudent,
  createStudentSchema,
  listMatriculaStudent,
  listStudentSchema,
  listStudentsStatsComponents,
  type MatriculaStudent,
  sigStudentSchema,
  updateStudentSchema,
} from '@/schemas/entities/students.js';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import {
  getAllCourses,
  getComponentsStudentsStats,
  getStudent,
  getGraduation,
  createOrInsert,
  update,
} from './service.js';
import { currentQuad, lastQuad } from '@next/common';
import { type Student, StudentModel } from '@/models/Student.js';
import type { HistoryDocument } from '@/models/History.js';
import { getFullStudent, getSigUser } from '@/modules/ufabc-parser.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.get(
    '/stats/components',
    { schema: listStudentsStatsComponents },
    async (request, reply) => {
      const { season } = request.query;

      const isPrevious = await ComponentModel.countDocuments({
        season,
        before_kick: { $exists: true, $ne: [] },
      });

      const dataKey = isPrevious ? '$before_kick' : '$alunos_matriculados';
      const statusAggregate = await getComponentsStudentsStats(season, dataKey);

      return statusAggregate;
    },
  );

  app.get('/courses', async () => {
    const allStudentsCourses = await getAllCourses();
    return allStudentsCourses;
  });

  app.get('/', { schema: listStudentSchema }, async ({ user }, reply) => {
    const student = await getStudent({ ra: user.ra });

    if (!student) {
      return reply.badRequest('Student not found');
    }

    return {
      studentId: student.aluno_id,
      login: student.login,
    };
  });

  app.get(
    '/student',
    { schema: listMatriculaStudent },
    async (request, reply) => {
      const login = request.headers['uf-login'];

      if (!login) {
        return reply.badRequest('Login not provided');
      }

      const student = await getStudent({ login });

      if (!student) {
        return reply.badRequest('Student not found');
      }

      const matriculaStudent = {
        studentId: student.aluno_id,
        graduations: student.cursos.map((c) => ({
          courseId: c.id_curso,
          name: c.nome_curso,
          shift: c.turno,
          affinity: c.ind_afinidade,
          cp: c.cp ?? 0,
          cr: c.cr ?? 0,
          ca: c.ca ?? 0,
        })),
        updatedAt: student.updatedAt.toISOString(),
      } satisfies MatriculaStudent;

      return matriculaStudent;
    },
  );

  app.post('/', { schema: createStudentSchema }, async (request, reply) => {
    const { studentId, graduations, ra, login } = request.body;

    const season = currentQuad();
    const isPrevious = await ComponentModel.countDocuments({
      before_kick: { $exists: true, $ne: [] },
      season,
    });
    const student = await StudentModel.findOne({
      season,
      ra,
    }).lean<Student>();

    if (isPrevious && student) {
      // past student, do not update anymore
      const student = await StudentModel.findOne({
        season,
        ra,
      }).lean<Student>();
      request.log.warn(student, 'Already created');
      return student;
    }

    const isMissingCourseId = graduations.some((g) => g.courseId == null);

    if (isMissingCourseId || !ra) {
      // called by snapshot page
      const student = await StudentModel.findOne({
        $or: [
          {
            aluno_id: studentId,
          },
          { login },
        ],
        season,
      }).lean<Student>();
      request.log.warn(student, 'Snapshot call');
      return student;
    }

    const graduationPromises = graduations.map(async (graduation) => {
      const history = await getGraduation(ra, graduation.name);
      return calculateGraduationMetrics(
        graduation,
        history as NonNullable<HistoryDocument>,
      );
    });
    const studentGraduations = await Promise.all(graduationPromises);

    const createdStudent = await createOrInsert({
      ra,
      login,
      graduations: studentGraduations,
    });

    return {
      _id: createdStudent._id,
      login: createdStudent.login,
      graduations: createdStudent.cursos.map((c) => ({
        name: c.nome_curso,
        UFCourseId: c.id_curso,
        turno: c.turno,
      })),
    };
  });

  app.put('/', { schema: updateStudentSchema }, async (request, reply) => {
    const { login, ra, studentId } = request.body;

    const updatedStudent = await update({
      login,
      ra,
      studentId,
    });

    if (!updatedStudent) {
      return reply.notFound('Could not find student');
    }

    return {
      msg: 'ok',
    };
  });

  app.post(
    '/sig',
    { schema: sigStudentSchema },
    async ({ sessionId, body: student }, reply) => {
      const sigStudent = await getSigUser(student, sessionId!);
      if (sigStudent.error || !sigStudent.data) {
        return reply.badRequest('Could not extract user');
      }
      return sigStudent.data;
    },
  );

  app.post('/sig/grades', async (request, reply) => {
    const { student, action } = request.body;
    const viewState = request.headers['view-state'];
    const sessionId = request.sessionId;

    if (!viewState || !sessionId) {
      return reply.unauthorized('IXI');
    }

    const history = await getGraduation(
      student.ra,
      student.graduations[0].course,
    );
    const fullStudent = await getFullStudent({
      student: {
        ...student,
        grade: history?.grade,
      },
      action,
      viewState: viewState as string,
      sessionId,
    });

    if (fullStudent.error || !fullStudent.data) {
      app.log.warn(fullStudent, 'Error fetching full student');
      return reply.badRequest(fullStudent.error);
    }

    return reply.send(fullStudent.data);
  });
};

function calculateGraduationMetrics(
  graduation: CreateStudent['graduations'][number],
  history: HistoryDocument,
) {
  const cpBeforePandemic = history?.coefficients?.[2019]?.[3]?.cp_acumulado;
  const cpFreezed = history?.coefficients?.[2021]?.[2]?.cp_acumulado;

  const { quad, year } = lastQuad();
  const cpLastQuad = history?.coefficients?.[year]?.[quad]?.cp_acumulado;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const twoQuadAgoSeason = lastQuad(threeMonthsAgo);
  const cpTwoQuadAgo =
    history?.coefficients?.[twoQuadAgoSeason.year]?.[twoQuadAgoSeason.quad]
      ?.cp_acumulado;

  let cpTotal = null;
  if ((cpLastQuad || cpTwoQuadAgo) && cpFreezed) {
    cpTotal = (cpLastQuad || cpTwoQuadAgo) - cpFreezed;
  }

  let finalCP = null;
  if (!cpBeforePandemic) {
    if (!cpTotal) {
      cpTotal = graduation.cp;
    }
    finalCP = Math.min(Number((cpTotal || 0).toFixed(3)), 1);
  } else {
    finalCP = Math.min(
      Number((cpBeforePandemic + (cpTotal || 0)).toFixed(3)),
      1,
    );
  }

  const cr = sanitizeValue(graduation.cr);
  const cp = sanitizeValue(finalCP);
  const quads = sanitizeValue(graduation.quads ?? 0);
  // Calculate affinity index
  const ind_afinidade = 0.07 * cr + 0.63 * cp + 0.005 * quads;

  return {
    nome_curso: graduation.name,
    id_curso: graduation.courseId,
    turno: graduation.turno,
    cr,
    cp,
    quads,
    ind_afinidade,
  };
}

const sanitizeValue = (value: number | undefined) =>
  value && Number.isFinite(value) ? value : 0;

export default plugin;
