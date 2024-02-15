import { generateRandomName, generateRandomNumberInRange } from '../utils';
import type { Subject, SubjectModel } from '../types';

export async function createSubject(
  subjectModel: SubjectModel,
  subject?: Subject,
) {
  const createdSubject = await subjectModel.create(
    subject || {
      name: generateRandomName(),
      search: generateRandomName(),
      creditos: generateRandomNumberInRange(2, 6),
    },
  );
  return createdSubject;
}

export async function getSubjectById(subjectModel: SubjectModel, id: string) {
  const subject = await subjectModel.findOne({ _id: id });
  return subject;
}

export async function getSubjectByName(
  subjectModel: SubjectModel,
  name: string,
) {
  const subject = await subjectModel.findOne({ name });
  return subject;
}
