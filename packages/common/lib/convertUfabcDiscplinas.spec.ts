import assert from 'node:assert/strict';
import { ofetch } from 'ofetch';
import { beforeEach, describe, it } from 'node:test';
import { pick as lodashPick } from 'lodash-es';
import { convertUfabcDisciplinas } from './convertUfabcDiscplinas';
import { logger } from './logger';

const valueToJson = (payload: string, max?: number) => {
  const parts = payload.split('=');
  if (parts.length < 2) {
    return [];
  }

  const jsonStr = parts[1]?.split(';')[0];
  const json = JSON.parse(jsonStr!) as number[];
  if (max) {
    return json.slice(0, max);
  }
  return json;
};

describe('common.lib.convertUfabcDisciplinas', () => {
  let disciplinas: any;
  const pick = ['disciplina', 'ideal_quad', 'turma', 'campus', 'turno'];
  beforeEach(async () => {
    disciplinas = await ofetch<any[]>(
      'https://matricula.ufabc.edu.br/cache/todasDisciplinas.js',
      {
        parseResponse: valueToJson,
      },
    );
  });

  it('should parse everything correctly', () => {
    const parsedDisciplinas = disciplinas.map((disciplina: any) =>
      lodashPick(convertUfabcDisciplinas(disciplina), pick),
    );
    logger.info(parsedDisciplinas.every((d) => d));
    assert(
      parsedDisciplinas.every((d) =>
        ['sao bernardo', 'santo andre'].includes(d.campus),
      ),
    );
    // assert(resp.every((r) => r.turma.length > 0 && r.turma.length <= 3));
  });
});
