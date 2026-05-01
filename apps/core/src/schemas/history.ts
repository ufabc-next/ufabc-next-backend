import type { FastifyZodOpenApiSchema } from 'fastify-zod-openapi';

import { z } from 'zod';
import 'zod-openapi/extend';

const SIG_RESULTS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'O',
  '-',
  '',
  '0',
  '--',
] as const;

const SIG_CATEGORIES = ['mandatory', 'limited', 'free'] as const;

const SIG_COMPONENTS_STATUS = [
  'APR',
  'APRN',
  'CANC',
  'DISP',
  'MATR',
  'REC',
  'REP',
  'REPF',
  'REPMF',
  'REPN',
  'REPNF',
  'TRANC',
  'TRANS',
  'INCORP',
  'CUMP',
  '',
] as const;

export type SigStatus = (typeof SIG_COMPONENTS_STATUS)[number];

const sigComponents = z.object({
  UFCode: z.string(),
  category: z.enum(SIG_CATEGORIES),
  class: z
    .string()
    .transform((val) => (val === '--' || val === '-' ? null : val)),
  credits: z.number().int(),
  grade: z.enum(SIG_RESULTS),
  name: z.string().toLowerCase(),
  status: z.enum(SIG_COMPONENTS_STATUS),
  year: z.string(),
  period: z.string(),
  teachers: z.string().array(),
});

const CAMPUS_ENUM = z.enum(['sa', 'sbc']);

const sigStudent = z.object({
  campus: CAMPUS_ENUM.optional(),
  shift: z.enum(['n', 'm']).transform((val) => (val === 'n' ? 'noturno' : 'matutino')),
  course: z
    .string()
    .toLowerCase()
    .transform((course) => {
      return course
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }),
  ra: z.coerce.number(),
  startedAt: z.string(),
  name: z.string(),
});

const sigCoefficients = z.object({
  ca: z.number(),
  cr: z.number(),
  cp: z.number(),
  caece: z.number(),
  caik: z.number(),
  cpece: z.number(),
  crece: z.number(),
  ik: z.number(),
  ikece: z.number(),
});

const sigGraduations = z.object({
  campus: CAMPUS_ENUM.optional(),
  course: z.string().toLowerCase(),
  grade: z.string().optional(),
  shift: z.enum(['n', 'm']),
  extensionCredits: z.number().transform((val) => Math.round(val)),
  totalCredits: z.number().transform((val) => Math.round(val)),
  freeCredits: z.number().transform((val) => Math.round(val)),
  mandatoryCredits: z.number().transform((val) => Math.round(val)),
  limitedCredits: z.number().transform((val) => Math.round(val)),
});

export const sigHistory = z.object({
  student: sigStudent,
  graduations: sigGraduations,
  coefficients: sigCoefficients,
  components: sigComponents.array(),
});

export const sigHistoryResponseSchema = z.object({
  student: z.object({
    ra: z.number(),
    course: z.string(),
    shift: z.enum(['morning', 'night']),
  }),
  graduations: z.object({
    course: z.string(),
    grade: z.string().optional(),
    mandatoryCredits: z.number(),
    freeCredits: z.number(),
    totalCredits: z.number(),
    limitedCredits: z.number(),
  }),
  coefficients: z.object({
    cp: z.number(),
    cr: z.number(),
    ca: z.number(),
    ik: z.number(),
  }),
  components: z.array(
    z.object({
      period: z.string(),
      UFCode: z.string(),
      name: z.string(),
      year: z.number(),
      credits: z.number(),
      category: z.enum(['free', 'mandatory', 'limited']),
      status: z.enum(SIG_COMPONENTS_STATUS),
      grade: z.string(),
      class: z.string(),
      teachers: z.array(z.string()),
    })
  ),
});

export type SigHistory = z.infer<typeof sigHistory>;

export const sigHistoryBodySchema = {
  tags: ['Sigaa'],
  body: z.object({
    login: z.string(),
    ra: z.coerce.number(),
  }),
} satisfies FastifyZodOpenApiSchema;