//@ts-nocheck
import { CommentModel } from '@/models/Comment.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { UserModel } from '@/models/User.js';
import type { QueueNames } from '@/queue/types.js';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import fs from 'node:fs';

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
          type: z.enum(['quad']).default('quad'),
          batchSize: z.coerce.number().default(500),
        }),
        body: z.object({
          dryRun: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const { ra, type, batchSize } = request.query;
      const { dryRun } = request.body;

      const groupStrategies = {
        quad: { ra: '$ra', subject: '$subject', year: '$year', quad: '$quad' },
      };

      //pega os enrollments do banco de dados
      const fetchDuplicates = async (type, raList) => {
        const pipeline = [
          {
            $group: {
              _id: groupStrategies[type],
              count: { $sum: 1 },
              docs: {
                $push: {
                  _id: '$_id',
                  ra: '$ra',
                  disciplina: '$disciplina',
                  turma: '$turma',
                  subject: '$subject',
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
              ...(raList ? { '_id.ra': { $in: raList } } : {}),
            },
          },
        ];
        return await EnrollmentModel.aggregate(pipeline);
      };

      //processa os enrollments obtidos e verifica se há duplicatas
      const processDuplicates = async (duplicates) => {
        const duplicatesToDelete = [];

        //retorna uma lista com todos os objectId dos enrollments
        const allEnrollmentIds = duplicates.flatMap((g) =>
          g.docs.map((doc) => doc._id),
        );

        //busca todos os enrollments com comentarios atrelados em apenas uma query
        const commentDocs = await CommentModel.find({
          enrollment: { $in: allEnrollmentIds.map((doc) => doc._id) },
        }).select('enrollment');

        const commentSet = new Set(
          commentDocs.map((c) => c.enrollment.toString()),
        );

        for (const group of duplicates) {
          //retorna os enrollments em ordem crescente
          const sorted = group.docs.toSorted(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          );

          //verifica se algum enrollment tem comentario associado
          const hasAnyComment = sorted.some((doc) =>
            commentSet.has(doc._id.toString()),
          );

          if (hasAnyComment) {
            //!!!essa delecao mantem as duplicatas caso ambos enrollments tem comentarios associados
            duplicatesToDelete.push(
              ...sorted
                .filter((d) => !commentSet.has(d._id.toString()))
                .map((d) => d._id),
            );

            if (duplicatesToDelete.length === 0) {
              app.log.warn({ group }, 'Duplicates with comments not deleted');
            }
          } else {
            //deleta os enrollments mais recentes
            duplicatesToDelete.push(...sorted.slice(1).map((d) => d._id));
          }
        }

        return duplicatesToDelete;
      };

      //cria o padrao old/new image das operacoes realizadas
      const summarize = async (duplicatesToDelete, duplicates) => {
        const oldImage = duplicates
          .flatMap((g) => g.docs)
          .map((d) => ({
            _id: d._id,
            ra: d.ra,
            disciplina: d.disciplina,
            subject: d.subject,
            year: d.year,
            quad: d.quad,
          }));

        const newImage = duplicates
          .flatMap((g) =>
            g.docs.filter((d) => !duplicatesToDelete.includes(d._id)),
          )
          .map((d) => ({
            _id: d._id,
            ra: d.ra,
            disciplina: d.disciplina,
            subject: d.subject,
            year: d.year,
            quad: d.quad,
          }));

        const parsedNewImage = new Set(newImage.map((d) => d._id.toString()));
        const diff = oldImage.filter(
          (d) => !parsedNewImage.has(d._id.toString()),
        );

        return { diff, oldImage, newImage };
      };

      const handleRaList = ra ? [ra] : await EnrollmentModel.distinct('ra');

      //delecao em batch
      let partialResult = null;
      let totalDuplicatesFound = 0;
      let totalDuplicatesToDelete = 0;
      let deletedCount = 0;
      let struct = null;

      const date = `${new Date().toISOString()}`;
      fs.appendFileSync(`logs/enrollment-duplicates-log-${date}.json`, '[');

      for (let i = 0; i < handleRaList.length; i += batchSize) {
        const batchRa = handleRaList.slice(i, i + batchSize);

        const duplicates = await fetchDuplicates('quad', batchRa);

        const duplicatesToDelete = await processDuplicates(duplicates);

        struct = await summarize(duplicatesToDelete, duplicates);

        totalDuplicatesFound += duplicates.length;
        totalDuplicatesToDelete += duplicatesToDelete.length;

        if (!dryRun) {
          app.log.info(
            `Deleting ${duplicatesToDelete.length} duplicate enrollments (type: ${type})`,
          );
          const del = await EnrollmentModel.deleteMany({
            _id: { $in: duplicatesToDelete },
          });

          deletedCount += del.deletedCount;
        }

        partialResult = {
          ra: ra ?? null,
          totalDuplicatesFound,
          totalDuplicatesToDelete,
          deletedCount,
          type,
          currentBatch: i,
        };

        const completeLogData = { partialResult, struct, batchRa };
        const logEntry = `${JSON.stringify(completeLogData, null, 2)}${i + batchSize < handleRaList.length ? ',' : ''}`;

        fs.appendFileSync(
          `logs/enrollment-duplicates-log-${date}.json`,
          logEntry,
        );

        app.log.info(partialResult);
      }
      fs.appendFileSync(`logs/enrollment-duplicates-log-${date}.json`, ']');

      const finalResult = partialResult;

      return reply.send(finalResult);
    },
  );
};

export default plugin;
