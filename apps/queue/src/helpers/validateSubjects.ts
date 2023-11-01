import { camelCase, startCase } from 'lodash-es';
import type { SubjectDocument } from '@next/models';

type Payload = {
  ra: number;
  year: number;
  quad: number;
  disciplina: string;
  creditos: number;
  conceito: string;
  cr_acumulado: number | undefined;
  ca_acumulado: number | undefined;
  cp_acumulado: number | undefined;
};

export function validateSubjects(
  payload: Payload,
  subjects: SubjectDocument[],
  extraMappings: Record<string, string> = {},
) {
  const mapping: Record<string, string> = { ...extraMappings };
  const modifiedPayloads = (
    Array.isArray(payload) ? payload : [payload]
  ).filter(Boolean) as Payload[];

  const resultPayloads = modifiedPayloads.map((modifiedPayload) =>
    modifyPayload(modifiedPayload, subjects, mapping),
  );

  return resultPayloads
    .filter(
      (resultPayload) =>
        resultPayload.disciplina !== '' && resultPayload.disciplina !== null,
    )
    .map((resultPayload) => resultPayload.disciplina);
}

export function modifyPayload(
  payload: Payload,
  subjects: SubjectDocument[],
  mapping: Record<string, string>,
) {
  const mapSubjects = subjects.map((subject) => subject.search);
  const converted = startCase(camelCase(payload.disciplina));
  const convertedMapping = startCase(camelCase(mapping[payload.disciplina]));

  const modifiedPayload = {
    ...payload,
  };

  if (
    !mapSubjects.includes(converted) &&
    !mapSubjects.includes(convertedMapping)
  ) {
    modifiedPayload.disciplina = convertedMapping || payload.disciplina;
  }

  const subject = subjects.find((s) => s.search === converted);
  const subjectMapping = subjects.find((s) => s.search === convertedMapping);

  if (subject === undefined && subjectMapping === undefined) {
    return {
      ...modifiedPayload,
      subject: null,
      disciplina: payload.disciplina,
    };
  }

  return {
    ...modifiedPayload,
    subject: getSubjectId(subject, subjectMapping),
    disciplina: subjectMapping
      ? mapping[payload.disciplina]
      : payload.disciplina,
  };
}

function getSubjectId(
  subject?: SubjectDocument,
  subjectMapping?: SubjectDocument,
) {
  if (subject !== undefined && subjectMapping !== undefined) {
    const subjectId = '_id' in subject ? subject._id : null;
    const subjectMappingId =
      '_id' in subjectMapping ? subjectMapping._id : null;

    return subjectId ?? subjectMappingId;
  }

  return null;
}
