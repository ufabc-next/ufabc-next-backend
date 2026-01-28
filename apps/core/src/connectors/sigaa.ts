import { BaseRequester } from './base-requester.js';

export class SigaaConnector extends BaseRequester {
  constructor(globalTraceId?: string) {
    super('https://sig.ufabc.edu.br', globalTraceId);
  }

  async validateToken(sessionId: string) {
    const headers = new Headers();
    headers.set('Cookie', `JSESSIONID=${sessionId}`);
    const response = await this.request<string>('/sigaa/verMenuPrincipal.do', {
      headers,
    });
    return response;
  }
}
