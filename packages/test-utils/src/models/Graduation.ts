import type { Graduation, GraduationModel } from '../types';

export async function createGraduation(
  graduationModel: GraduationModel,
  graduation: Graduation,
) {
  const createdGraduation = await graduationModel.create(graduation);
  return createdGraduation;
}

export async function getGraduationByID(
  graduationModel: GraduationModel,
  id: string,
) {
  const graduation = await graduationModel.findOne({ _id: id });
  return graduation;
}
