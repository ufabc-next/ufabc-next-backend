import { MoodleConnector } from '@/connectors/moodle.js';
import { JOB_NAMES } from '@/constants.js';
import type { JobRegistry } from '@/jobs/registry.js';

import { componentArchiveSchema } from '@/schemas/v2/components.js';
import { logger } from '@/utils/logger.js';
import { type JobManager } from '@next/queues/manager';

export class ComponentsService {
  private readonly logger;
  private readonly moodleConnector;
  private readonly manager: JobManager<JobRegistry>;

  constructor({
    manager,
    globalTraceId,
  }: {
    manager: JobManager<JobRegistry>;
    globalTraceId?: string;
  }) {
    this.logger = logger.child({
      globalTraceId,
    });
    this.moodleConnector = new MoodleConnector(globalTraceId);
    this.manager = manager;
  }

  async processComponentArchives(
    session: { sessionId: string; sessKey: string },
    globalTraceId?: string,
  ) {
    const [moodleCourses] = await this.moodleConnector.getComponents(
      session.sessionId,
      session.sessKey,
    );
    const componentArchives = componentArchiveSchema.safeParse(
      moodleCourses?.data?.courses,
    );

    if (!componentArchives.success) {
      this.logger.warn(
        { error: componentArchives.error.message },
        'Failed to parse component archives',
      );
      return { error: componentArchives.error.message };
    }

    await this.manager.dispatch(JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING, {
      component: componentArchives.data,
      globalTraceId,
      session,
    });

    return { error: null };
  }
}
