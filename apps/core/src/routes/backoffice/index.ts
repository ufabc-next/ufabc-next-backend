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
        }),
        body: z.object({
          dryRun: z.boolean().default(true),
        }),
      },
      // preHandler: (request, reply) => request.isAdmin(reply),
    },
    async (request, reply) => {
      const { ra } = request.query;
      let { type } = request.query;

      const { dryRun } = request.body;

      const groupStrategies = {
        quad: {
          ra: '$ra',
          subject: '$subject',
          year: '$year',
          quad: '$quad',
        },
        disciplina: {
          ra: '$ra',
          year: '$year',
          quad: '$quad',
        },
        all: {},
      };

      const duplicatesQuery = (type: keyof typeof groupStrategies) => [
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
            ...(ra ? { '_id.ra': ra } : {}),
          },
        },
      ];

      let duplicates1: any[] = [];

      if (type === 'all') {
        type = 'disciplina';
        duplicates1 = await EnrollmentModel.aggregate(duplicatesQuery('quad'));
      }

      // For disciplina type, add additional processing
      let duplicates = await EnrollmentModel.aggregate(duplicatesQuery(type));

      if (type === 'disciplina') {
        duplicates = duplicates.reduce((acc, group) => {
          const regexGroups = new Map();

          for (const doc of group.docs) {
            const normalizedDisciplina = normalizeText(doc.disciplina);
            let foundMatch = false;

            for (const [key, existingDocs] of regexGroups.entries()) {
              // Try all matching patterns
              const isMatch = [
                // Exact match after normalization
                key === normalizedDisciplina,
                // Partial match case insensitive
                new RegExp(key, 'i').test(normalizedDisciplina),
                // Word-by-word match
                new RegExp(
                  key
                    .split(/\s+/)
                    .map((word: string) => `(?=.*${word})`)
                    .join(''),
                  'i',
                ).test(normalizedDisciplina),
                // Original disciplina name match
                new RegExp(doc.disciplina, 'i').test(key),
              ].some(Boolean);

              if (isMatch) {
                existingDocs.push(doc);
                foundMatch = true;
                break;
              }
            }

            if (!foundMatch) {
              regexGroups.set(normalizedDisciplina, [doc]);
            }
          }

          const newGroups = Array.from(regexGroups.values())
            .filter((docs) => docs.length > 1)
            .map((docs) => ({
              _id: { ...group._id },
              count: docs.length,
              docs: docs,
            }));

          return [...acc, ...newGroups];
        }, []);
      }

      if (duplicates1.length > 0) {
        const seenIds = new Set<string>();
        const mergedGroups = [];

        for (const group of [...duplicates1, ...duplicates]) {
          const uniqueDocs = group.docs.filter((doc: any) => {
            const key = doc._id.toString();
            if (seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
          });

          if (uniqueDocs.length > 1) {
            mergedGroups.push({
              ...group,
              docs: uniqueDocs,
              count: uniqueDocs.length,
            });
          }
        }

        duplicates = mergedGroups;
      }

      const duplicatesToDelete: Types.ObjectId[] = [];

      for (const group of duplicates) {
        const sortedDocs = group.docs.sort(
          (a: EnrollmentDuplicatedDoc, b: EnrollmentDuplicatedDoc) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        const commentsMap = new Map<string, boolean>();
        for (const doc of sortedDocs) {
          const hasComments = await CommentModel.exists({
            enrollment: doc._id,
          });
          commentsMap.set(doc._id.toString(), hasComments !== null);
        }

        const hasAnyComments = Array.from(commentsMap.values()).some(Boolean);

        const hasMixedSubject =
          sortedDocs.some((doc) => doc.subject) &&
          sortedDocs.some((doc) => !doc.subject);

        const subjectTarget = hasMixedSubject
          ? sortedDocs.find((doc) => doc.subject)?._id.toString() ?? null
          : null;

        if (!hasAnyComments) {
          if (hasMixedSubject && subjectTarget) {
            const parsedSortedDocs = sortedDocs
              .filter((doc) => doc._id.toString() !== subjectTarget)
              .map((doc) => doc._id);
            duplicatesToDelete.push(...parsedSortedDocs);
          } else {
            duplicatesToDelete.push(
              ...sortedDocs.slice(1).map((doc) => doc._id),
            );
          }
        } else {
          for (const doc of sortedDocs) {
            if (!commentsMap.get(doc._id.toString())) {
              duplicatesToDelete.push(doc._id);
            }
          }
        }
      }

      let struct = null;
      if (ra) {
        const oldImage = duplicates.map((group) => group.docs);

        const newImage: any[] = [];

        duplicates.forEach((group) => {
          const filteredGroup: any[] = group.docs.filter(
            (doc: EnrollmentDuplicatedDoc) => {
              return duplicatesToDelete.indexOf(doc._id) < 0;
            },
          );

          if (filteredGroup.length > 0) {
            newImage.push(filteredGroup);
          }
        });

        const diff: any[] = [];

        for (const enrollmentId of duplicatesToDelete) {
          const enrollment = await EnrollmentModel.findById(enrollmentId);
          diff.push(enrollment);
        }

        const parsedDiff = diff.map((enrollment) => {
          return {
            _id: enrollment._id,
            disciplina: enrollment.disciplina,
            subject: enrollment.subject,
            // turma: enrollment.turma,
            // year: enrollment.year,
            // quad: enrollment.quad,
            // identifier: enrollment.identifier,
            // createdAt: enrollment.createdAt,
            // updatedAt: enrollment.updatedAt
          };
        });

        const oldImage1 = oldImage.flat();
        const newImage1 = newImage.flat();

        const parsedOldImage = oldImage1.map((enrollment) => ({
          _id: enrollment._id,
          disciplina: enrollment.disciplina,
          subject: enrollment.subject,
        }));
        const parsedNewImage = newImage1.map((enrollment) => ({
          _id: enrollment._id,
          disciplina: enrollment.disciplina,
          subject: enrollment.subject,
        }));

        struct = {
          ra,
          diff: parsedDiff,
          oldImage: parsedOldImage,
          newImage: parsedNewImage,
          //allEnrollments
        };
      }

      const result = {
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
        const deleteResult = await EnrollmentModel.deleteMany({
          _id: { $in: duplicatesToDelete },
        });
        result.deletedCount = deleteResult.deletedCount ?? 0;
      }

      return reply.send(result);
    },
  );

  app.post(
    '/removeTeacher',
    {
      schema: {
        body: z.object({
          teacherIdList: z.array(z.string()),
        }),
      },
    },
    async (request, reply) => {
      const { teacherIdList } = request.body;

      for (const teacherId of teacherIdList) {
        const parsedTeacherId = new Types.ObjectId(teacherId);

        const r1 = await EnrollmentModel.updateMany(
          { teoria: parsedTeacherId },
          { $set: { teoria: null } },
        );
        const r2 = await EnrollmentModel.updateMany(
          { pratica: parsedTeacherId },
          { $set: { pratica: null } },
        );

        const r3 = await ComponentModel.updateMany(
          { teoria: parsedTeacherId },
          { $set: { teoria: null } },
        );
        const r4 = await ComponentModel.updateMany(
          { pratica: parsedTeacherId },
          { $set: { pratica: null } },
        );

        const r5 = await TeacherModel.findByIdAndDelete(teacherId);

        const r6 = await CommentModel.deleteMany({ teacher: parsedTeacherId });

        const logs = {
          r1,
          r2,
          r3,
          r4,
          r5,
          r6,
        };

        app.log.info(logs);
      }
      return reply.status(200);
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
