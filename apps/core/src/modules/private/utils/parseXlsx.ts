import { Readable } from 'node:stream';
import fs from 'node:fs';
import { ofetch } from 'ofetch';
import { set_fs, stream, read as xlsxRead, utils as xlsxUtils } from 'xlsx';
// import _ from 'lodash-es';
import { logger } from '@next/common';

set_fs(fs);
stream.set_readable(Readable);

type RenameOptions = {
  from: 'RA' | 'TURMA' | 'DOCENTE TEORIA' | 'DOCENTE PRATICA' | 'TEORIA';
  as: 'ra' | 'nome' | 'teoria' | 'pratica' | 'horarios';
};
type ParseXlSXBody = {
  link: string;
  rename: Array<RenameOptions>;
  season?: string;
};

type JSONFileData = {
  RA: number;
  CODIGO_DA_TURMA: string;
};

export async function parseXlsx<TBody extends ParseXlSXBody>(body: TBody) {
  const bodyDefaults = {
    link: 'http://prograd.ufabc.edu.br/pdf/turmas_salas_docentes_sa_2018.3.pdf',
    rename: [
      { from: 'TURMA', as: 'nome' },
      { from: 'DOCENTE TEORIA', as: 'teoria' },
      { from: 'DOCENTE PRATICA', as: 'pratica' },
    ],
  } satisfies ParseXlSXBody;
  const params = Object.assign(body, bodyDefaults);

  const file = await ofetch(params.link, {
    responseType: 'arrayBuffer',
  });

  const { SheetNames, Sheets } = xlsxRead(file);
  const fileData = xlsxUtils.sheet_to_json<JSONFileData>(Sheets[SheetNames[0]]);
  const columns = Object.keys(fileData[0]);
  logger.debug({ msg: 'File Columns', columns });

  const parsedEnrollments = fileData.map((enrollment) => {
    const updatedEnrollment = {};
    params.rename.forEach((name) => {
      // @ts-expect-error WHY TS IS SO FUCKING DUMB
      updatedEnrollment[name.as] = enrollment[name.from];
    });

    return Object.fromEntries(
      Object.entries(updatedEnrollment).filter(([key]) =>
        params.rename.some(({ as }) => as === key),
      ),
    );
  });

  return parsedEnrollments;
}
