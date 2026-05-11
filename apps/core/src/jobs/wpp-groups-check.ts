import { currentQuad } from '@next/common';
import { defineJob } from '@next/queues/client';

import { CommunicationsConnector } from '@/connectors/communications.js';
import { JOB_NAMES } from '@/constants.js';
import { ComponentModel } from '@/models/Component.js';

const communicationsConnector = new CommunicationsConnector();

export const wppGroupsCheckJob = defineJob(JOB_NAMES.WPP_GROUPS_CHECK)
  .handler(async ({ app }) => {
    const components = (await ComponentModel.find(
      {
        groupURL: { $exists: true, $ne: null },
        season: currentQuad(),
      },
      {
        groupURL: 1,
        disciplina_id: 1,
      }
    )
      .lean()
      .exec()) as Array<{
        groupURL?: string | null;
        disciplina_id?: number | null;
      }>;

    const targets = components.filter(
      (component): component is {
        groupURL: string;
        disciplina_id: number;
      } =>
        typeof component.groupURL === 'string' &&
        component.groupURL.trim().length > 0 &&
        typeof component.disciplina_id === 'number'
    );

    app.log.info(
      { total: targets.length },
      'dispatching group link validations'
    );

    const results: Array<{ groupUrl: string; status: 'sent' | 'failed' }> = [];

    for (const { groupURL, disciplina_id } of targets) {
      try {
        const disciplinaId = String(disciplina_id);

        await communicationsConnector.sendLinkToValidate(
          groupURL,
          disciplinaId
        );
        results.push({ groupUrl: groupURL, status: 'sent' });
      } catch (error) {
        app.log.error(
          { groupUrl: groupURL, disciplina_id: String(disciplina_id), error },
          'failed to validate group link'
        );
        results.push({ groupUrl: groupURL, status: 'failed' });
      }
    }

    return {
      success: true,
      total: targets.length,
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
    };
  })
  .every('3 hours', 'UTC');