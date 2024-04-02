import {
  batchInsertItems,
  calculateCoefficients,
  generateIdentifier,
  modifyPayload,
} from '@next/common';
import { get } from 'lodash-es';
import {
  type Coefficient,
  EnrollmentModel,
  type GraduationDocument,
  GraduationHistoryModel,
  GraduationModel,
  type History,
  SubjectModel,
} from '@/models/index.js';

//TODO: replace _.get with a native function

export async function updateUserEnrollments(history: History) {
  if (!history.disciplinas) {
    return;
  }

  const isDisciplines = Array.isArray(history.disciplinas)
    ? history.disciplinas
    : [history.disciplinas];

  const disciplinesArr = isDisciplines.filter(Boolean);

  let graduation: GraduationDocument | null = null;
  if (history.curso && history.grade) {
    graduation = await GraduationModel.findOne({
      curso: history.curso,
      grade: history.grade,
    }).lean(true);
  }

  // @ts-expect-error I hate mongoose
  const coefficients: any = calculateCoefficients(disciplinesArr, graduation);
  history.coefficients = coefficients;

  await GraduationHistoryModel.findOneAndUpdate(
    {
      curso: checkAndFixCourseName(history.curso!),
      grade: history.grade,
      ra: history.ra,
    },
    {
      curso: checkAndFixCourseName(history.curso!),
      grade: history.grade,
      ra: history.ra,
      coefficients,
      disciplinas: disciplinesArr,
      graduation: graduation ? graduation._id : null,
    },
    { upsert: true },
  );

  const keys = ['ra', 'year', 'quad', 'disciplina'] as const;

  const updateOrCreateEnrollments = async (
    discipline: History['disciplinas'][number],
  ) => {
    const disc = {
      ra: history.ra,
      year: discipline.ano,
      quad: Number.parseInt(discipline.periodo!),
      disciplina: discipline.disciplina,
    };

    // calculate identifier for this discipline
    discipline.identifier =
      discipline.identifier || generateIdentifier(disc, keys as any);

    // find coef for this period
    const coef = getLastPeriod(
      history.coefficients!,
      discipline.ano!,
      Number.parseInt(discipline.periodo!),
    );

    const subjects = await SubjectModel.find({}).lean(true);

    // create enrollment payload
    const enrollmentPayload = {
      ra: disc.ra!,
      year: disc.year!,
      quad: disc.quad,
      disciplina: disc.disciplina!,
      conceito: discipline.conceito!,
      creditos: discipline.creditos!,
      cr_acumulado: coef?.cr_acumulado ?? get(coef, 'cr_acumulado'),
      ca_acumulado: coef?.ca_acumulado ?? get(coef, 'ca_acumulado'),
      cp_acumulado: coef?.cp_acumulado ?? get(coef, 'cp_acumulado'),
    };

    // @ts-expect-error I hate mongoose
    const modifiedPayload = modifyPayload(enrollmentPayload, subjects, {});

    await EnrollmentModel.findOneAndUpdate(
      {
        identifier: discipline.identifier,
      },
      modifiedPayload,
      {
        new: true,
        upsert: true,
      },
    );
  };

  return batchInsertItems(disciplinesArr, (discipline) =>
    updateOrCreateEnrollments(discipline),
  );
}

function checkAndFixCourseName(courseName: string) {
  return courseName === 'Bacharelado em CIências e Humanidades'
    ? 'Bacharelado em Ciências e Humanidades'
    : courseName;
}

function getLastPeriod(
  disciplines: Record<string, unknown>,
  year: number,
  quad: number,
  begin?: string,
): Coefficient | null {
  if (!begin) {
    const firstYear = Object.keys(disciplines)[0];
    const firstMonth = Object.keys(disciplines[firstYear]!)[0];
    begin = `${firstYear}.${firstMonth}`!;
  }

  if (quad === 1) {
    quad = 3;
    year -= 1;
  } else if (quad === 2 || quad === 3) {
    quad -= 1;
  }

  if (begin > `${year}.${quad}`) {
    return null;
  }

  const resp = get(disciplines, `${year}.${quad}`, null);
  if (resp === null) {
    return getLastPeriod(disciplines, year, quad, begin)!;
  }

  return resp as Coefficient;
}
