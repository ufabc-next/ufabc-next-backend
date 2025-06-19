import { ComponentModel } from '@/models/Component.js';
import { HistoryModel } from '@/models/History.js';
import { StudentModel, type Student } from '@/models/Student.js';
import { currentQuad } from '@next/common';
import { logger } from '@/utils/logger.js';
import type { FilterQuery } from 'mongoose';
import type { UpdatedStudent } from '@/schemas/entities/students.js';

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
  graduationId: number | null | undefined;
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

export async function update({
  ra,
  login,
  studentId,
  graduationId,
}: UpdateStudent): Promise<UpdatedStudent | null> {
  const season = currentQuad();
  logger.info({ ra, login, studentId, graduationId });
  const student = await StudentModel.findOne({
    ra,
    login,
    season,
  });
  const historyComponents = await HistoryModel.findOne(
    {
      ra,
    },
    { disciplinas: 1, _id: 0 },
  )
    .sort({
      updatedAt: -1,
    })
    .lean();

  if (!student || !historyComponents) {
    return null;
  }

  if (student.aluno_id) {
    const studentObj = student.toJSON<Student>();
    return {
      ra: studentObj.ra,
      studentId: studentObj.aluno_id,
      graduations: studentObj.cursos.map((c) => ({
        ...c,
        components: historyComponents.disciplinas,
      })),
    } as unknown as UpdatedStudent;
  }

  student.aluno_id = studentId;

  // THIS IS WRONG
  for (const curso of student.cursos) {
    curso.id_curso = graduationId;
  }

  await student.save();

  const studentObj = student.toJSON();

  return {
    ra: studentObj.ra,
    studentId: studentObj.aluno_id,
    graduations: studentObj.cursos.map((c) => ({
      ...c,
      components: historyComponents.disciplinas,
    })),
  } as unknown as UpdatedStudent;
}
