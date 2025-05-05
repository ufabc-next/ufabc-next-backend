import type {
  ParsedSigStudent,
  SigStudent,
} from '@/schemas/entities/students.js';
import { logger } from '@/utils/logger.js';
import { ofetch } from 'ofetch';

export type UfabcParserComponent = {
  /** The id as we consume */
  UFComponentId: number;
  /** The code as we consume */
  UFComponentCode: string;
  campus: 'sbc' | 'sa';
  name: string;
  turma: string;
  turno: 'diurno' | 'noturno';
  credits: number;
  courses: Array<{
    name: string | '-';
    UFCourseId: number;
    category: 'limitada' | 'obrigatoria';
  }>;
  vacancies: number;
  hours: Record<string, { periodicity: string; classPeriod: string[] }>[];
};

type StudentRA = string;
export type StudentComponent = {
  code: string;
  name: string | null;
  errors: string[] | [];
};
export type UFProcessorEnrollment = Record<StudentRA, StudentComponent[]>;

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrolled = Record<ComponentId, StudentIds[]>;

export type UFProcessorComponentFile = {
  /** The id as we consume */
  UFComponentId: '-' | number;
  /** The code as we consume */
  UFComponentCode: string;
  campus: 'sbc' | 'sa';
  name: string;
  turma: string;
  turno: 'diurno' | 'noturno';
  credits: number;
  tpi: [number, number, number];
  enrolled: number[];
  vacancies: number;
  /** The courses that are available for this component */
  courses: Array<{
    name: string | '-';
  }>;
  teachers: {
    practice: string | null;
    secondaryPractice: string | null;
    professor: string | null;
    secondaryProfessor: string | null;
  };
  hours: Record<string, { periodicity: string; classPeriod: string[] }>[];
};

export const ufabcParserService = ofetch.create({
  baseURL: process.env.UFABC_PARSER_URL,
  timeout: 45 * 1000, // 45 seconds,
  onResponseError({ response, error }) {
    logger.error(
      {
        error,
        response,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        data: response._data,
      },
      'ufabc-parser',
      'ufabc-parser error',
    );
  },
  onRequestError({ request, error, response }) {
    logger.error(
      {
        error,
        request,
        response,
        status: response?.status,
        statusText: response?.statusText,
        url: response?.url,
        data: response?._data,
      },
      'ufabc-parser',
      'ufabc-parser error',
    );
  },
});

export async function getComponents() {
  const components =
    await ufabcParserService<UfabcParserComponent[]>('/components');
  return components;
}

export async function getEnrollments(link: string) {
  const enrollments = await ufabcParserService<UFProcessorEnrollment>(
    '/enrollments',
    {
      query: {
        link,
      },
    },
  );
  return enrollments;
}

export async function getEnrolledStudents() {
  const enrolled = await ufabcParserService<UFProcessorEnrolled>('/enrolled');
  return enrolled;
}

export async function getComponentsFile(link: string) {
  const componentsFile = await ufabcParserService<UFProcessorComponentFile[]>(
    '/componentsFile',
    {
      query: {
        link,
      },
    },
  );

  return componentsFile;
}

export async function getSigUser(sigStudent: SigStudent, sessionId: string) {
  const student = await ufabcParserService<{
    data: ParsedSigStudent | null;
    error: string | null;
  }>('/sig/me', {
    method: 'POST',
    headers: {
      sessionId,
    },
    query: {
      action: 'default',
    },
    body: sigStudent,
  });
  return student;
}

type FullStudentRequest = {
  student: ParsedSigStudent & { grade: string };
  action: string;
  viewState: string;
  sessionId: string;
};

export async function getFullStudent({
  student,
  action,
  viewState,
  sessionId,
}: FullStudentRequest) {
  const fullStudent = await ufabcParserService<{
    data: ParsedSigStudent | null;
    error: string | null;
  }>('/sig/grades', {
    method: 'POST',
    headers: {
      sessionId,
      viewState,
    },
    body: {
      student,
      action,
    },
  });
  return fullStudent;
}
