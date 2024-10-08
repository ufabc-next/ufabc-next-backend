import { currentQuad, lastQuad } from '@next/common';
import { ComponentModel } from '@/models/Component.js';
import { type Student, StudentModel } from '@/models/Student.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StudentService } from './students.service.js';

type Curso = {
  curso_id: number;
  curso: string;
  cp: number;
  cr: number;
  quads: number;
  nome_curso: string;
  ind_afinidade: number;
};

type CreateStudentsRequest = {
  Body: {
    aluno_id: number;
    ra: number;
    login: string;
    cursos: Array<Curso>;
  };
};

type CourseInfo = {
  _id: string;
  ids: Array<number>;
};

export class StudentHandler {
  constructor(private readonly studentService: StudentService) {}

  async createStudent(
    request: FastifyRequest<CreateStudentsRequest>,
    reply: FastifyReply,
  ) {
    const student = request.body;

    if (!student.aluno_id) {
      reply.badRequest('Mising aluno_id');
    }

    const season = currentQuad();
    const isPrevious = await this.studentService.pastQuadStudents(season);

    if (isPrevious) {
      return this.studentService.findOneStudent(season, student.aluno_id);
    }

    const isCourseValid =
      !hasInvalidCourse(student.cursos || []) || !student.ra;

    if (isCourseValid) {
      return this.studentService.findOneStudent(season, student.aluno_id);
    }

    const courses = await hydrateCoursesOnStudent(
      student.ra,
      student.cursos,
      this.studentService.studentGraduationHistory,
    );

    const updatedStudent = await this.studentService.findAndUpdateStudent(
      student.aluno_id,
      season,
      // @ts-expect-error fucking mongoose
      {
        aluno_id: student.aluno_id,
        ra: student.ra,
        cursos: courses,
      },
    );
    return updatedStudent;
  }

  async listSeasonStudent(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    const season = currentQuad();
    if (!user?.ra) {
      return reply.badRequest('Missing Student RA');
    }

    const student = await this.studentService.findOneStudent(
      season,
      undefined,
      user.ra,
    );
    return {
      studentId: student?.aluno_id,
      login: student?.login,
    };
  }

  async studentDisciplinasStats(
    request: FastifyRequest<{ Querystring: { season: string } }>,
  ) {
    const season = request.query.season || currentQuad();
    const isPrevious = await ComponentModel.countDocuments({
      before_kick: { $exists: true, $ne: [] },
    });
    const dataKey = isPrevious ? '$before_kick' : '$alunos_matriculados';
    const userStatusAggregate = await ComponentModel.aggregate([
      {
        $match: { season },
      },
      {
        $unwind: dataKey,
      },
      { $group: { _id: dataKey, count: { $sum: 1 } } },
      { $group: { _id: '$count', students_number: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          students_number: 1,
          disciplines_number: '$_id',
        },
      },
    ]);
    return userStatusAggregate;
  }

  async courseinfo() {
    const rawStudentcourse = await StudentModel.aggregate<CourseInfo>([
      {
        $unwind: '$cursos',
      },
      {
        $match: {
          'cursos.id_curso': {
            $ne: null,
          },
        },
      },
      {
        $project: {
          'cursos.id_curso': 1,
          'cursos.nome_curso': {
            $trim: {
              input: '$cursos.nome_curso',
            },
          },
        },
      },
      {
        $group: {
          _id: '$cursos.nome_curso',
          ids: {
            $addToSet: '$cursos.id_curso',
          },
        },
      },
    ]);
    const studentCourse = rawStudentcourse.map(({ _id, ids }) => ({
      name: _id,
      ufcourseids: ids,
    }));
    return studentCourse;
  }
}

function hasInvalidCourse(cursos: CreateStudentsRequest['Body']['cursos']) {
  return cursos.some(({ curso_id, curso }) => {
    return (
      (!curso_id || curso_id === null) &&
      curso !== 'Bacharelado em CIências e Humanidades' &&
      curso !== 'Bacharelado em Ciências e Humanidades'
    );
  });
}

function toNumber(str: string | number) {
  if (typeof str === 'number') {
    return str;
  }
  return Number.parseFloat((str || '').replace(',', '.'));
}

async function hydrateCoursesOnStudent(
  ra: number,
  cursos: CreateStudentsRequest['Body']['cursos'],
  graduationHistory: StudentService['studentGraduationHistory'],
) {
  const courses = [];
  for (const course of cursos) {
    let cleanedCourse = course.curso
      .trim()
      .replace('↵', '')
      .replaceAll(/\s+/g, ' ');

    if (cleanedCourse === 'Bacharelado em CIências e Humanidades') {
      cleanedCourse = 'Bacharelado em Ciências e Humanidades';
    }

    const studentHistoryGraduation = await graduationHistory(ra, course.curso);

    const cpBeforePandemic =
      studentHistoryGraduation?.coefficients?.[2019]?.[3].cp_acumulado;
    // Sum cp before pandemic + cp after freezed
    const cpFreezed =
      studentHistoryGraduation?.coefficients?.[2021]?.[2].cp_acumulado;

    const pastQuad = lastQuad();
    const cpPastQuad =
      studentHistoryGraduation?.coefficients?.[pastQuad.year]?.[pastQuad.quad]
        .cp_acumulado;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const twoQuadAgo = lastQuad(threeMonthsAgo);
    const cpTwoQuadsAgo =
      studentHistoryGraduation?.coefficients?.[twoQuadAgo.year]?.[
        twoQuadAgo.quad
      ].cp_acumulado;
    let cpTotal = null;

    if ((cpPastQuad || cpTwoQuadsAgo) && cpFreezed) {
      cpTotal = (cpPastQuad! || cpTwoQuadsAgo!) - cpFreezed;
    }

    let finalCp = null;
    // If student enter after 2019.3
    if (!cpBeforePandemic) {
      if (!cpTotal) {
        cpTotal = course.cp;
      }
      finalCp = Math.min(Number(cpTotal.toFixed(3)), 1);
    } else {
      finalCp = Math.min(Number((cpBeforePandemic + cpTotal!).toFixed(3)), 1);
    }

    course.cr = Number.isFinite(course.cr) ? toNumber(course.cr) : 0;
    course.cp = Number.isFinite(course.cp) ? toNumber(finalCp) : 0;
    course.quads = Number.isFinite(course.quads) ? toNumber(course.quads) : 0;

    course.nome_curso = cleanedCourse;
    // refer
    // https://www.ufabc.edu.br/administracao/conselhos/consepe/resolucoes/resolucao-consepe-no-147-define-os-coeficientes-de-desempenho-utilizados-nos-cursos-de-graduacao-da-ufabc
    course.ind_afinidade =
      0.07 * course.cr + 0.63 * course.cp + 0.005 * course.quads;

    if (
      !course.curso_id &&
      course.curso === 'Bacharelado em Ciências e Humanidades'
    ) {
      course.curso_id = 25;
    }

    courses.push(course);
  }

  return courses as unknown as Student['cursos'];
}
