import { sendConfirmationEmail } from './jobs/email.job.js';
import { processSingleEnrollment } from './jobs/enrollments.job.js';
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
import { postInfoIntoNotionDB } from './jobs/notion-questions.job.js';

const MONTH = 60 * 60 * 24 * 30;

export const QUEUE_JOBS: Record<any, WorkerOptions> = {
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
    concurrency: 10,
    removeOnComplete: {
      count: 1000, // Keep last 1000 successful jobs
      age: 24 * 60 * 60, // Remove jobs older than 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 24 * 60 * 60,
    },
    limiter: {
      max: 50,
      duration: 1_000,
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
   * Queue for updating our 
   codebase with the UFABC components
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
   * Queue for sending production logs to the bucket
   */
  'logs:upload': {
    concurrency: 1,
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60,
    },
  },
} as const;

export const JOBS = {
  SendEmail: {
    queue: 'send:email',
    handler: sendConfirmationEmail,
  },
  EnrolledSync: {
    queue: 'sync:enrolled',
    handler: syncEnrolled,
    every: '3 minutes',
  },
  ProcessSingleEnrolled: {
    queue: 'sync:enrolled',
    handler: processSingleEnrolled,
  },
  ComponentsSync: {
    queue: 'sync:components',
    handler: syncComponents,
    every: '1 day',
  },
  ProcessSingleComponent: {
    queue: 'sync:components',
    handler: processComponent,
  },
  UserEnrollmentsUpdate: {
    queue: 'userEnrollments:update',
    handler: userEnrollmentsUpdate,
  },
  ProcessComponentsEnrollments: {
    queue: 'userEnrollments:update',
    handler: processComponentEnrollment,
  },
  TeacherUpdate: {
    queue: 'teacher:updateEnrollments',
    handler: updateTeachers,
  },
  EnrollmentSync: {
    queue: 'enrollments:update',
    handler: processSingleEnrollment,
  },
  ComponentsTeachersSync: {
    queue: 'sync:components:teachers',
    handler: processComponentsTeachers,
  },
  LogsUpload: {
    queue: 'logs:upload',
    handler: uploadLogsToS3,
    every: '1 day',
  },
  InsertNotionPage: {
    queue: 'notion:insert',
    handler: postInfoIntoNotionDB,
  },
} as const;

export type QueueNames = keyof typeof QUEUE_JOBS;
