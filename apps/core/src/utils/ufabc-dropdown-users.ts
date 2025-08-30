/**
 * TypeScript version - Replicates the curl request to UFABC's getDropdownUsers.php endpoint
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface DropdownUsersOptions {
  page?: number;
  pageLimit?: number;
  multiple?: number;
  displayEmptyChoice?: number;
  all?: number;
  right?: string;
  inactiveDeleted?: number;
  withNoRight?: number;
  entityRestrict?: string;
  className?: string;
  idorToken?: string;
  csrfToken?: string;
  cookies?: string;
}

interface DropdownUser {
  id: string;
  text: string;
  // Add more properties based on the actual API response
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Ignore self-signed certificate errors (use with caution)

export async function getDropdownUsersOfetch(
  options: DropdownUsersOptions = {},
): Promise<DropdownUser[]> {
  const { ofetch } = await import('ofetch');

  const {
    page = 0,
    pageLimit = 46_000,
    multiple = 0,
    displayEmptyChoice = 1,
    all = 0,
    right = 'all',
    inactiveDeleted = 0,
    withNoRight = 0,
    entityRestrict = '[0]',
    className = 'form-select',
    idorToken = 'e98b8d978a4fca9f47a9af0afc30bd42cc83cf88e7c82a66060cebe27f2be353',
    csrfToken = '9d4d1ac6195f56ca555d0bc59159cc399a110958218a1d9ae23698d5bc10970e',
    cookies = '_ga=GA1.3.2111892430.1752358596; glpi_8ac3914e6055f1dc4d1023c9bbf5ce82=4e4842etkhi6lhii61o1k42p69',
  } = options;

  const url = 'https://servicos.ufabc.edu.br/ajax/getDropdownUsers.php';

  const formData = new URLSearchParams({
    multiple: multiple.toString(),
    display_emptychoice: displayEmptyChoice.toString(),
    all: all.toString(),
    right: right,
    inactive_deleted: inactiveDeleted.toString(),
    with_no_right: withNoRight.toString(),
    entity_restrict: entityRestrict,
    class: className,
    _idor_token: idorToken,
    page_limit: pageLimit.toString(),
    page: page.toString(),
  });

  try {
    const data = await ofetch<DropdownUser[]>(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        Connection: 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookies,
        Origin: 'https://servicos.ufabc.edu.br',
        Referer:
          'https://servicos.ufabc.edu.br/marketplace/formcreator/front/formdisplay.php?id=29',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'X-Glpi-Csrf-Token': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'sec-ch-ua':
          '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
      },
      body: formData.toString(),
      onResponseError: (ctx) => {
        console.error(
          `Error response from ${ctx.request.url}: ${ctx.response.status} ${ctx.response.statusText}`,
        );
        throw ctx;
      },
      onRequestError: (ctx) => {
        console.error(
          `Request error to ${ctx.request.url}: ${ctx.error.message}`,
        );
        throw ctx;
      },
    });

    return data;
  } catch (error) {
    console.error('Error fetching dropdown users with ofetch:', error);
    throw error;
  }
}

const users = await getDropdownUsersOfetch();
console.log(users);
await writeFile(
  join(import.meta.dirname, 'ufabc-dropdown-users2.json'),
  JSON.stringify(users, null, 2),
);
