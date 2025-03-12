import { currentQuad, generateIdentifier } from '@next/common';
import { EnrollmentModel } from '@/models/Enrollment.js';
import type { QueueContext } from '../types.js';
import type { Types } from 'mongoose';
import { getEnrollments } from '@/modules/ufabc-parser.js';
import { ComponentModel } from '@/models/Component.js';

type HydratedComponent = {
  disciplina_id: number | '-';
  codigo: string;
  disciplina: string;
  campus: 'sbc' | 'sa';
  turma: string;
  turno: 'diurno' | 'noturno';
  vagas: number;
  teoria: Types.ObjectId;
  pratica: Types.ObjectId;
  season: string;
  year: number;
  ra: number;
  quad: number;
  subject: Types.ObjectId;
};

export async function processSingleEnrollment(
  ctx: QueueContext<HydratedComponent>,
) {
  const enrollment = ctx.job.data;
  const [settlementData, resettlementData] = await Promise.all([
    getEnrollments('settlement'),
    getEnrollments('resettlement'),
  ]);

  try {
    const allRAs = new Set([
      ...Object.keys(settlementData || {}),
      ...Object.keys(resettlementData || {}),
    ]);

    const enrollmentJobPromises = Array.from(allRAs).map(async (ra) => {
      try {
        const components = [
          ...(settlementData?.[ra]?.filter((comp) => !comp.errors?.length) ||
            []),
          ...(resettlementData?.[ra]?.filter((comp) => !comp.errors?.length) ||
            []),
        ];

        if (components.length === 0) {
          return;
        }

        await ctx.app.job.dispatch('EnrollmentSync', {
          ra: Number(ra),
          components,
        });
      } catch (error) {
        ctx.app.log.error({
          error: error instanceof Error ? error.message : String(error),
          ra,
          msg: 'Failed to dispatch settlement enrollment processing job',
        });
      }
    });

    await Promise.all(enrollmentJobPromises);

    ctx.app.log.info({
      msg: 'Settlement enrollments processing complete',
      totalRAs: allRAs.size,
    });
  } catch (error) {
    ctx.app.log.error({
      msg: 'Error processing single enrollment',
      error: error instanceof Error ? error.message : String(error),
      enrollment,
    });
    throw error;
  }
}

export async function processRASettlements({
  app,
  job,
}: QueueContext<{
  ra: number;
  components: Array<{
    code: string;
    name: string | null;
  }>;
}>) {
  const { ra, components } = job.data;

  try {
    const season = currentQuad();
    const [year, quad] = season.split(':').map(Number);

    // Find components in the database
    const componentCodes = components.map((c) => c.code);
    const dbComponents = await ComponentModel.find({
      codigo: { $in: componentCodes },
      season,
    }).lean();

    // Create enrollment records
    const enrollmentPromises = dbComponents.map(async (component) => {
      const data = {
        ra,
        disciplina: component.disciplina.toLowerCase(),
        campus: component.campus,
        turno: component.turno,
        turma: component.turma,
        year,
        quad,
        teoria: component.teoria,
        pratica: component.pratica,
        subject: component.subject,
        season,
      };

      const identifier = generateIdentifier({
        ra,
        year,
        quad,
        disciplina: component.disciplina,
      });

      const disciplina_identifier = generateIdentifier({
        year,
        quad,
        disciplina: component.disciplina,
      });

      return EnrollmentModel.findOneAndUpdate(
        {
          ra,
          year,
          quad,
          disciplina: component.disciplina.toLowerCase(),
        },
        {
          $set: {
            ...data,
            identifier,
            disciplina_identifier,
          },
        },
        {
          new: true,
          upsert: true,
        },
      );
    });

    const results = await Promise.all(enrollmentPromises);

    app.log.debug({
      msg: 'Settlement enrollments processed for RA',
      ra,
      componentsCount: results.length,
    });
  } catch (error) {
    app.log.error({
      error: error instanceof Error ? error.message : String(error),
      ra,
      msg: 'Error processing settlement enrollments for RA',
    });
    throw error;
  }
}
