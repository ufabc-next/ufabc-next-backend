import { PassThrough } from 'node:stream';
import { ofetch } from 'ofetch';
import { read } from 'xlsx';
import _ from 'lodash-es';
import errors from '@/errors';

_.insert = function (arr, index, item) {
  arr.splice(index, 0, item);
};

type ParseXlsxBody = {
  link: string;
  rename: [{ from: string; as: string }];
  season?: string;
};

export async function parseXlsx(body: ParseXlsxBody) {
  const params = _.defaults(body, {
    link: 'http://prograd.ufabc.edu.br/pdf/turmas_salas_docentes_sa_2018.3.pdf',
    numberOfColumns: 6,
    startPage: 0,
    pickColumns: [
      {
        position: 0,
        name: 'ra',
      },
    ],
    rename: [
      { from: 'TURMA', as: 'nome' },
      { from: 'DOCENTE TEORIA', as: 'teoria' },
      { from: 'DOCENTE PRÁTICA', as: 'pratica' },
    ],
    rowDifference: 5,
    allowedPercentage: 0.3,
  });

  const isPdf = params.link.endsWith('pdf');

  const response = await ofetch({
    method: 'GET',
    url: params.link,
    responseType: 'stream',
  });

  const forBuffer = new PassThrough();
  const buffers: any[] = [];

  return new Promise((resolve, reject) => {
    response.data.pipe(forBuffer);
    forBuffer.on('data', (chunk) => buffers.push(chunk));
    forBuffer.on('finish', () => {
      const workbook = read(Buffer.concat(buffers), { type: 'buffer' });
      const sheet_name_list = workbook.SheetNames;
      const data = xlsx.utils.sheet_to_json(
        workbook.Sheets[sheet_name_list[0]],
      );

      console.log('columns', _.keys(data[0]));

      const parsed = data.map((d) => {
        params.rename.forEach((name) => {
          _.set(d, name.as, d[name.from]);
        });

        return _.pick(d, _.map(params.rename, 'as'));
      });

      resolve(parsed);
    });
  });
}
