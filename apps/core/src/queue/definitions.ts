import { sendConfirmationEmail } from './jobs/email.job.js';
import {
  processSingleEnrollment,
  syncEnrollments,
} from './jobs/enrollments.job.js';
import { processSingleEnrolled, syncEnrolled } from './jobs/enrolled.job.js';
import { updateTeachers } from './jobs/teacher-update.job.js';
import { processComponent, syncComponents } from './jobs/components.job.js';
import {
  processComponentEnrollment,
  userEnrollmentsUpdate,
} from './jobs/user-enrollments.job.js';
import type { WorkerOptions } from 'bullmq';
import { processComponentsTeachers } from './jobs/components-teacher.job.js';
import { uploadLogsToS3 } from './jobs/logs.job.js';
import {
  processSingleEnrollmentAjuste,
  syncEnrollmentsAjuste,
} from './jobs/enrollments-ajuste.job.js';

type Queues =
  | 'sync:enrolled'
  | 'sync:enrollments:ajuste'
  | 'sync:enrollments:reajuste'
  | 'sync:components'
  | 'sync:components:teachers'
  | 'userEnrollments:update'
  | 'logs:upload'
  | 'send:email'
  | 'teacher:updateEnrollments';

// i need this to be Record<key itself, WorkerOptions>
export const QUEUE_JOBS: Record<Queues, WorkerOptions> = {
  /**
   * Queue for Syncing Matriculas with UFABC
   */
  'sync:enrolled': {
    concurrency: 5,
  },
  /**
   * Queue for updating enrollments in ajuste
   */
  'sync:enrollments:ajuste': {
    concurrency: 150,
    removeOnComplete: {
      count: 1000, // Keep last 1000 successful jobs
      age: 24 * 60 * 60, // Remove jobs older than 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 24 * 60 * 60,
    },
    limiter: {
      max: 250,
      duration: 1_000,
    },
  },
  /**
   * Queue for updating enrollments in ajuste
   */
  'sync:enrollments:reajuste': {
    concurrency: 150,
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 24 * 60 * 60,
    },
    limiter: {
      max: 250,
      duration: 1_000,
    },
  },
  /**
   * Queue for updating our
   * codebase with the UFABC components
   */
  'sync:components': {
    concurrency: 10,
    removeOnComplete: {
      count: 1000,
      age: 24 * 60 * 60,
    },
    limiter: {
      max: 50,
      duration: 1000,
    },
  },
  /**
   * Queue for updating our 
   codebase with the UFABC teachers
  */
  'sync:components:teachers': {
    concurrency: 10,
    removeOnComplete: {
      count: 1000,
      age: 24 * 60 * 60,
    },
    limiter: {
      max: 50,
      duration: 1000,
    },
  },
  /**
   * Queue for updating our 
   codebase with the users enrollments
   */
  'userEnrollments:update': {
    concurrency: 5,
    removeOnComplete: {
      count: 400,
      age: 0,
    },
  },
  /**
   * Queue for sending production logs to the bucket
   */
  'logs:upload': {
    concurrency: 1,
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60,
    },
  },
  /**
   * Queue for sending emails
   */
  'send:email': {},
  /**
   * Queue for updating enrollments the teacher had lectures in
   */
  'teacher:updateEnrollments': {
    concurrency: 5,
  },
} as const;

export const JOBS = {
  SendEmail: {
    queue: 'send:email',
    handler: sendConfirmationEmail,
    every: null,
  },
  EnrolledSync: {
    queue: 'sync:enrolled',
    handler: syncEnrolled,
    every: null,
  },
  ProcessSingleEnrolled: {
    queue: 'sync:enrolled',
    handler: processSingleEnrolled,
    every: '2 minutes',
  },
  ComponentsSync: {
    queue: 'sync:components',
    handler: syncComponents,
    every: null,
  },
  ProcessSingleComponent: {
    queue: 'sync:components',
    handler: processComponent,
    every: '2 minutes',
  },
  EnrollmentsSyncAjuste: {
    queue: 'sync:enrollments:ajuste',
    handler: syncEnrollmentsAjuste,
    every: null,
  },
  ProcessSingleEnrollmentAjuste: {
    queue: 'sync:enrollments:ajuste',
    handler: processSingleEnrollmentAjuste,
    every: '1 day',
  },
  EnrollmentsSyncReajuste: {
    queue: 'sync:enrollments:reajuste',
    handler: syncEnrollments,
    every: null,
  },
  ProcessSingleEnrollmentReajuste: {
    queue: 'sync:enrollments:reajuste',
    handler: processSingleEnrollment,
    every: null,
  },
  UserEnrollmentsUpdate: {
    queue: 'userEnrollments:update',
    handler: userEnrollmentsUpdate,
    every: null,
  },
  ProcessComponentsEnrollments: {
    queue: 'userEnrollments:update',
    handler: processComponentEnrollment,
    every: null,
  },
  TeacherUpdate: {
    queue: 'teacher:updateEnrollments',
    handler: updateTeachers,
    every: null,
  },
  ComponentsTeachersSync: {
    queue: 'sync:components:teachers',
    handler: processComponentsTeachers,
    every: null,
  },
  LogsUpload: {
    queue: 'logs:upload',
    handler: uploadLogsToS3,
    every: '1 day',
  },
} as const;

export type QueueNames = keyof typeof QUEUE_JOBS;
