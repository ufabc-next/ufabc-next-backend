import { EnrollmentModel } from '@/models/Enrollment.js';
import { UserModel } from '@/models/User.js';
import { currentQuad } from '@next/common';
import { getStudentEnrollments } from '@/modules/ufabc-parser.js';
import { ComponentModel } from '@/models/Component.js';
import type { QueueContext } from '../types.js';

export async function scheduledEnrollmentsProcessing(
  ctx: QueueContext<unknown>,
) {
  const season = currentQuad();
  const distinctRas = await EnrollmentModel.distinct('ra', {
    season,
  });

  ctx.app.log.info({
    msg: 'Processing season enrollments',
    totalRas: distinctRas.length,
  });

  const enrollmentJobsPromises = distinctRas.map(async (ra) => {
    try {
      await ctx.app.job.dispatch('ProcessEnrollmentsForRa', {
        ra,
        season: '2025:2',
      });
    } catch (error) {
      ctx.app.log.error({
        error,
        message: error instanceof Error ? error.message : String(error),
        ra,
        msg: 'Failed to dispatch single enrollment processing job',
      });
    }
  });

  await Promise.all(enrollmentJobsPromises);

  ctx.app.log.info({
    msg: 'Enrollments processing tasks dispatched',
    totalRas: enrollmentJobsPromises.length,
  });
}

export async function processEnrollmentsForRa({
  app,
  job,
}: QueueContext<{
  ra: number;
  season: string;
}>) {
  const { ra, season } = job.data;
  const res = await UserModel.findOne({
    ra,
  })
    .select('email -_id')
    .lean<{ email: string }>();

  if (!res) {
    app.log.warn(
      `User with RA ${ra} not found, dispatching enrollment creation job`,
    );

    // Dispatch job to create enrollments using RA instead of throwing error
    try {
      await app.job.dispatch('HandleUserNotFound', {
        ra,
        season,
        context: 'enrollment processing',
      });
    } catch (error) {
      app.log.error({
        msg: 'Failed to dispatch user not found job',
        ra,
        season,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return early with appropriate return value
    job.returnvalue = {
      ra,
      season,
      status: 'user_not_found',
    };
    return;
  }

  // Process enrollments for the found email
  const enrollments = await EnrollmentModel.find({
    ra,
    season,
  }).lean();

  if (enrollments.length === 0) {
    app.log.info(`No enrollments found for RA ${ra} in season ${season}`);
    job.returnvalue = {
      ra,
      season,
    };

    return;
  }

  app.log.info({
    msg: 'Processing enrollments for RA',
    ra,
    season,
    totalEnrollments: enrollments.length,
  });

  const ufabcParserEnrollments = await getStudentEnrollments(res.email, season);

  if (
    !ufabcParserEnrollments.data ||
    ufabcParserEnrollments.data.length === 0
  ) {
    app.log.info(
      `No enrollments found in parser for RA ${ra} in season ${season}`,
    );
    job.returnvalue = {
      ra,
      season,
    };
    return;
  }

  const enrollmentsWithComponentsPromises = ufabcParserEnrollments.data.map(
    async (enrollment) => {
      const component = await ComponentModel.findOne({
        uf_cod_turma: enrollment.code,
      })
        .select('-_id')
        .lean();

      if (!component) {
        app.log.warn({
          msg: 'Component not found for enrollment',
          code: enrollment.code,
          ra,
          season,
        });

        return null;
      }

      const connectedEnrollment = {
        ...component,
        ra,
        syncedBy: 'matricula',
      };

      return connectedEnrollment;
    },
  );

  const enrollmentsWithComponents = await Promise.all(
    enrollmentsWithComponentsPromises,
  );
  const filteredEnrollments = enrollmentsWithComponents.filter(
    (enrollment): enrollment is NonNullable<typeof enrollment> =>
      enrollment !== null,
  );

  for (const enrollment of filteredEnrollments) {
    await EnrollmentModel.updateOne(
      {
        ra: enrollment.ra,
        season: enrollment.season,
        uf_cod_turma: enrollment.uf_cod_turma,
      },
      {
        $set: {
          ...enrollment,
        },
      },
      { upsert: true },
    );
  }

  job.returnvalue = {
    ra,
    season,
  };
}
