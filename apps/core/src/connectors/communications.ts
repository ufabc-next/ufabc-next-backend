import { BaseRequester } from './base-requester.js';

type ComponentId = number;
type StudentIds = number;
export type UFProcessorEnrolled = Record<ComponentId, StudentIds[]>;


export class CommunicationsConnector extends BaseRequester {
  constructor(globalTraceId?: string) {
    super(process.env.COMMUNICATIONS_URL, globalTraceId);
  }

  async sendLinkToValidate(
    link: string,
    componentId: string
  ): Promise<unknown> {

    const response = await this.request<unknown>('groups/validate-link', {
      method: 'POST',
      body: { link, disciplina_id: componentId },
    });

    return response;
  }
}
