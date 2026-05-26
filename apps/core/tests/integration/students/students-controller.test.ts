import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  syncStudent: vi.fn(),

  redisServiceGetJSON: vi.fn(),
  redisServiceSetJSON: vi.fn(),
}));

vi.mock('@/hooks/sigaa-session.js', () => ({
  sigaaSession: async (request: any) => {
    request.sigaaSession = {
      sessionId: request.headers['session-id'],
      viewId: request.headers['view-id'],
    };
  },
}));

vi.mock('../../../src/models/User.js', () => ({
  UserModel: {
    findOne: mocks.userFindOne,
  },
}));

vi.mock('@/connectors/UfabcParserConnector.js', () => ({
  UfabcParserConnector: vi.fn().mockImplementation(() => ({
    syncStudent: mocks.syncStudent,
  })),
}));

import { studentsController } from '../../../src/controllers/students-controller.ts';

describe('studentsController - POST /students/sigaa', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = Fastify().withTypeProvider<ZodTypeProvider>();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(sensible);

    app.addHook('onRequest', async (request: any) => {
      (request as any).redisService = {
        getJSON: mocks.redisServiceGetJSON,
        setJSON: mocks.redisServiceSetJSON,
      };
    });

    await app.register(studentsController);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('deve retornar erro quando não enviar session-id e view-id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/students/sigaa',
      payload: {
        ra: 123456,
        login: 'aluno',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('deve retornar 404 quando usuário não for encontrado', async () => {
    mocks.redisServiceGetJSON.mockResolvedValue({
      sessionId: 'session-fake',
      viewId: 'view-fake',
    });

    mocks.userFindOne.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/students/sigaa',
      headers: {
        'session-id': 'session-fake',
        'view-id': 'view-fake',
      },
      payload: {
        ra: 123456,
        login: 'aluno',
      },
    });

    expect(response.statusCode).toBe(404);

    expect(mocks.userFindOne).toHaveBeenCalledWith({
      email: 'aluno@aluno.ufabc.edu.br',
    });

    expect(mocks.syncStudent).not.toHaveBeenCalled();
  });
});