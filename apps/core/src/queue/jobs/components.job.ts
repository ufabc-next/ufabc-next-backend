import { ComponentModel, type Component } from '@/models/Component.js';
import { SubjectModel } from '@/models/Subject.js';
import {
  getComponents,
  type UfabcParserComponent,
} from '@/modules/ufabc-parser.js';
import { currentQuad } from '@next/common';
import { camelCase, startCase } from 'lodash-es';
import type { QueueContext } from '../types.js';
import type { FastifyBaseLogger } from 'fastify';
import { TeacherModel } from '@/models/Teacher.js';

export async function syncComponents({ app }: QueueContext<unknown>) {
  const tenant = currentQuad();
  const parserComponents = await getComponents(tenant);

  if (!parserComponents.data) {
    app.log.error({ parserComponents }, 'Error receiving components');
    throw new Error('Could not get components');
  }

  app.log.info({
    msg: 'Received components from parser',
    totalComponents: parserComponents.total,
    tenant,
  });

  const componentsJobsPromises = parserComponents.data.map(
    async (component) => {
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
    },
  );

  await Promise.all(componentsJobsPromises);

  app.log.info({
    msg: 'ComponentsSync tasks dispatched',
    totalEnrollments: componentsJobsPromises.length,
  });
}

export async function processComponent({
  app,
  job,
}: QueueContext<{
  component: UfabcParserComponent;
  tenant: string;
}>) {
  if (!job.data.tenant || !job.data.component) {
    app.log.info('Discarding job with useless data');
    return;
  }

  const { component, tenant } = job.data;
  try {
    const subject = await handleSubject(component, app.log);
    const professors = await handleTeachers(component.teachers, app.log);

    const dbComponent = {
      codigo: component.UFComponentCode,
      disciplina_id: component.UFComponentId,
      campus: component.campus,
      disciplina: component.name,
      season: tenant,
      turma: component.turma,
      turno: component.turno === 'morning' ? 'diurno' : 'noturno',
      vagas: component.vacancies,
      ideal_quad: false,
      quad: Number(component.quad),
      kind: 'api',
      year: component.year,
      subject: subject._id,
      obrigatorias: component.courses
        .filter((c) => c.category === 'mandatory')
        .map((c) => c.UFCourseId),
      uf_cod_turma: component.UFClassroomCode,
      tpi: [
        component.tpi?.theory,
        component.tpi?.practice,
        component.tpi?.individual,
      ],
      // Map teachers to component schema fields
      teoria: professors.professor || professors.secondaryProfessor,
      pratica: professors.practice || professors.secondaryPractice,
    } satisfies Omit<
      Component,
      | '_id'
      | 'alunos_matriculados'
      | 'after_kick'
      | 'before_kick'
      | 'createdAt'
      | 'updatedAt'
    >;

    app.log.debug(dbComponent, 'Generated component');

    const result = await ComponentModel.findOneAndUpdate(
      {
        season: tenant,
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
      identifier: dbComponent.uf_cod_turma,
      id: result._id,
      action: result.isNew ? 'inserted' : 'updated',
    });
    job.returnvalue = {
      data: result.toObject(),
      action: result.isNew ? 'inserted' : 'updated',
    };
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

async function handleSubject(
  component: UfabcParserComponent,
  log: FastifyBaseLogger,
) {
  const UFCode = component.UFComponentCode.split('-')[0];
  const searchValue = startCase(camelCase(component.name));

  log.debug({
    msg: 'Handling subject for component',
    UFCode,
    searchValue,
  });

  try {
    // First try to find by UFCode
    let subject = await SubjectModel.findOne({
      uf_subject_code: { $in: [UFCode] },
    });

    if (subject) {
      return subject.toObject();
    }

    // If not found by UFCode, try to find by search value
    subject = await SubjectModel.findOne({
      search: searchValue,
    });

    if (subject) {
      log.info({
        msg: 'Subject found by search value, updating with UFCode',
        UFCode,
        searchValue,
        existingSubjectId: subject._id,
      });

      // Update the existing subject to include the new UFCode
      const updatedSubject = await SubjectModel.findByIdAndUpdate(
        subject._id,
        {
          $addToSet: { uf_subject_code: UFCode },
        },
        { new: true },
      );

      if (!updatedSubject) {
        throw new Error('Failed to update subject with UFCode');
      }

      return updatedSubject.toObject();
    }

    // If not found at all, create new subject
    log.info({
      msg: 'Subject not found, creating new one',
      UFCode,
      searchValue,
    });

    const newSubject = {
      uf_subject_code: [UFCode],
      name: component.name,
      search: searchValue,
      creditos: component.credits,
    };

    const createdSubject = await SubjectModel.create(newSubject);
    log.info({
      msg: 'New subject created',
      subjectId: createdSubject._id,
    });
    return createdSubject.toObject();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    ) {
      log.warn({
        msg: 'Duplicate key detected, attempting to find and update existing subject',
        UFCode,
        searchValue,
        error: error instanceof Error ? error.message : String(error),
      });

      // Find the existing subject with this search value
      const existingSubject = await SubjectModel.findOne({
        search: searchValue,
      });
      if (existingSubject) {
        const updatedSubject = await SubjectModel.findByIdAndUpdate(
          existingSubject._id,
          {
            $addToSet: { uf_subject_code: UFCode },
          },
          { new: true },
        );

        if (!updatedSubject) {
          throw new Error('Failed to update existing subject with UFCode');
        }

        log.info({
          msg: 'Updated existing subject with new UFCode',
          subjectId: updatedSubject._id,
          UFCode,
        });

        return updatedSubject.toObject();
      }
    }

    log.error({
      msg: 'Error handling subject',
      error: error instanceof Error ? error.message : String(error),
      UFCode,
      searchValue,
    });
    throw error;
  }
}

async function handleTeachers(
  teachers: UfabcParserComponent['teachers'],
  log: FastifyBaseLogger,
) {
  const findOrCreateTeacher = async (teacherName: string | null) => {
    if (!teacherName) return null;

    log.debug({ teacherName }, 'Searching for teacher');

    // Try to find existing teacher using fuzzy matching
    const existingTeacher = await TeacherModel.findByFuzzName(teacherName);

    if (existingTeacher) {
      log.debug(
        {
          teacherName,
          foundTeacher: existingTeacher.name,
          teacherId: existingTeacher._id,
        },
        'Found existing teacher',
      );
      return existingTeacher._id;
    }

    // Create new teacher if not found
    log.info({ teacherName }, 'Teacher not found, creating new one');
    const normalizedName = teacherName.toLowerCase();
    const newTeacher = await TeacherModel.create({
      name: normalizedName,
      // Add original name as alias if it differs from normalized name
      alias: teacherName !== normalizedName ? [teacherName] : [],
    });

    log.info(
      {
        teacherName,
        teacherId: newTeacher._id,
      },
      'New teacher created',
    );

    return newTeacher._id;
  };

  const [
    practiceTeacher,
    secondaryPracticeTeacher,
    professorTeacher,
    secondaryProfessorTeacher,
  ] = await Promise.all([
    findOrCreateTeacher(teachers.practice),
    findOrCreateTeacher(teachers.secondaryPractice),
    findOrCreateTeacher(teachers.professor),
    findOrCreateTeacher(teachers.secondaryProfessor),
  ]);

  const professors = {
    practice: practiceTeacher,
    secondaryPractice: secondaryPracticeTeacher,
    professor: professorTeacher,
    secondaryProfessor: secondaryProfessorTeacher,
  };

  log.debug({ professors }, 'Handling professors for component');
  return professors;
}
