import { EnrollmentModel, type Enrollment } from '@/models/Enrollment.js';
import { setTimeout as delay } from 'node:timers/promises';
import { UserModel } from '@/models/User.js';
import {
  getClasses,
  type UfabcParserEnrollment,
} from '@/modules/ufabc-parser.js';
import { ComponentModel } from '@/models/Component.js';
import { logger } from '@/utils/logger.js';
import type { QueueContext } from '../types.js';
import { TeacherModel } from '@/models/Teacher.js';
import type { Types } from 'mongoose';

const teacherCache = new Map();

/**
 * This job is used to sync the enrollments for the given season.
 * It will connect to the ufabc-parser database and retrieve the classes for the given season.
 * then will cross reference to the enrollments and create the enrollments for the given season.
 * also will  update the enrollments for the given season.
 */
export async function syncSeasonEnrollments(
  ctx: QueueContext<{ season: string }>,
) {
  const { season } = ctx.job.data;
  const { app } = ctx;
  const logins = await getUsers(season);
  const enrollments = await throttleRequests(logins, async ({ login, ra }) => {
    if (!login) {
      throw new Error('Login is required');
    }

    const classes = await getClasses(season, login);
    return {
      ra,
      login,
      classes,
    };
  });


  const enrollmentsPromises = enrollmentsWithTeacher.map(async (enrollment) => {
    try {
      await app.job.dispatch('ProcessSyncEnrollment', {
        ...enrollment,
        season,
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          enrollment,
        },
        'Error processing enrollment',
      );
      throw error;
    }
  });

  await Promise.all(enrollmentsPromises);

  return {
    msg: 'Enrollments sync initiated',
    totalEnrollments: enrollmentsWithTeacher.length,
  };
}

/**
 * This function is going to use so we dont overload the ufabc-parser with requests
 * So we throtle it
 */
async function throttleRequests<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 5,
  delayMs = 1000,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkPromises = chunk.map(fn);

    // Process current batch
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Delay before next batch if not the last chunk
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

async function getUsers(season: string) {
  const ras = await EnrollmentModel.distinct('ra');

  if (ras.length === 0) {
    throw new Error('No enrollments found for the given season');
  }

  const emails = await UserModel.find(
    {
      ra: { $in: ras },
    },
    { email: 1, ra: 1 },
  ).lean();

  if (emails.length === 0) {
    throw new Error('No emails found for the given enrollments');
  }

  const logins = emails
    .map(({ email, ra }) => ({
      login: email?.split('@')[0],
      ra,
    }))
    .filter(({ login }) => login)
    .filter(({ ra }) => ra != null);

  return logins;
}

async function buildEnrollment(
  enrollment: UfabcParserEnrollment & {
    teoria?: Types.ObjectId | null;
    pratica?: Types.ObjectId | null;
  },
  season: string,
  ra: number,
): Promise<Partial<Enrollment>> {
  const matchingComponent = await ComponentModel.findOne({
    uf_cod_turma: enrollment.enrollmentCode,
    season,
  });

  if (!matchingComponent) {
    logger.error(
      {
        ufParserEnrollment: enrollment,
      },
      'Could not find match with next database',
    );
    throw new Error('Missing matching component');
  }

  return {
    ra,
    year: Number(season.split(':')[0]),
    quad: Number(season.split(':')[1]),
    disciplina: enrollment.name,
    turma: enrollment.class,
    turno: enrollment.shift,
    campus: enrollment.campus,
    uf_cod_turma: enrollment.enrollmentCode,
    disciplina_id: enrollment.id,
    creditos: enrollment.credits,
    kind: 'auto',
    syncedBy: 'ufabc-parser',
    season,
    subject: matchingComponent.subject,
    teoria: enrollment.teoria ?? matchingComponent.teoria,
    pratica: enrollment.pratica ?? matchingComponent.pratica,
  };
}

async function mapParserEnrollmentsToTeacher(
  enrollments: Array<{
    ra: number | null | undefined;
    login: string;
    classes: { data: UfabcParserEnrollment[] };
  }>,
) {
  const enrollmentsWithTeachersPromises = enrollments.map(async ({ ra, login, classes }) => {
    const classesWithTeachers = await Promise.all(
      classes.data.map(async (enrollment) => {
        return {
          ...enrollment,
          teoria: await findTeacher(
            enrollment.teachers?.find((t) => t.role === 'professor')?.name ??
              null,
          ),
          pratica: await findTeacher(
            enrollment.teachers?.find((t) => t.role === 'practice')?.name ??
              null,
          ),
        };
      }),
    );

    return {
      ra,
      login,
      classes: {
        data: classesWithTeachers,
      },
    };
  })

  const enrollmentsWithTeachers = await Promise.all(enrollmentsWithTeachersPromises);

  return enrollmentsWithTeachers;
}

async function findTeacher(name: string | null) {
  if (!name) {
    return null;
  }

  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\u0300-\u036f/g, '');

  if (teacherCache.has(normalizedName)) {
    return teacherCache.get(normalizedName);
  }

  const teacher = await TeacherModel.findByFuzzName(normalizedName);
  if (!teacher && normalizedName !== '0') {
    logger.warn({
      msg: 'Teacher not found',
      originalName: name,
      normalizedName,
    });
    teacherCache.set(normalizedName, null);
    return null;
  }
  if (teacher && !teacher.alias.includes(normalizedName)) {
    await TeacherModel.findByIdAndUpdate(teacher._id, {
      $addToSet: { alias: [normalizedName, name.toLowerCase()] },
    });
  }
  teacherCache.set(normalizedName, teacher?._id ?? null);
  return teacher?._id ?? null;
}

type ProcessSyncEnrollment = {
  ra: number | null | undefined;
  login: string;
  classes: {
    data: Array<
      UfabcParserEnrollment & {
        teoria: Types.ObjectId | null;
        pratica: Types.ObjectId | null;
      }
    >;
  };
  season: string;
};

export async function processSyncEnrollment(
  ctx: QueueContext<ProcessSyncEnrollment>,
) {
  const { ra, login, classes, season } = ctx.job.data;

  if (!ra || !login) {
    logger.error(
      {
        login,
        ra,
      },
      'RA and login are required',
    );
    throw new Error('RA is required');
  }

  try {
    for (const enrollment of classes.data) {
      const dbEnrollment = await EnrollmentModel.findOne({
        ra,
        season,
        $or: [
          {
            uf_cod_turma: enrollment.enrollmentCode,
          },
          {
            subject: enrollment.
          }
        ],
      });

      if (dbEnrollment) {
        logger.info(
          {
            ra,
            login,
            enrollment: enrollment.enrollmentCode,
          },
          'Enrollment already exists',
        );
        await EnrollmentModel.updateOne(
          { _id: dbEnrollment._id },
          {
            $set: {
              teoria: enrollment.teoria ?? dbEnrollment.teoria,
              pratica: enrollment.pratica ?? dbEnrollment.pratica,
              syncedBy: 'ufabc-parser',
              kind: 'auto',
            },
          },
        );
        continue;
      }

      const buildedEnrollment = await buildEnrollment(enrollment, season, ra);
      await EnrollmentModel.create(buildedEnrollment);
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        ra,
        login,
      },
      'Error processing enrollment',
    );
    throw error;
  }
}
