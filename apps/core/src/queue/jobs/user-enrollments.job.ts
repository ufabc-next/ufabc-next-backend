import { calculateCoefficients, generateIdentifier } from '@next/common';
import {
  GraduationModel,
  type GraduationDocument,
} from '@/models/Graduation.js';
import { GraduationHistoryModel } from '@/models/GraduationHistory.js';
import { SubjectModel, type SubjectDocument } from '@/models/Subject.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import {
  type History,
  type HistoryCoefficients,
  HistoryModel,
} from '@/models/History.js';
import type { QueueContext } from '../types.js';

type HistoryComponent = History['disciplinas'][number];

export async function userEnrollmentsUpdate(
  ctx: QueueContext<History | undefined>,
) {
  const history = ctx.job.data;
  if (!history || !history.disciplinas) {
    return;
  }

  const { disciplinas: components, ra, curso, grade } = history;

  let graduation: GraduationDocument | null = null;
  if (curso && grade) {
    graduation = await GraduationModel.findOne({
      curso,
      grade,
    });
  }

  // @ts-ignore for now
  const coefficients = calculateCoefficients<HistoryComponent>(
    components,
    graduation,
  ) as HistoryCoefficients;

  try {
    await HistoryModel.findOneAndUpdate(
      { ra, grade, curso },
      {
        $set: {
          coefficients,
        },
      },
    );
    await GraduationHistoryModel.findOneAndUpdate(
      {
        curso,
        grade,
        ra,
      },
      {
        $set: {
          curso,
          grade,
          ra,
          coefficients,
          disciplinas: components,
          graduation: graduation?._id ?? null,
        },
      },
      { upsert: true },
    );

    const enrollmentJobs = components.map(async (component) => {
      try {
        await ctx.app.job.dispatch('ProcessComponentsEnrollments', {
          history: {
            ra,
            coefficients,
          },
          component,
        });
      } catch (error) {
        ctx.app.log.error({
          error: error instanceof Error ? error.message : String(error),
          component: component.disciplina,
          ra: history.ra,
          msg: 'Failed to dispatch component processing job',
        });
        throw error;
      }
    });

    await Promise.all(enrollmentJobs);
  } catch (error) {
    ctx.app.log.error({
      error: error instanceof Error ? error.message : String(error),
      ra: history.ra,
      msg: 'Failed to process student history',
    });
    throw error; // Let BullMQ handle the retry
  }
}

export async function processComponentEnrollment(
  ctx: QueueContext<{
    history: {
      ra: number;
      coefficients: HistoryCoefficients;
    };
    component: HistoryComponent;
  }>,
) {
  const { history, component } = ctx.job.data;

  const keys = ['ra', 'year', 'quad', 'disciplina'] as const;

  const key = {
    ra: history.ra,
    year: component.ano,
    quad: Number(component.periodo),
    disciplina: component.disciplina,
  };

  component.identifier = component.identifier || generateIdentifier(key, keys);

  const coef = getLastPeriod(
    history.coefficients,
    component.ano,
    Number.parseInt(component.periodo),
  );

  const subjects = await SubjectModel.find({}, { name: 1 }).lean<
    SubjectDocument[]
  >();

  const rawEnrollment = {
    ra: key.ra,
    year: key.year,
    quad: key.quad,
    turma: component.turma,
    disciplina: component.disciplina,
    conceito: component.conceito,
    creditos: component.creditos,
    cr_acumulado: coef?.cr_acumulado ?? null,
    ca_acumulado: coef?.ca_acumulado ?? null,
    cp_acumulado: coef?.cp_acumulado ?? null,
    season: `${key.year}:${key.quad}`,
  };

  const enrollmentWithSubject = mapSubjects(rawEnrollment, subjects);

  try {
    const promises = enrollmentWithSubject.map(async (enrollment) => {
      await EnrollmentModel.findOneAndUpdate(
        {
          ra: key.ra,
          disciplina: component.disciplina,
          season: rawEnrollment.season,
        },
        { $set: enrollment },
        { upsert: true },
      );
    });

    await Promise.all(promises);

    ctx.app.log.debug({
      msg: 'Enrollment processed successfully',
      ra: rawEnrollment?.ra,
      disciplina: rawEnrollment?.disciplina,
    });
  } catch (error) {
    ctx.app.log.error({
      error: error instanceof Error ? error.message : String(error),
      component: component.disciplina,
      ra: history.ra,
      msg: 'Failed to update enrollment',
    });
    throw error;
  }
}

function getLastPeriod(
  coefficients: History['coefficients'],
  year: number,
  quad: number,
  begin?: string,
) {
  const firstYear = Object.keys(coefficients)[0];
  const firstMonth = Object.keys(coefficients[Number(firstYear)])[0];

  begin = `${firstYear}.${firstMonth}`;

  if (quad === 1) {
    quad = 3;
    year -= 1;
  } else if (quad === 2 || quad === 3) {
    quad -= 1;
  }

  if (begin > `${year}.${quad}`) {
    return null;
  }

  // @ts-ignore for now
  const resp = coefficients?.[year]?.[quad] ?? null;
  if (resp == null) {
    return getLastPeriod(coefficients, year, quad, begin);
  }

  return resp;
}

type PartialEnrollment = {
  ra: number;
  year: number;
  quad: number;
  disciplina: string;
  conceito: '-' | 'A' | 'B' | 'C' | 'D' | 'O' | 'F';
  creditos: number;
  cr_acumulado: number | null;
  ca_acumulado: number | null;
  cp_acumulado: number | null;
  season: string;
};

function mapSubjects(
  enrollment: PartialEnrollment,
  subjects: SubjectDocument[],
) {
  const enrollments = (
    Array.isArray(enrollment) ? enrollment : [enrollment]
  ) as PartialEnrollment[];

  const subjectMap = new Map(
    subjects.map((subject) => [subject.name.toLowerCase().trim(), subject]),
  );

  return enrollments.map((enrollment) => ({
    ...enrollment,
    subject: subjectMap.get(enrollment.disciplina),
  }));
}
