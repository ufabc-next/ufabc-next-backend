import { currentQuad } from '@next/common';
import { z } from 'zod';
import { COURSE_SHIFTS } from '@/models/Student.js';
import { CATEGORIES } from '@/models/History.js';

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
};

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
};

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
};

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
};
