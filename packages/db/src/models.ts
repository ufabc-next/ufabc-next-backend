import {
  HistoryProcessingJobModel as HistoryProcessingJob,
  type HistoryProcessingJobDocument,
} from './models/history-processing-job.ts';
import { StudentSync } from './models/student-sync.ts';

export const db = {
  StudentSync,
  HistoryProcessingJob,
};

export type DatabaseModels = typeof db;
export type { HistoryProcessingJobDocument };
