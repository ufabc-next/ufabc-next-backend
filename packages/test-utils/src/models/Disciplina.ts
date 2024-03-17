import type { Disciplina, DisciplinaModel } from '../types';

export async function createDisciplina(
  disciplinaModel: DisciplinaModel,
  disciplina: Disciplina,
) {
  const createdDisciplina = await disciplinaModel.create(disciplina);
  return createdDisciplina;
}

export async function getDisciplinaByIdentifier(
  disciplinaModel: DisciplinaModel,
  identifier: string,
) {
  const disciplina = await disciplinaModel.findOne({ identifier });
  return disciplina;
}

export async function getDisciplinaByCodigo(
  disciplinaModel: DisciplinaModel,
  codigo: string,
) {
  const disciplina = await disciplinaModel.findOne({ codigo });
  return disciplina;
}
