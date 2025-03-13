import { currentQuad, generateIdentifier } from '@next/common';
import {
  EnrollmentModel,
  type Enrollment as EnrollmentEntity,
} from '@/models/Enrollment.js';
import type { QueueContext } from '../types.js';
import type { Types } from 'mongoose';
import {
  getEnrollments,
  type StudentComponent,
} from '@/modules/ufabc-parser.js';
import { ComponentModel, type Component } from '@/models/Component.js';

type Enrollment = Omit<
  EnrollmentEntity,
  'createdAt' | 'updatedAt' | 'comments'
> & {
  disciplina_identifier?: string;
};

type HydratedEnrollment = {
  ra: number;
  nome: string;
  campus: 'sbc' | 'sa' | 'sao bernardo' | 'santo andre';
  turno: 'diurno' | 'noturno';
  turma: string;
  disciplina: string;
  year: number;
  quad: 1 | 2 | 3;
  identifier: string;
  disciplina_identifier: string;
  teoria: Types.ObjectId | null | undefined;
  pratica: Types.ObjectId | null | undefined;
  subject: Types.ObjectId;
  season: string;
};

export async function syncEnrollmentsAjuste({
  app,
  job,
}: QueueContext<unknown>) {
  const season = currentQuad();
  const [tenantYear, tenantQuad] = season.split(':').map(Number) as [
    number,
    1 | 2 | 3,
  ];

  try {
    const components = await ComponentModel.find({
      season,
    }).lean();
    const rawEnrollments = await getEnrollments('settlement');
    const allowedRas = [
      '11202231117',
      '11202230754',
      '11202232364',
      '11202231147',
      '11202020521',
    ];
    const kvEnrollments = Object.entries(rawEnrollments).filter(([ra]) =>
      allowedRas.includes(ra),
    );

    const tenantEnrollments = kvEnrollments.map(([ra, studentComponents]) => {
      const hydratedStudentComponents = hydrateComponent(
        ra,
        studentComponents,
        components,
        tenantYear,
        tenantQuad,
      );

      return {
        ra,
        year: tenantYear,
        quad: tenantQuad,
        season,
        components: hydratedStudentComponents,
      };
    });
    // Flatten to get all enrollments
    const enrollments = tenantEnrollments.flatMap(
      (enrollment) => enrollment.components,
    );

    app.log.info({
      totalEnrollments: enrollments.length,
      msg: 'Starting enrollment sync process',
    });

    const enrollmentJobs = enrollments.map(async (enrollment) => {
      try {
        await app.job.dispatch('ProcessSingleEnrollmentAjuste', enrollment);
      } catch (error) {
        app.log.error({
          stack: error instanceof Error ? error.stack : String(error),
          error: error instanceof Error ? error.message : String(error),
          enrollment,
          msg: 'Failed to dispatch enrollment processing job',
        });
      }
    });

    await Promise.all(enrollmentJobs);

    return {
      published: true,
      msg: 'Enrollments Synced',
      totalEnrollments: enrollments.length,
    };
  } catch (error) {
    app.log.error({
      error: error instanceof Error ? error.message : String(error),
      season,
      msg: 'Failed to sync enrollments',
    });
    throw error;
  }
}

export async function processSingleEnrollmentAjuste(
  ctx: QueueContext<HydratedEnrollment>,
) {
  const enrollment = ctx.job.data;

  try {
    const data: Enrollment = {
      ra: enrollment.ra,
      disciplina: enrollment.disciplina,
      campus: enrollment.campus,
      turno: enrollment.turno,
      turma: enrollment.turma,
      year: enrollment.year,
      quad: enrollment.quad,
      teoria: enrollment.teoria,
      pratica: enrollment.pratica,
      subject: enrollment.subject,
      season: enrollment.season,
    };

    data.identifier = generateIdentifier({
      ra: enrollment.ra,
      year: enrollment.year,
      quad: enrollment.quad,
      disciplina: enrollment.disciplina,
    });

    data.disciplina_identifier = generateIdentifier({
      year: enrollment.year,
      quad: enrollment.quad,
      disciplina: enrollment.disciplina,
    });

    const result = await EnrollmentModel.findOneAndUpdate(
      {
        ra: enrollment.ra,
        year: enrollment.year,
        quad: enrollment.quad,
        disciplina: enrollment.disciplina,
      },
      {
        $set: {
          ...data,
          identifier: data.identifier,
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    ctx.app.log.debug({
      msg: 'Enrollment processed',
      ra: enrollment.ra,
      disciplina: enrollment.disciplina,
      action: result?.isNew ? 'inserted' : 'updated',
    });
  } catch (error) {
    ctx.app.log.error({
      msg: 'Error processing single enrollment',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : String(error),
      enrollment,
    });
    throw error;
  }
}

/**
 * @description Hydrate singular enrollment with database info
 */
function hydrateComponent(
  ra: string,
  studentComponents: StudentComponent[],
  components: Component[],
  year: number,
  quad: 1 | 2 | 3,
) {
  const result = [];
  const errors = [];
  const componentsMap = new Map<string, Component>();

  for (const component of components) {
    componentsMap.set(component.disciplina.toLocaleLowerCase(), component);
  }

  for (const studentComponent of studentComponents) {
    if (!studentComponent.name) {
      continue;
    }

    const component = componentsMap.get(studentComponent.name);
    if (!component) {
      errors.push(component);
      continue;
    }

    const identifier = generateIdentifier({
      ra: Number(ra),
      year,
      quad,
      disciplina: component.disciplina,
    });

    const disciplina_identifier = generateIdentifier({
      year,
      quad,
      disciplina: component.disciplina,
    });

    result.push({
      ra: Number(ra),
      nome: `${component.disciplina} ${component.turma}-${component.turno} (${component.campus})`,
      campus: component.campus,
      turno: component.turno,
      turma: component.turma,
      disciplina: component.disciplina.toLocaleLowerCase(),
      year,
      quad,
      identifier,
      disciplina_identifier,
      teoria: component.teoria,
      pratica: component.pratica,
      subject: component.subject,
      season: component.season,
    });
  }

  return result;
}
