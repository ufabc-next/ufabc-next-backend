import { CommentModel } from '@/models/Comment.js';
import { ComponentModel } from '@/models/Component.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import type { SubjectDocument } from '@/models/Subject.js';
import type { TeacherDocument } from '@/models/Teacher.js';
import type { EnrollmentsList } from '@/schemas/entities/enrollments.js';
import type { currentQuad } from '@next/common';

type PopulatedFields = {
  pratica: TeacherDocument;
  teoria: TeacherDocument;
  subject: SubjectDocument;
};

export async function listByRa(ra: number) {
  const populatedEnrollments = await EnrollmentModel.find({
    ra,
    conceito: { $in: ['A', 'B', 'C', 'D', 'O', 'F'] },
  })
    .populate<PopulatedFields>(['pratica', 'teoria', 'subject'])
    .lean();

  return populatedEnrollments as unknown as EnrollmentsList[];
}

export async function findOne(id: string, ra: number) {
  const enrollment = await EnrollmentModel.findOne({
    _id: id,
    ra,
  })
    .populate<PopulatedFields>(['pratica', 'teoria', 'subject'])
    .lean();

  return enrollment;
}

export async function findComment(enrollmentId: string) {
  const comment = await CommentModel.find({ enrollment: enrollmentId }).lean();
  return comment;
}

export async function listWithComponents(
  ra: number,
  season: ReturnType<typeof currentQuad>,
) {
  // Fetch enrollments for the given ra and season
  const enrollments = await EnrollmentModel.find({
    ra,
    season,
  })
    .populate<{
      pratica: TeacherDocument;
      teoria: TeacherDocument;
    }>(['pratica', 'teoria'])
    .lean();

  // Gather all unique uf_cod_turma and disciplina_id from enrollments
  const ufCodTurmas = enrollments
    .map((enrollment) => enrollment.uf_cod_turma)
    .filter((val) => val != null);
  const disciplinaIds = enrollments
    .map((enrollment) => enrollment.disciplina_id)
    .filter((val) => val != null);

  // Fetch components that match the season and either uf_cod_turma or disciplina_id
  const matchingComponents = await ComponentModel.find({
    season,
    $or: [
      { uf_cod_turma: { $in: ufCodTurmas } },
      { disciplina_id: { $in: disciplinaIds } },
    ],
  }).lean();

  // Create maps for O(1) lookup instead of O(n) find on each iteration
  const componentsByUfCodTurma = new Map();
  const componentsByDisciplinaId = new Map();
  
  for (const component of matchingComponents) {
    if (component.uf_cod_turma) {
      componentsByUfCodTurma.set(component.uf_cod_turma, component);
    }
    if (component.disciplina_id) {
      componentsByDisciplinaId.set(component.disciplina_id, component);
    }
  }

  // Build the payload by matching each enrollment to its component(s)
  const payload = enrollments.map((enrollment) => {
    // Try to find component by uf_cod_turma first, then by disciplina_id
    const component = 
      (enrollment.uf_cod_turma && componentsByUfCodTurma.get(enrollment.uf_cod_turma)) ||
      (enrollment.disciplina_id && componentsByDisciplinaId.get(enrollment.disciplina_id));

    return {
      season,
      groupURL: component?.groupURL,
      codigo: component?.codigo,
      campus: enrollment.campus ?? component?.campus,
      turma: enrollment.turma ?? component?.turma,
      turno: enrollment.turno ?? component?.turno,
      subject: enrollment.disciplina ?? component?.disciplina,
      teoria: enrollment.teoria?.name ?? 'N/A',
      pratica: enrollment.pratica?.name ?? 'N/A',
    };
  });

  return payload;
}
