import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { studentsController } from '../../../src/controllers/students-controller.ts';

describe('studentsController - POST /students/sigaa', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify().withTypeProvider<ZodTypeProvider>();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

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

    console.log('STATUS:', response.statusCode);
    console.log('BODY:', response.body);

    expect(response.statusCode).toBe(400);
  });
});