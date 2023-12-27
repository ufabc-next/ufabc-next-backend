import { asyncParallelMap, generateIdentifier, logger } from '@next/common';
import { createQueue } from '@/helpers/queueUtil.js';
import type { EnrollmentDocument, EnrollmentModel } from '@/types/models.js';
import type { Job } from 'bullmq';

type UpdateEnrollments = {
  payload: { json: EnrollmentDocument[] };
  enrollmentModel: EnrollmentModel;
};

function updateEnrollments({ payload, enrollmentModel }: UpdateEnrollments) {
  const data = payload.json;
  // for the record: if it has an _id it is obligatory a Document
  const updateEnrollment = async (enrollment: EnrollmentDocument) => {
    const keys = ['ra', 'year', 'quad', 'disciplina'];

    const key = {
      ra: enrollment.ra,
      year: enrollment.year,
      quad: enrollment.quad,
      disciplina: enrollment.disciplina,
    };

    const identifier = generateIdentifier(key, keys);

    try {
      const insertOpts = { new: true, upsert: true };
      const {
        ra,
        year,
        quad,
        disciplina,
        identifier: ignored,
        _id,
        ...updateData
      } = enrollment;
      // this piece of code right here is a MASSIVE query
      // for the record: since its inserting it needs to be a document and being a document means
      // it has and _id
      await enrollmentModel.findOneAndUpdate(
        { identifier },
        { $set: updateData },
        insertOpts,
      );
    } catch (error) {
      logger.error(error);
      throw error;
    }
  };

  return asyncParallelMap(data, updateEnrollment, 10);
}

export const updateEnrollmentsQueue = createQueue('Update:Enrollments');

export const addEnrollmentsToQueue = async (
  payload: Job<UpdateEnrollments>,
) => {
  await updateEnrollmentsQueue.add('Update:Enrollments', payload);
};

export const updateEnrollmentsWorker = async (job: Job<UpdateEnrollments>) => {
  try {
    const payload = job.data;
    await updateEnrollments(payload);
  } catch (error) {
    logger.error(
      { error },
      'updateEnrollmentsWorker: Error updating enrollments',
    );
    throw error;
  }
};
