import { ComponentModel } from '@/models/Component.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { getStudentData } from '@/modules/email-validator.js';
import { getStudentEnrollments } from '@/modules/ufabc-parser.js';
import type { QueueContext } from '../types.js';

export async function handleUserNotFound({
  app,
  job,
}: QueueContext<{
  ra: number;
  season: string;
  context?: string;
}>) {
  const { ra, season, context = 'enrollment processing' } = job.data;

  app.log.info({
    msg: 'Attempting to fetch and create enrollments for user not found',
    ra,
    season,
    context,
  });

  try {
    const studentData = await getStudentData(ra.toString());

    if (!studentData || !studentData.email?.length) {
      app.log.warn({
        msg: 'No student data or email found for RA',
        ra,
        season,
        context,
      });

      job.returnvalue = {
        ra,
        season,
        context,
        status: 'no_student_data',
        created: false,
      };
      return;
    }

    // Use the first email from the array
    const studentEmail = studentData.email[0];

    app.log.info({
      msg: 'Found student email, fetching enrollments from parser',
      ra,
      season,
      email: studentEmail,
      fullname: studentData.fullname,
    });

    // Step 2: Get enrollments from UFABC parser
    const ufabcParserEnrollments = await getStudentEnrollments(
      studentEmail,
      season,
    );

    if (
      !ufabcParserEnrollments.data ||
      ufabcParserEnrollments.data.length === 0
    ) {
      app.log.info({
        msg: 'No enrollments found in parser for student',
        ra,
        season,
        email: studentEmail,
      });

      job.returnvalue = {
        ra,
        season,
        context,
        status: 'no_enrollments_in_parser',
        created: false,
        email: studentEmail,
      };
      return;
    }

    app.log.info({
      msg: 'Found enrollments in parser, processing',
      ra,
      season,
      email: studentEmail,
      totalEnrollments: ufabcParserEnrollments.data.length,
    });

    // Step 3: Process and create enrollments
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
          syncedBy: 'matricula' as const,
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

    // Step 4: Insert/update enrollments in database
    let createdCount = 0;
    let updatedCount = 0;

    for (const enrollment of filteredEnrollments) {
      const result = await EnrollmentModel.updateOne(
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

      if (result.upsertedCount > 0) {
        createdCount++;
      } else if (result.modifiedCount > 0) {
        updatedCount++;
      }
    }

    app.log.info({
      msg: 'Successfully processed enrollments for user not found',
      ra,
      season,
      email: studentEmail,
      fullname: studentData.fullname,
      totalProcessed: filteredEnrollments.length,
      created: createdCount,
      updated: updatedCount,
      notFound: ufabcParserEnrollments.data.length - filteredEnrollments.length,
    });

    job.returnvalue = {
      ra,
      season,
      context,
      status: 'success',
      created: true,
      email: studentEmail,
      fullname: studentData.fullname,
      totalProcessed: filteredEnrollments.length,
      enrollmentsCreated: createdCount,
      enrollmentsUpdated: updatedCount,
      componentsNotFound:
        ufabcParserEnrollments.data.length - filteredEnrollments.length,
    };
  } catch (error) {
    app.log.error({
      msg: 'Failed to handle user not found',
      ra,
      season,
      context,
      error: error instanceof Error ? error.message : String(error),
    });

    // Don't throw error to avoid infinite retry loops
    job.returnvalue = {
      ra,
      season,
      context,
      status: 'error',
      created: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
