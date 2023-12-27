import { createHash } from 'node:crypto';
import { DisciplinaModel } from '@next/models';
import { ofetch } from 'ofetch';
import { convertUfabcDisciplinas } from '@next/common';
import { type ParseXlSXBody, parseXlsx } from '../utils/parseXlsx.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type SyncEnrollmentsRequest = {
  Body: ParseXlSXBody & {
    hash: string;
    year: number;
    quad: number;
  };
};

export async function syncEnrollments(
  request: FastifyRequest<SyncEnrollmentsRequest>,
  reply: FastifyReply,
) {
  const { hash, year, quad, link } = request.body;

  if (!year || !quad) {
    throw new Error(`Missing Parameters`, {
      cause: {
        year,
        quad,
      },
    });
  }

  const season = `${year}:${quad}`;

  const doesLinkExist = await ofetch(link, {
    method: 'OPTIONS',
  });

  if (!doesLinkExist) {
    throw new Error(`O link enviado deve existir`, { cause: link });
  }

  const currentQuadDisciplinas = DisciplinaModel.find({
    season,
  });
  const disciplinas = await currentQuadDisciplinas
    .find(
      {},
      {
        identifier: 1,
        subject: 1,
        teoria: 1,
        pratica: 1,
      },
    )
    .lean({ virtuals: true });

  // eslint-disable-next-line unused-imports/no-unused-vars
  const disciplinasMap = disciplinas.map((d): any => [d._id, d]);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const _keys = ['ra', 'year', 'quad', 'disciplina'];
  const rawEnrollments = (await parseXlsx(request.body)).map(
    (ufabcDisciplina) => convertUfabcDisciplinas(ufabcDisciplina),
  );
  // eslint-disable-next-line unused-imports/no-unused-vars
  const _filteredEnrollments = rawEnrollments
    .filter((enrollment) => enrollment?.ra)
    .map((studentEnrollment) =>
      Object.assign({}, studentEnrollment, { year, quad }),
    );

  // const enrollments = filteredEnrollments.map((enrollment) =>
  //   _.extend(enrollment, {
  //     ..._.omit(disciplinasMap.get(app.helpers.transform.identifier(e)) || {}, [
  //       'id',
  //       '_id',
  //     ]),
  //     identifier: app.helpers.transform.identifier(e, keys),
  //     disciplina_identifier: app.helpers.transform.identifier(e),
  //   }),
  // );

  const enrollmentsHash = createHash('md5')
    .update(JSON.stringify({ name: 'Joabe' }))
    .digest('hex');

  if (enrollmentsHash !== hash) {
    return {
      hash: enrollmentsHash,
      size: [].length,
    };
  }

  // const chunks = _.chunk(enrollments, Math.ceil(enrollments.length / 3));

  // app.agenda.now('updateEnrollments', { json: chunks[0] });
  // app.agenda.schedule('in 2 minutes', 'updateEnrollments', { json: chunks[1] });
  // app.agenda.schedule('in 4 minutes', 'updateEnrollments', { json: chunks[2] });

  return reply.send({ published: true });
}
