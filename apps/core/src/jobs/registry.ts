import { JOB_NAMES } from '../constants.ts';
import {
  componentsArchivesProcessingJob,
  pdfDownloadJob,
  archivesSummaryJob,
} from './components-archive-processing-flow.ts';
import { createComponentJob } from './components-processing.ts';
import {
  enrolledStudentsJob,
  processEnrollmentJob,
} from './enrolled-students.ts';
import { enrollmentsProcessingJob } from './enrollments-processing.ts';
import { studentSyncProcessingJob } from './student-sync-processing.ts';
import { teacherCreatedJob } from './teacher-created.ts';
import { ufabcParserWebhookProcessingJob } from './ufabc-parser-webhook-processing.ts';

export const jobRegistry = {
  [JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING]: componentsArchivesProcessingJob,
  [JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_PDF]: pdfDownloadJob,
  [JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_SUMMARY]: archivesSummaryJob,
  [JOB_NAMES.ENROLLED_STUDENTS]: enrolledStudentsJob,
  [JOB_NAMES.PROCESS_ENROLLED_STUDENTS]: processEnrollmentJob,
  [JOB_NAMES.COMPONENTS_PROCESSING]: createComponentJob,
  [JOB_NAMES.PROCESS_COMPONENTS_ENROLLMENTS]: enrollmentsProcessingJob,
  [JOB_NAMES.UFABC_PARSER_WEBHOOK_PROCESSING]: ufabcParserWebhookProcessingJob,
  [JOB_NAMES.STUDENT_SYNC_PROCESSING]: studentSyncProcessingJob,
  [JOB_NAMES.TEACHER_CREATED]: teacherCreatedJob,
} as const;

export type JobRegistry = typeof jobRegistry;
