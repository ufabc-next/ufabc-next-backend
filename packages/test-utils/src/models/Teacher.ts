import type { Teacher, TeacherModel } from '../types';

export async function createTeacher(
  teacherModel: TeacherModel,
  teacher: Teacher,
) {
  const createdTeacher = await teacherModel.create(teacher);
  return createdTeacher;
}

export async function getTeacherById(teacherModel: TeacherModel, id: string) {
  const teacher = await teacherModel.findOne({ _id: id });
  return teacher;
}

export async function getTeacherByName(
  teacherModel: TeacherModel,
  name: string,
) {
  const teacher = await teacherModel.findOne({ name });
  return teacher;
}
