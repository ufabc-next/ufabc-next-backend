import { CommentModel } from '@/models/Comment.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { UserModel } from '@/models/User.js';
import type { QueueNames } from '@/queue/types.js';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import { Types } from 'mongoose';
import { TeacherModel } from '@/models/Teacher.js';
import { ComponentModel } from '@/models/Component.js';

type EnrollmentDuplicatedDoc = {
  //sao apenas os campos do $push retornados pelo aggregator
  _id: Types.ObjectId;
  ra: string;
  disciplina: string;
  turma: string;
  year: number;
  quad: number;
  identifier: string;
  createdAt: Date;
  updatedAt: Date;
};

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
          type: z.enum(['quad', 'disciplina', 'all']).default('quad'),
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
      const effectiveType = type === 'all' ? 'disciplina' : type;

      const groupStrategies = {
        quad: { ra: '$ra', subject: '$subject', year: '$year', quad: '$quad' },
        disciplina: { ra: '$ra', year: '$year', quad: '$quad' },
      };

      const normalizeGroups = (groups) => {
        return groups.reduce((acc, group) => {
          const regexGroups = new Map();

          for (const doc of group.docs) {
            const normalized = normalizeText(doc.disciplina);
            let found = false;

            for (const [key, docs] of regexGroups.entries()) {
              const match = [
                key === normalized,
                new RegExp(escapeRegExp(key), 'i').test(normalized),
                new RegExp(
                  escapeRegExp(key)
                    .split(/\s+/)
                    .map((w) => `(?=.*${w})`)
                    .join(''),
                  'i',
                ).test(normalized),
                new RegExp(escapeRegExp(doc.disciplina), 'i').test(key),
              ].some(Boolean);

              if (match) {
                docs.push(doc);
                found = true;
                break;
              }
            }

            if (!found) regexGroups.set(normalized, [doc]);
          }

          const newGroups = Array.from(regexGroups.values())
            .filter((g) => g.length > 1)
            .map((g) => ({ _id: { ...group._id }, count: g.length, docs: g }));

          return acc.concat(newGroups);
        }, []);
      };

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
              ...(type === 'quad' ? { '_id.subject': { $ne: null } } : {}),
              ...(raList ? { '_id.ra': { $in: raList } } : {}),
            },
          },
        ];
        return await EnrollmentModel.aggregate(pipeline);
      };

      const processDuplicates = async (duplicates) => {
        const duplicatesToDelete = [];

        for (const group of duplicates) {
          const sorted = group.docs.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          );
          const commentDocs = await CommentModel.find({
            enrollment: { $in: sorted.map((doc) => doc._id) },
          }).select('enrollment');

          const commentSet = new Set(
            commentDocs.map((c) => c.enrollment.toString()),
          );

          const hasAny = sorted.some((doc) =>
            commentSet.has(doc._id.toString()),
          );
          const hasMixedSubject =
            sorted.some((d) => d.subject) && sorted.some((d) => !d.subject);
          const subjectTarget = hasMixedSubject
            ? sorted.find((d) => d.subject)?._id.toString()
            : null;

          if (!hasAny) {
            if (hasMixedSubject && subjectTarget) {
              duplicatesToDelete.push(
                ...sorted
                  .filter((d) => d._id.toString() !== subjectTarget)
                  .map((d) => d._id),
              );
            } else {
              duplicatesToDelete.push(...sorted.slice(1).map((d) => d._id));
            }
          } else {
            duplicatesToDelete.push(
              ...sorted
                .filter((d) => !commentSet.has(d._id.toString()))
                .map((d) => d._id),
            );
          }
        }

        return duplicatesToDelete;
      };

      const summarize = async (duplicatesToDelete, duplicates) => {
        const diff = await EnrollmentModel.find({
          _id: { $in: duplicatesToDelete },
        });
        const parsedDiff = diff.map((d) => ({
          _id: d._id,
          disciplina: d.disciplina,
          subject: d.subject,
        }));

        const oldImage = duplicates
          .flatMap((g) => g.docs)
          .map((d) => ({
            _id: d._id,
            disciplina: d.disciplina,
            subject: d.subject,
          }));
        const newImage = duplicates
          .flatMap((g) =>
            g.docs.filter((d) => !duplicatesToDelete.includes(d._id)),
          )
          .map((d) => ({
            _id: d._id,
            disciplina: d.disciplina,
            subject: d.subject,
          }));

        return { diff: parsedDiff, oldImage, newImage };
      };

      const handleRaList = ra ? [ra] : await EnrollmentModel.distinct('ra');

      let result = null;
      for (let i = 0; i < handleRaList.length; i += batchSize) {
        const batchRa = handleRaList.slice(i, i + batchSize);

        let duplicates = await fetchDuplicates(effectiveType, batchRa);
        if (effectiveType === 'disciplina')
          duplicates = normalizeGroups(duplicates);

        if (type === 'all') {
          const altDuplicates = await fetchDuplicates('quad', batchRa);
          const seen = new Set();
          const merged = [];

          for (const g of [...altDuplicates, ...duplicates]) {
            const unique = g.docs.filter((d) => {
              const id = d._id.toString();
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });

            if (unique.length > 1)
              merged.push({ ...g, docs: unique, count: unique.length });
          }

          duplicates = merged;
        }

        const duplicatesToDelete = await processDuplicates(duplicates);

        let struct = null;
        if (ra) struct = await summarize(duplicatesToDelete, duplicates);

        result = {
          ra,
          totalDuplicatesFound: duplicates.length,
          duplicatesToDelete: duplicatesToDelete.length,
          deletedCount: 0,
          type,
          struct,
        };

        if (duplicatesToDelete.length > 0 && !dryRun) {
          app.log.info(
            `Deleting ${duplicatesToDelete.length} duplicate enrollments (type: ${type})`,
          );
          const del = await EnrollmentModel.deleteMany({
            _id: { $in: duplicatesToDelete },
          });
          result.deletedCount = del.deletedCount ?? 0;
        }
        app.log.info(result);
      }
      return reply.send(result);
    },
  );
};

export default plugin;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
