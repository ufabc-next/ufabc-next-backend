import { ofetch } from 'ofetch';

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

type TPI = {
  theory: number;
  practice: number;
  individual: number;
};

export type UfabcParserComponent = {
  UFComponentId: number;
  UFComponentCode: string;
  name: string;
  campus: 'sa' | 'sbc';
  class: string;
  shift: 'morning' | 'night';
  credits: number;
  vacancies: number;
  courses: Array<{
    category: 'limited' | 'mandatory';
    UFCourseId: number;
    name: string;
  }>;
  hours: ComponentHours;
  tpi: TPI;
  season: string;
  teachers: {
    professor: string | undefined;
    practice: string | undefined;
    secondaryProfessor: string | undefined;
    secondaryPractice: string | undefined;
  };
};

type StudentRA = string;
export type StudentComponent = {
  code: string;
  name: string | null;
  errors: string[] | [];
};
export type UfabcParserEnrollment = Record<StudentRA, StudentComponent[]>;

type ComponentId = number;
type StudentIds = number;
export type UfabcParserEnrolled = Record<ComponentId, StudentIds[]>;

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
});

export async function getComponents() {
  const components =
    await ufabcParserService<UfabcParserComponent[]>('/v2/components');
  return components;
}

export async function getEnrollments(
  kind: 'settlement' | 'resettlement',
  season: string,
) {
  const enrollments = await ufabcParserService<UfabcParserEnrollment>(
    '/enrollments',
    {
      query: {
        kind,
        granted: true,
        season,
      },
    },
  );
  return enrollments;
}

export async function getEnrolledStudents() {
  const enrolled = await ufabcParserService<UfabcParserEnrolled>('/enrolled');
  return enrolled;
}

/**
 * @deprecated
 */
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
