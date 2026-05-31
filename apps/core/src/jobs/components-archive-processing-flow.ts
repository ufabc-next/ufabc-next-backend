import { Types } from 'mongoose';
import { defineJob } from '@next/queues/client';
import z from 'zod';

import { JOB_NAMES } from '@/constants.js';
import { ComponentArchiveModel } from '@/models/ComponentArchive.js';
import { ArchiveEngine } from '@/services/archive-engine.js';

const componentSchema = z.object({
  viewurl: z.string().url(),
  fullname: z.string(),
  shortname: z.string().optional(),
  idnumber: z.string().optional(),
  id: z.number(),
});

const moodleUserSchema = z.object({
  fullname: z.string(),
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
      moodleUser: moodleUserSchema.optional(),
    }),
  )
  .iterator('component')
  .concurrency(3)
  .handler(async ({ job, manager }) => {
    const { component, session } = job.data;
    const globalTraceId = job.data.globalTraceId;
    const moodleUser = job.data.moodleUser;

    const engine = new ArchiveEngine({ globalTraceId, session });

    const matchedComponent = await engine.findComponentByMoodleCourse(
      component,
      moodleUser?.fullname,
    );

    if (!matchedComponent) {
      throw new Error(
        `No matching component found for Moodle course: "${component.fullname}" (id: ${component.id}). ` +
        `The teacher must have a component registered in this season.`,
      );
    }

    const componentDbId = matchedComponent._id.toString();

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
          componentDbId,
          globalTraceId,
          session,
        },
      })),
    });

    return {
      success: true,
      flowStarted: true,
      componentDbId,
      moodleCourseId: component.id,
    };
  });

export const pdfDownloadJob = defineJob(
  JOB_NAMES.COMPONENTS_ARCHIVES_PROCESSING_PDF,
)
  .input(
    z.object({
      component: z.string(),
      rawUrl: z.string().url(),
      componentDbId: z.string(),
      globalTraceId: z.string().optional(),
      session: z
        .object({
          sessionId: z.string(),
          sessKey: z.string(),
        })
        .optional(),
    }),
  )
  .concurrency(10)
  .handler(async ({ job, app }) => {
    const { rawUrl, componentDbId, globalTraceId, session } = job.data;

    const engine = new ArchiveEngine({
      globalTraceId,
      session,
      s3Connector: app.aws.s3,
    });

    const timestamp = new Date();

    const componentObjectId = new Types.ObjectId(componentDbId);

    const archive = await ComponentArchiveModel.findOneAndUpdate(
      { component: componentObjectId, original_url: rawUrl },
      {
        $setOnInsert: {
          component: componentObjectId,
          original_url: rawUrl,
          timeline: [{ status: 'created', timestamp, metadata: { globalTraceId } }],
        },
        $set: { status: 'created' },
      },
      { upsert: true, new: true },
    );

    try {
      const result = await engine.downloadAndUpload(
        rawUrl,
        componentDbId,
        app.config.AWS_BUCKET ?? 'debug_bucket',
      );

      await ComponentArchiveModel.findByIdAndUpdate(archive._id, {
        $set: {
          s3_key: result.s3Key,
          file_name: result.pdfName,
          status: 'stored',
        },
        $push: {
          timeline: { status: 'stored', timestamp: new Date(), metadata: { s3Key: result.s3Key } },
        },
      });

      return {
        success: true,
        message: 'PDF uploaded',
        data: result,
        archiveId: archive._id,
      };
    } catch (error) {
      await ComponentArchiveModel.findByIdAndUpdate(archive._id, {
        $push: {
          timeline: { status: 'failed', timestamp: new Date(), metadata: { error: String(error) } },
        },
        $set: { status: 'failed' },
      });
      throw error;
    }
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
