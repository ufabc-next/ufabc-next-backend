import { ComponentModel } from '@/models/Component.js';
import { SubjectModel } from '@/models/Subject.js';
import {
  getComponents,
  type UfabcParserComponent,
} from '@/modules/ufabc-parser.js';
import { currentQuad, generateIdentifier } from '@next/common';
import { camelCase, startCase } from 'lodash-es';
import type { QueueContext } from '../types.js';
import { TeacherModel } from '@/models/Teacher.js';

type ParserComponent = Awaited<ReturnType<typeof getComponents>>[number];

export async function syncComponents({ app }: QueueContext<unknown>) {
  const tenant = currentQuad();
  const parserComponents = await getComponents();

  if (!parserComponents) {
    app.log.error({ parserComponents }, 'Error receiving components');
    throw new Error('Could not get components');
  }

  const componentsJobsPromises = parserComponents.map(async (component) => {
    try {
      await app.job.dispatch('ProcessSingleComponent', {
        component,
        tenant,
      });
    } catch (error) {
      app.log.error({
        error: error instanceof Error ? error.message : String(error),
        component: component.name,
        msg: 'Failed to dispatch component processing job',
      });
      throw error;
    }
  });

  await Promise.all(componentsJobsPromises);
}

export async function processComponent({
  app,
  job,
}: QueueContext<{
  component: ParserComponent;
  tenant: string;
}>) {
  if (!job.data.tenant || !job.data.component) {
    app.log.info('Discarding job with useless data');
    return;
  }
  const { component, tenant } = job.data;
  const [year, quad] = tenant.split(':').map(Number);

  try {
    const subject = await processSubject(component);
    const teachers = await processTeachers(component.teachers);

    const dbComponent = {
      codigo: component.UFComponentCode,
      disciplina_id: component.UFComponentId,
      campus: component.campus,
      disciplina: component.name,
      season: tenant,
      turma: component.class,
      turno:
        component.shift === 'morning'
          ? 'diurno'
          : ('noturno' as 'diurno' | 'noturno'),
      vagas: component.vacancies,
      ideal_quad: false,
      quad,
      year,
      subject: subject._id,
      obrigatorias: component.courses
        .filter((c) => c.category === 'mandatory')
        .map((c) => c.UFCourseId),
      identifier: '',
      teoria: teachers.teoria ?? teachers.secondaryTeoria,
      pratica: teachers.pratica ?? teachers.secondaryPratica,
    };

    dbComponent.identifier = generateIdentifier(dbComponent, [
      'disciplina',
      'turno',
      'campus',
      'turma',
    ]);

    app.log.debug(dbComponent, 'Generated component');

    const result = await ComponentModel.findOneAndUpdate(
      {
        season: tenant,
        identifier: dbComponent.identifier,
        disciplina_id: component.UFComponentId,
      },
      {
        $set: {
          ...dbComponent,
        },
        $setOnInsert: {
          alunos_matriculados: [],
          after_kick: [],
          before_kick: [],
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    app.log.debug({
      msg: 'Component processed successfully',
      identifier: dbComponent.identifier,
      id: result._id,
      action: result.isNew ? 'inserted' : 'updated',
    });
  } catch (error) {
    app.log.error({
      info: job.data,
      msg: 'Error processing component',
      error: error instanceof Error ? error.message : String(error),
      component: component.name,
    });

    throw error;
  }
}

async function processSubject(component: ParserComponent) {
  try {
    const existingSubjects = await SubjectModel.find({});
    const matchedSubject = existingSubjects.find(
      (subject) => subject.name.toLowerCase() === component.name,
    );
    if (matchedSubject) {
      matchedSubject.creditos = component.credits;
      matchedSubject.search = startCase(camelCase(component.name));
      await matchedSubject.save();
      return matchedSubject;
    }
    // Use findOneAndUpdate instead of separate find and update operations
    const newSubject = await SubjectModel.create({
      name: component.name,
      creditos: component.credits,
      search: startCase(camelCase(component.name)),
    });

    return newSubject;
  } catch (error: any) {
    if (error.code === 11000) {
      // Handle potential race condition by retrying the find
      const existingSubject = await SubjectModel.findOne({
        name: component.name,
      });
      if (existingSubject) {
        existingSubject.creditos = component.credits;
        await existingSubject.save();
        return existingSubject;
      }
    }
    throw error;
  }
}

async function processTeachers(teachers: UfabcParserComponent['teachers']) {
  const teacherCache = new Map();

  const findTeacher = async (name: string | null) => {
    if (!name) {
      return null;
    }
    const caseSafeName = name.toLowerCase();

    if (teacherCache.has(caseSafeName)) {
      return teacherCache.get(caseSafeName);
    }

    const teacher = await TeacherModel.findByFuzzName(caseSafeName);

    if (!teacher) {
      // Create a new teacher if not found
      try {
        const newTeacher = await TeacherModel.create({
          name: caseSafeName,
          alias: [caseSafeName],
        });

        teacherCache.set(caseSafeName, newTeacher._id);
        return newTeacher._id;
      } catch (error: any) {
        // Handle potential race condition
        if (error.code === 11000) {
          const existingTeacher = await TeacherModel.findOne({
            $or: [{ name: caseSafeName }, { alias: caseSafeName }],
          });

          if (existingTeacher) {
            teacherCache.set(caseSafeName, existingTeacher._id);
            return existingTeacher._id;
          }
        }

        teacherCache.set(caseSafeName, null);
        return null;
      }
    }

    if (!teacher.alias.includes(caseSafeName)) {
      await TeacherModel.findByIdAndUpdate(teacher._id, {
        $addToSet: { alias: caseSafeName },
      });
    }

    teacherCache.set(caseSafeName, teacher._id);
    return teacher._id;
  };

  const [teoria, pratica, secondaryTeoria, secondaryPratica] =
    await Promise.all([
      findTeacher(teachers.professor ? teachers.professor : null),
      findTeacher(teachers.practice ? teachers.practice : null),
      findTeacher(
        teachers.secondaryProfessor ? teachers.secondaryProfessor : null,
      ),
      findTeacher(
        teachers.secondaryPractice ? teachers.secondaryPractice : null,
      ),
    ]);

  return {
    teoria,
    pratica,
    secondaryTeoria,
    secondaryPratica,
  };
}
