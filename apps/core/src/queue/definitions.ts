import { sendConfirmationEmail } from './jobs/email.js';
import { updateEnrollments } from './jobs/enrollmentsUpdate.js';
import { syncEnrolled } from './jobs/syncEnrolled.js';
import { updateTeachers } from './jobs/teacherUpdate.js';
// import { updateUserEnrollments } from './jobs/userEnrollmentsUpdate.js';
import { syncComponents } from './jobs/syncComponents.js';
import type { WorkerOptions } from 'bullmq';

type QueueDefinition = Record<string, WorkerOptions>;

const MONTH = 60 * 60 * 24 * 30;

export const QUEUE_JOBS = {
  /**
   * Queue for sending emails
   */
  'send:email': {
    removeOnComplete: {
      age: MONTH,
    },
  },
  /**
   * Queue for updating enrollments
   */
  'enrollments:update': {
    concurrency: 1,
    removeOnComplete: {
      age: 0,
    },
  },
  /**
   * Queue for updating enrollments the teacher had lectures in
   */
  'teacher:updateEnrollments': {
    concurrency: 5,
  },
  /**
   * Queue for Syncing Matriculas with UFABC
   */
  'sync:enrolled': {
    concurrency: 5,
  },
  /**
   * Queue for updating our codebase with the users enrollments
   */
  'userEnrollments:update': {
    concurrency: 5,
  },
  'sync:components': {
    concurrency: 1,
  },
} as const satisfies QueueDefinition;

type JobsDefinition = Record<
  string,
  {
    queue: keyof typeof QUEUE_JOBS;
    // TODO: remove any
    handler: (params: any) => Promise<unknown>;
    every?: string;
  }
>;

export const REGISTERED_JOBS = {
  SendEmail: {
    queue: 'send:email',
    handler: sendConfirmationEmail,
  },
  EnrolledSync: {
    queue: 'sync:enrolled',
    handler: syncEnrolled,
    every: '2 minutes',
  },
  ComponentsSync: {
    queue: 'sync:components',
    handler: syncComponents,
    every: '1d',
  },
  EnrollmentsUpdate: {
    queue: 'enrollments:update',
    handler: updateEnrollments,
  },
  // UserEnrollmentsUpdate: {
  //   queue: 'UserEnrollments:Update',
  //   handler: updateUserEnrollments,
  // },
  TeacherUpdate: {
    queue: 'teacher:updateEnrollments',
    handler: updateTeachers,
  },
} as const satisfies JobsDefinition;
