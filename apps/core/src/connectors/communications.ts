import { BaseRequester } from './base-requester.js';

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrolled = Record<ComponentId, StudentIds[]>;

export type UfabcParserComponent = {
  /** The id as we consume */
  UFComponentId: number;
  /** The code as we consume */
  UFComponentCode: string;
  UFClassroomCode: string;
  rawTPI: [number, number, number];
  campus: 'sbc' | 'sa';
  name: string;
  class: string;
  shift: 'morning' | 'night';
  credits: number;
  courses: Array<{
    name: string | '-';
    UFCourseId: number;
    category: 'limited' | 'mandatory';
  }>;
  vacancies: number;
  hours: Record<string, { periodicity: string; classPeriod: string[] }>[];
  tpi: {
    theory: number;
    practice: number;
    individual: number;
  } | null;
};

export class CommunicationsConnector extends BaseRequester {
  constructor(globalTraceId?: string) {
    super(process.env.COMMUNICATIONS_URL, globalTraceId);
  }

  async sendLinkToValidate(
    link: string,
    disciplina_id: string
  ): Promise<unknown> {

    console.log('Sending link to validate:', { link, disciplina_id });
    const response = await this.request<unknown>('groups/validate-link', {
      method: 'POST',
      body: { link, disciplina_id },
    });

    return response;
  }
}
