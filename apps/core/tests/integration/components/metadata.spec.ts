import { startTestStack, type TestStack } from '@next/testing/containers';
import { fastify, type FastifyInstance } from 'fastify';
import { fastifyPlugin as fp } from 'fastify-plugin';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';
import { AIProxyConnector } from '../../../src/connectors/ai-proxy.js';
import { ComponentMetadataModel } from '../../../src/models/ComponentMetadata.js';

describe('POST /v2/components/metadata', () => {
  let stack: TestStack;
  let app: FastifyInstance;
  const componentCode = 'COMP-123';
  const aiResponse = { answer: 'Mocked AI response' };

  beforeAll(async () => {
    if (!process.env.NEXT_AGENT_URL) {
      process.env.NEXT_AGENT_URL = 'http://ai-proxy.test';
    }

    stack = await startTestStack();
    app = fastify({ logger: false });

    await app.register(fp(buildApp), {
      config: { ...stack.config, NODE_ENV: 'test' },
    });

    await app.ready();
  });

  beforeEach(() => {
    vi.spyOn(AIProxyConnector.prototype, 'requestNaturalResponse').mockResolvedValue(
      aiResponse
    );
  });

  afterAll(async () => {
    await ComponentMetadataModel.deleteMany({
      'metadata.component_code': componentCode,
    });

    await app.close();
    await stack.stop();
  });

  it('should return 404 when component metadata is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v2/components/metadata',
      query: { season: '2026:2', componentId: 'MISSING-001' },
      payload: { userMessage: 'What is the schedule?' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Component not found');
  });

  it('should call AI proxy and return response for a known component', async () => {
    await ComponentMetadataModel.create({
      planejamento: {
        ementa: 'Test syllabus',
        objetivos: 'Test objectives',
        metodologia: 'Test method',
        avaliacao: 'Test evaluation',
      },
      cronograma: [],
      metadata: {
        source_file: 'test.pdf',
        processed_at: new Date().toISOString(),
        disciplina_id: 123,
        component_code: componentCode,
        component_data: {
          componentKey: componentCode,
          subjectKey: 'SUBJ-123',
          name: 'Test Component',
          credits: 4,
          ufComponentId: 123,
          ufComponentCode: componentCode,
          campus: 'sbc',
          shift: 'diurno',
          vacancies: 40,
          componentClass: 'A',
          season: '2026:2',
          ufClassroomCode: '1234',
          tpi: { theory: 2, practice: 2, individual: 0 },
          timetable: [],
          courses: [],
          teachers: [
            { name: 'Test Teacher', role: 'teoria', isSecondary: false },
          ],
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v2/components/metadata',
      query: { season: '2026:2', componentId: componentCode },
      payload: { userMessage: 'When is the exam?' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.data).toEqual(aiResponse);

    const aiSpy = vi.mocked(AIProxyConnector.prototype.requestNaturalResponse);
    expect(aiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ component_code: componentCode }),
      }),
      'When is the exam?'
    );
  });
});
