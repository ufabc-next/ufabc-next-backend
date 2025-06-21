import { CommentModel } from '@/models/Comment.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { UserModel } from '@/models/User.js';
import type { QueueNames } from '@/queue/types.js';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.post(
    '/token',
    {
      schema: {
        body: z.object({
          email: z.string().email(),
        }),
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const isValid = app.config.BACKOFFICE_EMAILS?.includes(email);

      if (!isValid) {
        return reply.badRequest();
      }

      const user = await UserModel.findOne({
        email,
      });

      if (!user) {
        return reply.badRequest('User not found');
      }

      const token = app.jwt.sign(
        {
          _id: user._id,
          ra: user.ra,
          confirmed: user.confirmed,
          email: user.email,
          permissions: user.permissions ?? [],
        },
        { expiresIn: '2h' },
      );

      return {
        token,
      };
    },
  );

  app.get(
    '/jobs/failed',
    {
      schema: {
        querystring: z.object({
          reason: z.string(),
          batchSize: z.number().optional().default(500),
          queue: z.custom<QueueNames>((val) => {
            return (
              typeof val === 'string' &&
              Object.keys(app.job.queues).includes(val)
            );
          }),
        }),
      },
      // preHandler: (request, reply) => request.isAdmin(reply),
    },
    async (request, reply) => {
      const { reason, batchSize, queue } = request.query;

      if (!reason) {
        return reply.badRequest('Missing reason');
      }

      const failedJobs = await app.job.getFailedByReason(
        queue,
        reason,
        batchSize,
      );

      // log the quantity of failed jobs per reason
      return reply.send({
        count: failedJobs.length,
        data: failedJobs,
      });
    },
  );

  app.post(
    '/enrollments/delete-duplicates',
    {
      schema: {
        querystring: z.object({
          ra: z.coerce.number().optional(),
          dryRun: z.boolean().optional().default(true),
        }),
      },
      // preHandler: (request, reply) => request.isAdmin(reply),
    },
    async (request, reply) => {
      const { ra, dryRun } = request.query;

      const duplicatesQuery = [
        {
          $group: {
            _id: {
              ra: '$ra',
              season: '$season',
              subject: '$subject',
              year: '$year',
              quad: '$quad',
            },
            count: { $sum: 1 },
            docs: {
              $push: {
                _id: '$_id',
                ra: '$ra',
                disciplina: '$disciplina',
                turma: '$turma',
                season: '$season',
                year: '$year',
                quad: '$quad',
                identifier: '$identifier',
                createdAt: '$createdAt',
                updatedAt: '$updatedAt',
              },
            },
          },
        },
        {
          $match: {
            count: { $gt: 1 },
            '_id.subject': { $ne: null },
          },
        },
      ];

      const duplicates = await EnrollmentModel.aggregate(duplicatesQuery);
      const duplicatesToDelete = [];

      for (const group of duplicates) {
        const sortedDocs = group.docs.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        const hasComments = await Promise.all(
          sortedDocs.map((doc) => CommentModel.exists({ enrollment: doc._id })),
        );

        if (!hasComments.some((result) => result !== null)) {
          duplicatesToDelete.push(
            ...sortedDocs.slice(0, -1).map((doc) => doc._id),
          );
        }
      }

      const result = {
        totalDuplicatesFound: duplicates.length,
        duplicatesToDelete: duplicatesToDelete.length,
        deletedCount: 0,
      };

      if (duplicatesToDelete.length > 0 && !dryRun) {
        const deleteResult = await EnrollmentModel.deleteMany({
          _id: { $in: duplicatesToDelete },
        });
        result.deletedCount = deleteResult.deletedCount ?? 0;
      }

      return reply.send(result);
    },
  );
};

export default plugin;
