import { CommentModel } from '@/models/Comment.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { UserModel } from '@/models/User.js';
import type { QueueNames } from '@/queue/types.js';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import type { Types } from 'mongoose';

type EnrollmentDuplicatedDoc = { //sao apenas os campos do $push retornados pelo aggregator
  _id: Types.ObjectId;
  ra: string;
  disciplina: string;
  turma: string;
  season: string;
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
          type: z.enum(['season', 'quad', 'disciplina']).default('season'),
        }),
        body: z.object({
          dryRun: z.boolean().default(true),
        }),
      },
      // preHandler: (request, reply) => request.isAdmin(reply),
    },
    async (request, reply) => {
      const { ra, type } = request.query;
      const { dryRun } = request.body;

      const groupStrategies = {
        season: {
          ra: '$ra',
          season: '$season',
          subject: '$subject',
          year: '$year',
          quad: '$quad',
        },
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
      };

      const duplicatesQuery = [
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
            ...(ra ? { '_id.ra': ra } : {}),
          },
        },
      ];

      // For disciplina type, add additional processing
      let duplicates = await EnrollmentModel.aggregate(duplicatesQuery);

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

      const duplicatesToDelete: Types.ObjectId[] = [];

      for (const group of duplicates) {
        const sortedDocs = group.docs.sort(
          (a: EnrollmentDuplicatedDoc, b: EnrollmentDuplicatedDoc) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const commentsMap = new Map();
        for (const doc of sortedDocs) {
          const hasComments = await CommentModel.exists({
            enrollment: doc._id,
          });
          commentsMap.set(doc._id.toString(), hasComments !== null);
        }

        const hasAnyComments = Array.from(commentsMap.values()).some(Boolean);

        if (!hasAnyComments) {
          duplicatesToDelete.push(...sortedDocs.slice(1).map((doc: EnrollmentDuplicatedDoc) => doc._id));
        } else {
          sortedDocs.forEach((doc: EnrollmentDuplicatedDoc) => {
            if (!commentsMap.get(doc._id.toString())) {
              duplicatesToDelete.push(doc._id);
            }
          });
        }
      }

//fazer backup de prod com as duplicatas antes de rodar tudo!

      let diff = null
      if (ra) {

        const oldImage = duplicates.map((group) => group.docs)

        const newImage: any[] = [];

        duplicates.forEach((group) => {
          const filteredGroup: any[] = group.docs.filter((doc: EnrollmentDuplicatedDoc) => {
            return duplicatesToDelete.indexOf(doc._id) < 0
          })

          if (filteredGroup.length > 0){
            newImage.push(filteredGroup);
          }})

        diff = {
          ra,
          oldImage,
          newImage,
          //allEnrollments
        }
      }

      const result = {
        totalDuplicatesFound: duplicates.length,
        duplicatesToDelete: duplicatesToDelete.length,
        deletedCount: 0,
        type,
        diff
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

  app.get("/strategy/contains", async (_, reply)=> { //checar se os casos do type "season" ja sao cobertos pelo caso "quad" R: true

    const groupStrategies = {
      season: {
        ra: '$ra',
        season: '$season',
        subject: '$subject',
        year: '$year',
        quad: '$quad',
      },
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
    ]

  const seasonGroups = await EnrollmentModel.aggregate(duplicatesQuery("season"));
  
  const quadGroups = await EnrollmentModel.aggregate(duplicatesQuery("quad"));
  
  const quadKeys = new Set(
    quadGroups.map((g) => JSON.stringify(g._id))
  );
  
  const allSeasonInsideQuad = seasonGroups.every((group) => {
    const quadEquivalentKey = {
      ra: group._id.ra,
      subject: group._id.subject,
      year: group._id.year,
      quad: group._id.quad,
    };
    return quadKeys.has(JSON.stringify(quadEquivalentKey));
  });
  
  reply.send(allSeasonInsideQuad); // true se todos season-groups têm correspondente em quad
  
  })
};

export default plugin;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
