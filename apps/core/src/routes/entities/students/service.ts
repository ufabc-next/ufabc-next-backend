import { ComponentModel } from '@/models/Component.js';
import { History, HistoryModel } from '@/models/History.js';
import { StudentModel, type Student } from '@/models/Student.js';
import { logger } from '@/utils/logger.js';
import { currentQuad } from '@next/common';
import type { FilterQuery } from 'mongoose';

export async function getComponentsStudentsStats(
  season: string,
  dataKey: '$before_kick' | '$alunos_matriculados',
) {
  const stats = await ComponentModel.aggregate<{
    studentsNumber: number;
    componentsNumber: number;
  }>([
    { $match: { season } },
    { $unwind: dataKey },
    { $group: { _id: dataKey, count: { $sum: 1 } } },
    { $group: { _id: '$count', studentsNumber: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        studentsNumber: 1,
        componentsNumber: '$_id',
      },
    },
  ]);

  return stats;
}

export async function getAllCourses() {
  const courses = await StudentModel.aggregate([
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
    {
      $project: {
        _id: 0,
        names: '$_id',
        UFCourseIds: '$ids',
      },
    },
  ]);

  return courses;
}

export async function getStudent(filter: FilterQuery<Student>) {
  const season = currentQuad();
  const student: Student | null = await StudentModel.findOne({
    ...filter,
    season,
  }).lean();

  return student;
}

export async function getGraduation(ra: number, name: string) {
  const history = await HistoryModel.findOne({ ra, curso: name }).sort({
    updatedAt: -1,
  });

  return history;
}

type CreateStudent = {
  ra: number;
  login: string;
  studentId?: number;
  graduations: {
    nome_curso: string;
    id_curso: number;
    turno: 'Noturno' | 'Matutino' | 'noturno' | 'matutino';
    cp: number | undefined;
    cr: number | undefined;
    ind_afinidade: number | undefined;
    quads: number | undefined;
  }[];
};

type UpdateStudent = {
  ra: number;
  login: string;
  studentId: number | null | undefined;
  graduationId: number | null;
};

export async function createOrInsert({
  studentId,
  ra,
  login,
  graduations,
}: CreateStudent) {
  const season = currentQuad();

  const student = await StudentModel.findOneAndUpdate(
    {
      ra,
      season,
    },
    { ra, login, cursos: graduations },
    { new: true, upsert: true },
  );

  return student;
}

type UpdatedStudent = {
  ra: number;
  studentId?: number | null;
  graduations: Array<{
    components: History['disciplinas'];
  }>;
};

export async function update({
  ra,
  login,
  studentId,
  graduationId,
}: UpdateStudent): Promise<UpdatedStudent | null> {
  const season = currentQuad();
  logger.info(ra, login);
  const student = await StudentModel.findOne({
    ra,
    login,
    season,
  });
  const historyComponents = await HistoryModel.findOne({
    ra,
  })
    .sort({
      updatedAt: -1,
    })
    .lean<History>();

  if (!student || !historyComponents) {
    return null;
  }

  if (student.aluno_id) {
    return {
      ra: student.ra,
      studentId: student.aluno_id,
      graduations: student.cursos.map((c) => ({
        ...c,
        components: historyComponents.disciplinas,
      })),
    };
  }

  student.aluno_id = studentId;
  student.cursos[0].id_curso = graduationId;
  student.cursos[1].id_curso = graduationId;

  await student.save();

  return {
    ra: student.ra,
    studentId: student.aluno_id,
    graduations: student.cursos.map((c) => ({
      ...c,
      components: historyComponents.disciplinas,
    })),
  };
}
