import { CommentModel } from '@/models/Comment.js';
import { ComponentModel } from '@/models/Component.js';
import { EnrollmentModel } from '@/models/Enrollment.js';
import { StudentModel } from '@/models/Student.js';
import { UserModel } from '@/models/User.js';
import { currentQuad } from '@next/common';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import type { PipelineStage } from 'mongoose';

type ComponentsStats = {
  teachers: number;
  subjects: number;
  totalAlunos: number;
  studentTotal: Array<{ total: number; _id: null }>;
};

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  const publicCache = app.cache();

  app.get('/summary', { logLevel: 'silent' }, async (request, reply) => {
    const cached = publicCache.get('summary');
    if (cached) {
      return cached;
    }

    const teacherAggregationQueryCount: PipelineStage.FacetPipelineStage[] = [
      {
        $group: {
          _id: null,
          teoria: { $addToSet: '$teoria' },
          pratica: { $addToSet: '$pratica' },
        },
      },
      { $project: { teachers: { $setUnion: ['$teoria', '$pratica'] } } },
      { $unwind: { path: '$teachers', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, total: { $sum: 1 } } },
      { $project: { _id: 0 } },
    ];
    const subjectsAggregationQueryCount: PipelineStage.FacetPipelineStage[] = [
      {
        $group: { _id: null, total: { $sum: 1 } },
      },
      { $project: { _id: 0 } },
    ];
    const isBeforeKick = await ComponentModel.countDocuments({
      before_kick: { $exists: true, $ne: [] },
      season: currentQuad(),
    });
    const dataKey = isBeforeKick ? '$before_kick' : '$alunos_matriculados';
    const studentAggregationQueryCount: PipelineStage.FacetPipelineStage[] = [
      {
        $unwind: dataKey,
      },
      { $group: { _id: null, alunos: { $addToSet: dataKey } } },
      { $unwind: '$alunos' },
      { $group: { _id: null, total: { $sum: 1 } } },
    ];
    const componentStatsFacetQuery = [
      {
        $facet: {
          teachers: teacherAggregationQueryCount,
          subjects: subjectsAggregationQueryCount,
          studentTotal: studentAggregationQueryCount,
        },
      },
      {
        $addFields: {
          teachers: { $ifNull: [{ $arrayElemAt: ['$teachers.total', 0] }, 0] },
          totalAlunos: {
            $ifNull: [{ $arrayElemAt: ['$totalAlunos.total', 0] }, 0],
          },
          subjects: { $ifNull: [{ $arrayElemAt: ['$subjects.total', 0] }, 0] },
        },
      },
    ];

    const [users, currentStudents, comments, enrollments, [componentStats]] =
      await Promise.all([
        UserModel.countDocuments({}),
        StudentModel.countDocuments({}),
        CommentModel.countDocuments({}),
        EnrollmentModel.countDocuments({
          conceito: { $in: ['A', 'B', 'C', 'D', '0', 'F'] },
        }),
        ComponentModel.aggregate<ComponentsStats>(componentStatsFacetQuery),
      ]);

    const [allStudents] = componentStats.studentTotal.map(({ total }) => total);
    const summary = {
      teachers: componentStats.teachers,
      studentTotal: allStudents,
      subjects: componentStats.subjects,
      users,
      currentStudents,
      comments,
      enrollments,
    };

    publicCache.set('usage', summary);

    return summary;
  });
};

export default plugin;
