import { createHash } from 'node:crypto';
import { batchInsertItems, generateIdentifier } from '@next/common';
import { TeacherModel } from '@/models/Teacher.js';
import { ComponentModel, type Component } from '@/models/Component.js';
import { z } from 'zod';
import { ufProcessor } from '@/services/ufprocessor.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SubjectModel } from '@/models/Subject.js';

const validateComponentTeachersBody = z.object({
  hash: z.string().optional(),
  season: z.string(),
  link: z.string({
    message: 'O Link deve ser passado',
  }),
  // util to ignore when UFABC send bad data
  ignoreErrors: z.boolean().optional().default(false),
});

export async function componentsTeachers(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { season, hash, link, ignoreErrors } =
    validateComponentTeachersBody.parse(request.body);
  const componentsWithTeachers = await ufProcessor.getComponentsFile(link);
  const errors: string[] = [];

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
      errors.push(caseSafeName);
      teacherCache.set(caseSafeName, null);
      return null;
    }

    if (!teacher.alias.includes(caseSafeName)) {
      await TeacherModel.findByIdAndUpdate(teacher._id, {
        $addToSet: { alias: caseSafeName },
      });
    }

    teacherCache.set(caseSafeName, teacher._id);
    return teacher._id;
  };

  const nextComponentWithTeachersPromises = componentsWithTeachers.map(
    async (component) => {
      if (!component.name) {
        errors.push(
          `Missing required field for component: ${component.UFComponentCode || 'Unknown'}`,
        );
      }

      const [teoria, pratica] = await Promise.all([
        findTeacher(component.teachers?.professor),
        findTeacher(component.teachers?.practice),
      ]);

      return {
        disciplina_id: component.UFComponentId,
        codigo: component.UFComponentCode,
        disciplina: component.name,
        campus: component.campus === 'sa' ? 'santo andre' : 'sao bernardo',
        turma: component.turma.toLocaleUpperCase(),
        turno: component.turno,
        vagas: component.vacancies,
        teoria,
        pratica,
        season,
        creditos: component.credits,
      };
    },
  );

  const nextComponentWithTeachers = await Promise.all(
    nextComponentWithTeachersPromises,
  );

  if (!ignoreErrors && errors.length > 0) {
    const errorsSet = [...new Set(errors)];
    return reply.status(403).send({
      msg: 'Missing professors while parsing',
      names: errorsSet,
      size: errorsSet.length,
    });
  }

  const disciplinaHash = createHash('md5')
    .update(JSON.stringify(nextComponentWithTeachers))
    .digest('hex');

  if (disciplinaHash !== hash) {
    return {
      hash: disciplinaHash,
      errors: [...new Set(errors)],
      total: nextComponentWithTeachers.length,
      payload: nextComponentWithTeachers,
    };
  }

  const start = Date.now();
  const batchSize = 100;
  const insertComponentsErrors = [];

  const allSeasonComponents = await ComponentModel.find({ season }).lean();

  const componentMap = new Map(
    allSeasonComponents.map((comp) => [
      comp.disciplina.toLocaleLowerCase(),
      comp,
    ]),
  );

  const batches = [];
  for (let i = 0; i < nextComponentWithTeachers.length; i += batchSize) {
    batches.push(nextComponentWithTeachers.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    try {
      const existingComponents = batch.map((component) => {
        const lookupKey = component.disciplina.toLocaleLowerCase();
        return componentMap.get(lookupKey) || null;
      });

      const updatePromises = batch.map(async (component, index) => {
        const existingComponent = existingComponents[index];
        if (!existingComponent) {
          insertComponentsErrors.push({
            error: 'Component not found',
            component,
          });
          return;
        }

        try {
          await ComponentModel.updateOne(
            { _id: existingComponent._id },
            {
              $set: {
                teoria: component.teoria,
                pratica: component.pratica,
              },
            },
          );
        } catch (error) {
          insertComponentsErrors.push({
            error: error.message,
            component,
          });
        }
      });

      await Promise.all(updatePromises);
    } catch (error) {
      insertComponentsErrors.push({
        error: error.message,
        batch,
      });
    }
  }

  if (insertComponentsErrors.length > 0) {
    request.log.error({
      msg: 'errors happened during insert',
      errors: insertComponentsErrors,
      size: insertComponentsErrors.length,
    });

    const toRetryPromises = insertComponentsErrors.map((a) =>
      // @ts-expect-error
      retryFileComponents(a.component),
    );

    const toRetry = await Promise.all(toRetryPromises);
    const data = await ComponentModel.insertMany(toRetry);
    return { inserted: data, size: data.length };
  }

  return {
    status: 'ok',
    time: Date.now() - start,
    errors: [...new Set(errors)],
  };
}

async function retryFileComponents(
  component: any,
): Promise<Partial<Component>> {
  const allSubjects = await SubjectModel.find({}).lean();
  const matchingSubject = allSubjects.find(
    (s) => s.name.toLocaleLowerCase() === component.disciplina,
  );

  if (!matchingSubject) {
    return {
      name: component.disciplina,
      creditos: component.creditos,
    };
  }

  const identifier = generateIdentifier(component, [
    'disciplina',
    'turno',
    'campus',
    'turma',
  ]);
  const [year, quad] = component.season.split(':');
  const componentUFId = await ComponentModel.findOne(
    {
      codigo: component.codigo,
    },
    { disciplina_id: 1, _id: 0 },
  ).lean();

  return {
    disciplina_id: componentUFId?.disciplina_id ?? null,
    codigo: component.codigo,
    disciplina: component.disciplina,
    campus: component.campus,
    turma: component.turma,
    turno: component.turno,
    vagas: component.vagas,
    teoria: component.teoria,
    pratica: component.pratica,
    season: component.season,
    subject: matchingSubject?._id,
    obrigatorias: [],
    identifier,
    after_kick: [],
    alunos_matriculados: [],
    before_kick: [],
    quad: Number(quad),
    year: Number(year),
    ideal_quad: false,
  };
}
