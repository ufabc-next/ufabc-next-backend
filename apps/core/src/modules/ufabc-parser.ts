import { ofetch } from 'ofetch';
import { logger } from '@/utils/logger.js';
import { sigHistory, type SigHistory } from '@/schemas/history.js';

type BrDays = 'segunda' | 'terça' | 'quarta' | 'quinta' | 'sexta' | 'sábado';

type ComponentSchedule = {
  day: BrDays | 'bado'; // 'bado' is a mistake in the original code, should be 'sabado';
  room: string;
  endTime: string;
  startTime: string;
  unparsed: string;
  frequency: 'semanal' | 'quinzenal I' | 'quinzenal II';
};

type Weekdays =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

type ComponentHours = {
  [key in Weekdays]?: {
    periodicity: 'weekly' | 'biweekly';
    classPeriod: string[];
  };
};

export type UfabcParserComponent = {
  /** The id as we consume */
  name: string;
  UFComponentId: number;
  UFComponentCode: string;
  UFClassroomCode: string;
  campus: 'sbc' | 'sa';
  class: string;
  classroom: string | null;
  shift: 'morning' | 'night';
  tenantId: number;
  season: string;
  year: number;
  quad: '1' | '2' | '3';
  vacancies: number;
  subjectId: string;
  credits: number;
  courses: Array<{
    UFCourseId: number;
    category: 'mandatory' | 'limited';
  }>;
  hours: ComponentHours;
  schedules: {
    theory: ComponentSchedule[];
    practice: ComponentSchedule[];
  };
  tpi: {
    theory: number;
    practice: number;
    individual: number;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  turma: string;
  turno: 'morning' | 'night';
  teachers: {
    professor: string | null;
    practice: string | null;
    secondaryPractice: string | null;
    secondaryProfessor: string | null;
  };
};

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrolled = Record<ComponentId, StudentIds[]>;

type EnrollmentProfessor = {
  name: string;
  email: string | null;
  role: 'professor' | 'practice' | 'secondaryProfessor' | 'secondaryPractice';
  isSecondary: boolean;
};

type UfabcParserEnrollment = {
  id: number;
  name: string;
  code: string;
  campus: 'sbc' | 'sa';
  class: string;
  credits: number;
  shift: 'morning' | 'night';
  hours: [string, string];
  season: string;
  schedules: {
    theory: ComponentSchedule[];
    practice: ComponentSchedule[];
  };
  professors: {
    main: EnrollmentProfessor;
    practice: EnrollmentProfessor | [];
    secondaryPractice: EnrollmentProfessor | [];
  };
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

export async function getHistory(sessionId: string, viewState: string) {
  const rawHistory = await ufabcParserService<{
    data: SigHistory | null;
    error: string | null;
  }>('/sig/history', {
    method: 'POST',
    headers: {
      sessionId,
      viewState,
    },
    query: {
      action: 'history',
    },
  });

  const parsedHistory = sigHistory.safeParse(rawHistory.data);

  return parsedHistory;
}

export async function getComponents(season: string) {
  const components = await ufabcParserService<{
    data: UfabcParserComponent[];
    total: number;
  }>('/v2/matriculas/components/non-paginated', {
    query: {
      tenant: season,
    },
  });
  return components;
}

export async function getEnrolledStudents() {
  const enrolled = await ufabcParserService<UFProcessorEnrolled>('/enrolled');
  return enrolled;
}

export async function getStudentEnrollments(email: string, season: string) {
  const studentEnrollments = await ufabcParserService<{
    data: UfabcParserEnrollment[];
    total: number;
  }>(`/v2/matriculas/classes/${email}`, {
    query: {
      season,
    },
  });

  return studentEnrollments;
}
