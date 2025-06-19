import { currentQuad } from '@next/common';
import { z } from 'zod';
import { COURSE_SHIFTS } from '@/models/Student.js';
import { CATEGORIES } from '@/models/History.js';
import type { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';

const tags = ['Students'];

const listMatriculaStudentSchema = z.object({
  studentId: z.number().int().nullish(),
  updatedAt: z.string().datetime(),
  graduations: z
    .object({
      courseId: z.number().int().nullish(),
      name: z.string(),
      cp: z.number().optional(),
      cr: z.number().optional(),
      ca: z.number().optional(),
      affinity: z.number().optional(),
      shift: z.enum(COURSE_SHIFTS),
    })
    .array(),
});

const updatedStudentSchema = z.object({
  ra: z.number(),
  studentId: z.number().nullish(),
  graduations: z
    .object({
      nome_curso: z.string(),
      cp: z.number(),
      cr: z.number(),
      ca: z.number(),
      ind_afinidade: z.number(),
      id_curso: z.number().int().optional(),
      turno: z.enum(COURSE_SHIFTS),
      components: z
        .object({
          periodo: z.string(),
          codigo: z.string(),
          disciplina: z.string(),
          ano: z.number().int(),
          situacao: z.string().nullable(),
          creditos: z.number().int(),
          categoria: z.enum(CATEGORIES),
          conceito: z.string(),
          turma: z.string(),
          teachers: z.string().array(),
        })
        .array(),
    })
    .array(),
});

export type UpdatedStudent = z.infer<typeof updatedStudentSchema>;

export type MatriculaStudent = z.infer<typeof listMatriculaStudentSchema>;

export const listStudentsStatsComponents = {
  tags,
  querystring: z.object({
    season: z.string().default(currentQuad()),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              studentsNumber: z.number().int(),
              componentsNumber: z.number().int(),
            })
            .array(),
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;

export const listStudentSchema = {
  tags,
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            studentId: z.number().int().nullish(),
            login: z.string(),
            updatedAt: z.string(),
            graduations: z
              .object({
                name: z.string(),
                courseId: z.number().nullish(),
                shift: z.string(),
                cp: z.number().nullish(),
                ca: z.number().nullish(),
                cr: z.number().nullish(),
                affinity: z.number(),
              })
              .array(),
          }),
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;

export const listMatriculaStudent = {
  tags,
  headers: z.object({
    uf_login: z.string().openapi({
      example: 'john.doe',
    }),
  }),
  querystring: z.object({
    ra: z.coerce.number(),
    login: z.string(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: listMatriculaStudentSchema,
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;

export const updateStudentSchema = {
  tags,
  body: z.object({
    ra: z.coerce.number().openapi({
      example: 112222332,
    }),
    login: z.string().openapi({
      example: 'john.doe',
    }),
    studentId: z.number().int().optional(),
    graduationId: z.number().int().optional(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: updatedStudentSchema,
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;

const rawSigStudentSchema = z.object({
  matricula: z.string(),
  email: z.string(),
  entrada: z.string().openapi({
    description: 'Quadrimestre de entrada',
    example: '2022:2',
  }),
  nivel: z.enum(['graduacao', 'licenciatura']),
  status: z.string(),
  curso: z.string(),
});

export type SigStudent = z.infer<typeof rawSigStudentSchema>;

const parsedSigStudentSchema = z.object({
  name: z.string(),
  ra: z.string(),
  login: z.string(),
  email: z.union([z.string(), z.undefined()]),
  graduations: z
    .object({
      course: z.string(),
      campus: z.string(),
      shift: z.string(),
    })
    .array(),
  startedAt: z.string(),
});

export type ParsedSigStudent = z.infer<typeof parsedSigStudentSchema>;

export const sigStudentSchema = {
  body: rawSigStudentSchema,
  headers: z.object({
    'view-state': z.string().nullish(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: parsedSigStudentSchema,
        },
      },
    },
  },
} satisfies FastifyZodOpenApiSchema;
