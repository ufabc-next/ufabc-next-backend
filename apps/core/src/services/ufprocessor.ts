import { Config } from '@/config/config.js';
import { ofetch } from 'ofetch';

export type UFProcessorComponent = {
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
    category: 'limitada' | 'obrigatoria' | 'livre';
  }>;
  vacancies: number;
  hours: Record<string, { periodicity: string; classPeriod: string[] }>[];
};

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

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrollment = Record<ComponentId, StudentIds[]>;

class UFProcessor {
  private readonly baseURL = Config.UF_PROCESSOR_URL;
  private readonly request: typeof ofetch;

  constructor() {
    this.request = ofetch.create({
      baseURL: this.baseURL,
      async onRequestError({ error }) {
        console.error('[PROCESSORS] Request error', {
          error: error.name,
          info: error.cause,
        });
        error.message = `[PROCESSORS] Request error: ${error.message}`;
        throw error;
      },
      async onResponseError({ error }) {
        if (!error) {
          return;
        }

        console.error('[PROCESSORS] Request error', {
          error: error.name,
          info: error.cause,
        });
        error.message = `[PROCESSORS] Request error: ${error.message}`;
        throw error;
      },
    });
  }
  async getComponents(link: string) {
    if (link) {
      const componentsWithTeachers = await this.request<
        UFProcessorComponentFile[]
      >('/components', {
        query: {
          link,
        },
      });
      return componentsWithTeachers;
    }

    const components =
      await this.request<UFProcessorComponent[]>('/components');
    return components;
  }

  async getEnrolledStudents() {
    const enrollments = await this.request<UFProcessorEnrollment>('/enrolled');
    return enrollments;
  }
}

export const ufProcessor = new UFProcessor();
