import { defineJob } from '@next/queues/client';
import z from 'zod';

import { JOB_NAMES } from '@/constants.js';

import { ArchiveEngine } from '@/services/archive-engine.js';

const componentSchema = z.object({
  viewurl: z.string().url(),
  fullname: z.string(),
  id: z.number(),
});

export const componentsArchivesProcessingJob = defineJob(
  JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING,
)
  .input(
    z.object({
      component: componentSchema.array(),
      globalTraceId: z.string().optional(),
      session: z.object({
        sessionId: z.string(),
        sessKey: z.string(),
      }),
    }),
  )
  .iterator('component')
  .concurrency(3)
  .handler(async ({ job, manager }) => {
    const { component, session } = job.data;
    const globalTraceId = job.data.globalTraceId;

    const engine = new ArchiveEngine({ globalTraceId, session });

    const files = await engine.extractFiles(
      component.viewurl,
      component.id,
    );

    if (files.length === 0) {
      return {
        success: true,
        message: 'No PDFs found in component',
        data: [],
      };
    }

    await manager.dispatchFlow({
      name: `summary-${component.fullname}`,
      queueName: JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_SUMMARY,
      data: { name: component.fullname, total: files.length, globalTraceId },
      children: files.map((file) => ({
        name: JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_PDF,
        queueName: JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_PDF,
        data: {
          component: component.fullname,
          rawUrl: file.url,
          moodleComponentId: component.id,
          globalTraceId,
        },
      })),
    });

    return {
      success: true,
      flowStarted: true,
    };
  });

export const pdfDownloadJob = defineJob(
  JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_PDF,
)
  .input(
    z.object({
      component: z.string(),
      rawUrl: z.string().url(),
      moodleComponentId: z.number(),
      globalTraceId: z.string().optional(),
    }),
  )
  .concurrency(10)
  .handler(async ({ job, app }) => {
    const { rawUrl, moodleComponentId } = job.data;

    const engine = new ArchiveEngine({
      globalTraceId: job.data.globalTraceId,
      s3Connector: app.aws.s3,
    });

    const result = await engine.downloadAndUpload(
      rawUrl,
      moodleComponentId,
      app.config.AWS_BUCKET ?? 'debug_bucket',
    );

    return {
      success: true,
      message: 'PDF uploaded',
      data: result,
    };
  });

export const archivesSummaryJob = defineJob(
  JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_SUMMARY,
)
  .input(
    z.object({
      name: z.string(),
      total: z.number(),
      globalTraceId: z.string().optional(),
    }),
  )
  .handler(async ({ job }) => {
    const { name, total, globalTraceId } = job.data;
    return {
      success: true,
      message: 'Archives summary',
      data: { name, total, globalTraceId },
    };
  });
