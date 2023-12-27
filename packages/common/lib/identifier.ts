import { createHash } from 'node:crypto';
import { camelCase } from 'lodash-es';
import type { Disciplina } from '@next/models';

const DEFAULT_FIELDS_TO_ENCODE = [
  'disciplina',
  'turno',
  'campus',
  'turma',
] as const;

/**
 * Generates a unique identifier for a given disciplina
 * */
export function generateIdentifier(
  disciplina: Disciplina,
  keys = DEFAULT_FIELDS_TO_ENCODE,
) {
  const unorderedDisciplinas = keys.map((key) => String(disciplina[key]));
  const disciplinaToEncode = unorderedDisciplinas
    .map((disciplina) => camelCase(disciplina))
    .join('');

  return createHash('md5').update(disciplinaToEncode).digest('hex');
}
