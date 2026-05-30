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
  userExists: vi.fn(),
  userRaHistoryCreate: vi.fn(),
  userRaHistoryFindOne: vi.fn(),

  syncStudent: vi.fn(),

  redisServiceGetJSON: vi.fn(),
  redisServiceSetJSON: vi.fn(),

  redisGet: vi.fn(),
  redisSet: vi.fn(),

  studentSyncFindOne: vi.fn(),
  studentSyncCreate: vi.fn(),
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
    exists: mocks.userExists,
  },
  UserRaHistoryModel: {
    create: mocks.userRaHistoryCreate,
    findOne: mocks.userRaHistoryFindOne,
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
      request.redisService = {
        getJSON: mocks.redisServiceGetJSON,
        setJSON: mocks.redisServiceSetJSON,
      };
    });

    app.decorate('redis', {
      get: mocks.redisGet,
      set: mocks.redisSet,
    });

    app.decorate('db', {
      StudentSync: {
        findOne: mocks.studentSyncFindOne,
        create: mocks.studentSyncCreate,
      },
    });

    app.decorate('config', {
      UFABC_PARSER_REQUESTER_KEY: 'requester-key-fake',
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

  it('deve atualizar o RA quando o RA mudou', async () => {
    const user = {
      _id: 'user-id-1',
      ra: 111111,
      save: vi.fn().mockResolvedValue(undefined),
    };

    mocks.redisServiceGetJSON.mockResolvedValue({
      sessionId: 'session-fake',
      viewId: 'view-fake',
    });

    mocks.userFindOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);

    mocks.userRaHistoryCreate.mockResolvedValue({});

    mocks.redisGet.mockResolvedValue('aluno');

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

    expect(response.statusCode).toBe(202);

    expect(mocks.userFindOne).toHaveBeenNthCalledWith(1, {
      email: 'aluno@aluno.ufabc.edu.br',
    });

    expect(mocks.userFindOne).toHaveBeenNthCalledWith(2, {
      ra: 123456,
      _id: { $ne: 'user-id-1' },
    });

    expect(mocks.userRaHistoryCreate).toHaveBeenCalledWith({
      userId: 'user-id-1',
      oldRa: '111111',
      newRa: '123456',
    });

    expect(user.ra).toBe(123456);
    expect(user.save).toHaveBeenCalled();

    expect(mocks.redisGet).toHaveBeenCalledWith('http:students:sigaa:123456');

    expect(mocks.syncStudent).not.toHaveBeenCalled();
  });

  it('deve não atualizar o RA quando o RA não mudou', async () => {
    const user = {
      _id: 'user-id-1',
      ra: 123456,
      save: vi.fn().mockResolvedValue(undefined),
    };

    mocks.redisServiceGetJSON.mockResolvedValue({
      sessionId: 'session-fake',
      viewId: 'view-fake',
    });

    mocks.userFindOne.mockResolvedValue(user);

    mocks.redisGet.mockResolvedValue('aluno');

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

    expect(response.statusCode).toBe(202);

    expect(mocks.userFindOne).toHaveBeenCalledTimes(1);

    expect(mocks.userFindOne).toHaveBeenCalledWith({
      email: 'aluno@aluno.ufabc.edu.br',
    });

    expect(mocks.userRaHistoryCreate).not.toHaveBeenCalled();

    expect(user.ra).toBe(123456);
    expect(user.save).not.toHaveBeenCalled();

    expect(mocks.redisGet).toHaveBeenCalledWith('http:students:sigaa:123456');

    expect(mocks.syncStudent).not.toHaveBeenCalled();
  });

  it('deve bloquear quando o RA foi sincronizado em outro usuário recentemente', async () => {
    const user = {
      _id: 'user-id-1',
      ra: 111111,
      save: vi.fn().mockResolvedValue(undefined),
    };

    const userWithSameRa = {
      _id: 'user-id-2',
      ra: 123456,
      save: vi.fn().mockResolvedValue(undefined),
    };

    const lastRaChange = {
      userId: 'user-id-2',
      oldRa: '123456',
      newRa: '999999',
      createdAt: new Date(),
    };

    const sortMock = vi.fn().mockResolvedValue(lastRaChange);

    mocks.redisServiceGetJSON.mockResolvedValue({
      sessionId: 'session-fake',
      viewId: 'view-fake',
    });

    mocks.userFindOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(userWithSameRa);

    mocks.userRaHistoryFindOne.mockReturnValue({
      sort: sortMock,
    });

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

    console.log('STATUS:', response.statusCode);
    console.log('BODY:', response.body);

    expect(response.statusCode).toBe(409);

    expect(response.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message:
        'Este RA já foi alterado recentemente para outro usuário. A reatribuição automática foi bloqueada.',
    });

    expect(mocks.userFindOne).toHaveBeenNthCalledWith(1, {
      email: 'aluno@aluno.ufabc.edu.br',
    });

    expect(mocks.userFindOne).toHaveBeenNthCalledWith(2, {
      ra: 123456,
      _id: { $ne: 'user-id-1' },
    });

    expect(mocks.userRaHistoryFindOne).toHaveBeenCalledWith({
      userId: 'user-id-2',
      $or: [{ oldRa: '123456' }, { newRa: '123456' }],
    });

    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });

    expect(mocks.userRaHistoryCreate).not.toHaveBeenCalled();

    expect(user.ra).toBe(111111);
    expect(user.save).not.toHaveBeenCalled();

    expect(userWithSameRa.ra).toBe(123456);
    expect(userWithSameRa.save).not.toHaveBeenCalled();

    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.syncStudent).not.toHaveBeenCalled();
  });
});