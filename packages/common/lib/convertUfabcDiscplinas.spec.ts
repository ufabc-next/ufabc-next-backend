import assert from 'node:assert/strict';
import { ofetch } from 'ofetch';
import { beforeEach, describe, it } from 'node:test';
import { pick as lodashPick } from 'lodash-es';
import {
  type Disciplina,
  convertUfabcDisciplinas,
} from './convertUfabcDiscplinas';

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
  let disciplinas: Disciplina[];
  const pick = ['disciplina', 'ideal_quad', 'turma', 'campus', 'turno'];
  beforeEach(async () => {
    disciplinas = await ofetch(
      'https://matricula.ufabc.edu.br/cache/todasDisciplinas.js',
      {
        parseResponse: valueToJson,
      },
    );
  });

  it('should parse everything correctly', () => {
    const parsedDisciplinas: any = disciplinas.map((disciplina) =>
      lodashPick(convertUfabcDisciplinas(disciplina), pick),
    );

    assert.ok(
      parsedDisciplinas?.every((disciplina: Disciplina) =>
        ['diurno', 'noturno', 'tarde'].includes(disciplina.turno!),
      ),
    );
    assert.ok(
      parsedDisciplinas.every((disciplina: Disciplina) =>
        ['sao bernardo', 'santo andre'].includes(disciplina.campus!),
      ),
    );
    assert.ok(
      parsedDisciplinas.every(
        (disciplina: Disciplina) =>
          disciplina.turma!.length > 0 && disciplina.turma!.length <= 3,
      ),
    );
  });
});
