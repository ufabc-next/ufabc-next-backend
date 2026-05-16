import { currentQuad } from '@next/common';
import { defineJob } from '@next/queues/client';

import { CommunicationsConnector } from '@/connectors/communications.js';
import { JOB_NAMES } from '@/constants.js';
import { ComponentModel } from '@/models/Component.js';


export const wppGroupsCheckJob = defineJob(JOB_NAMES.WPP_GROUPS_CHECK)
  .handler(async ({ app }) => {

    const communicationsConnector = new CommunicationsConnector();

    const components = (await ComponentModel.find(
      {
        groupURL: { $exists: true, $ne: null },
        season: currentQuad(),
      },
      {
        groupURL: 1,
        disciplina_id: 1,
      },
      { sort: { updateAt: -1 } }
    )
      .lean()
      .exec()) as Array<{
        groupURL?: string | null;
        disciplina_id?: number | null;
      }>;



    app.log.info(
      { total: components.length },
      'dispatching group link validations'
    );

    const results: Array<{ groupUrl: string; status: 'sent' | 'failed' }> = [];

    for (const { groupURL, disciplina_id } of components) {
      try {
        const disciplinaId = String(disciplina_id);

        await communicationsConnector.sendLinkToValidate(
          //@ts-ignore -- protected from null/empty errors by mongodb query 
          groupURL,
          disciplinaId
        );
        //@ts-ignore -- protected from null/empty errors by mongodb query 
        results.push({ groupUrl: groupURL, status: 'sent' });
      } catch (error) {
        app.log.error(
          { groupUrl: groupURL, disciplina_id: String(disciplina_id), error },
          'failed to validate group link'
        );
        //@ts-ignore -- protected from null/empty errors by mongodb query 
        results.push({ groupUrl: groupURL, status: 'failed' });
      }
    }

    return {
      success: true,
      total: components.length,
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
    };
  })
  .every('22 hours', 'UTC');