import { currentQuad } from '@next/common';
import { defineJob } from '@next/queues/client';

import { CommunicationsConnector } from '@/connectors/communications.js';
import { JOB_NAMES } from '@/constants.js';
import { ComponentModel } from '@/models/Component.js';
import { ComponentRepository } from '@/repositories/ComponentRepository.js';
import type { ComponentGroupDTO } from '@/dtos/ComponentDTO.js';


export const wppGroupsCheckJob = defineJob(JOB_NAMES.WPP_GROUPS_CHECK)
  .handler(async ({ app }) => {

    const communicationsConnector = new CommunicationsConnector();

    const components = (await ComponentRepository.findGroupComponentsForSeason(
      currentQuad()
    )) as ComponentGroupDTO[];



    app.log.info(
      { total: components.length },
      'dispatching group link validations'
    );

    const results: Array<{ groupUrl: string; status: 'sent' | 'failed' }> = [];

    for (const { groupUrl, disciplinaId } of components) {
      try {
        await communicationsConnector.sendLinkToValidate(groupUrl, String(disciplinaId));
        results.push({ groupUrl, status: 'sent' });
      } catch (error) {
        app.log.error(
          { groupUrl, disciplina_id: String(disciplinaId), error },
          'failed to validate group link'
        );
        results.push({ groupUrl, status: 'failed' });
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