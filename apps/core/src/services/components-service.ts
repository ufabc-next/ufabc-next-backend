import { JOB_NAMES } from '@/constants.js';
import type { JobRegistry } from '@/jobs/registry.js';

import { type JobManager } from '@next/queues/manager';

import { ArchiveEngine, type MoodleSession } from './archive-engine.js';

export class ComponentsService {
  private readonly engine: ArchiveEngine;
  private readonly manager: JobManager<JobRegistry>;

  constructor({
    manager,
    globalTraceId,
  }: {
    manager: JobManager<JobRegistry>;
    globalTraceId?: string;
  }) {
    this.engine = new ArchiveEngine({ globalTraceId });
    this.manager = manager;
  }

  async processComponentArchives(
    session: MoodleSession,
    globalTraceId?: string,
    enrolledCodigos?: string[],
  ) {
    const result = await this.engine.fetchAndValidateCourses(session);
    if (result.error) {
      return { error: result.error };
    }

    await this.manager.dispatch(JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING, {
      component: result.data!,
      globalTraceId,
      session,
      enrolledCodigos,
    });

    return { error: null };
  }
}
