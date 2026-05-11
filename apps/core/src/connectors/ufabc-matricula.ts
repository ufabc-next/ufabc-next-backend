import { BaseRequester } from './base-requester.ts';

export class UfabcMatriculaConnector extends BaseRequester {
  constructor() {
    super('https://matricula.ufabc.edu.br');
  }

  async validateToken(sessionId: string) {
    // TOOD: finish
  }
}
