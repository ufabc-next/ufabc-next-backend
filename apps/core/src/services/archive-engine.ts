import { load } from 'cheerio';
import { ofetch } from 'ofetch';

import { MoodleConnector } from '@/connectors/moodle.js';
import { S3Connector } from '@/connectors/s3-connector.js';

import { componentArchiveSchema } from '@/schemas/v2/components.js';
import { logger as baseLogger } from '@/utils/logger.js';

export type MoodleSession = {
  sessionId: string;
  sessKey: string;
};

export class ArchiveEngine {
  private readonly logger;
  private readonly moodleConnector;
  private readonly session?: MoodleSession;
  private readonly s3Connector;
  
  constructor({ globalTraceId, session, s3Connector }: { globalTraceId?: string, session?: MoodleSession, s3Connector?: S3Connector } = {}) {
    this.logger = baseLogger.child({ globalTraceId });
    this.moodleConnector = new MoodleConnector(globalTraceId);
    this.session = session
    this.s3Connector = s3Connector;
  }

  async fetchAndValidateCourses(session: MoodleSession) {
    const [moodleCourses] = await this.moodleConnector.getComponents(
      session.sessionId,
      session.sessKey,
    );
    const parsed = componentArchiveSchema.safeParse(
      moodleCourses?.data?.courses,
    );

    if (!parsed.success) {
      this.logger.warn(
        { error: parsed.error.message },
        'Failed to parse component archives',
      );
      return { error: parsed.error.message };
    }

    return { error: null, data: parsed.data! };
  }

  async extractFiles(
    viewurl: string,
    componentId: number,
  ) {
    const url = new URL(viewurl);
    const page = await this.moodleConnector.getComponentContentsPage(
      this.session?.sessionId || '',
      url.pathname,
      componentId.toString(),
    );

    const $ = load(page);
    const potentialLinks: { href: string; name: string }[] = [];

    $('div.activityname').each((_index, el) => {
      const href = $(el).find('a').attr('href');
      const name = $(el).find('span.instancename').text();
      if (href && name) {
        potentialLinks.push({ href, name });
      }
    });

    $('a[href*="/mod/resource/"]').each((_index, el) => {
      const link = $(el).attr('href');
      const name = $(el).text().trim();
      if (link && name && !potentialLinks.some((p) => p.href === link)) {
        potentialLinks.push({ href: link, name });
      }
    });

    $('a[href*="/pluginfile.php/"]').each((_index, el) => {
      const link = $(el).attr('href');
      const name =
        $(el).text().trim() || $(el).attr('title') || 'documento';
      if (link?.toLowerCase()?.endsWith('.pdf')) {
        if (!potentialLinks.some((p) => p.href === link)) {
          potentialLinks.push({ href: link, name });
        }
      }
    });

    const validationPromises = potentialLinks.map(
      async ({ href, name }) => {
        const { isPdf, finalUrl } =
          await this.moodleConnector.validatePdfLink(
            href,
            this.session?.sessionId || '',
            this.session?.sessKey || '',
          );

        if (!isPdf) {
          return null;
        }

        if (finalUrl) {
          return { url: finalUrl, name: name };
        }
        return null;
      },
    );

    const validatedLinks = await Promise.all(validationPromises);
    return validatedLinks.filter(
      (link) => link !== null,
    );
  }

  async downloadAndUpload(
    rawUrl: string,
    componentId: number,
    bucket: string,
  ) {
    const url = new URL(rawUrl);
    const buffer = await ofetch(url.href, {
      responseType: 'arrayBuffer',
    });

    const filename = this.extractFilenameFromUrl(url);
    const sanitizedFilename = this.sanitizeFilename(filename);
    const s3Key = `/archives/${componentId}/${sanitizedFilename}`;

    await this.s3Connector?.upload(bucket, s3Key, Buffer.from(buffer));

    return {
      s3Key,
      pdfName: sanitizedFilename,
    };
  }

  private extractFilenameFromUrl(url: URL): string {
    const pathname = url.pathname;
    this.logger.info({ url: url.href, pathname }, 'Extracting filename from URL');
    const segments = pathname
      .split('/')
      .filter((segment) => segment.length > 0);
    const lastSegment = segments[segments.length - 1] || 'document.pdf';

    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  }

  private sanitizeFilename(filename: string): string {
    const invalidChars = /[<>:"|?*\s]/g;

    let sanitized = filename
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0);
        if (invalidChars.test(char) || (code >= 0 && code <= 31)) {
          return '_';
        }
        return char;
      })
      .join('')
      .replace(/_{2,}/g, '_')
      .trim();

    if (!sanitized.toLowerCase().endsWith('.pdf')) {
      sanitized = `${sanitized}.pdf`;
    }

    if (sanitized.length > 255) {
      const ext = '.pdf';
      const nameWithoutExt = sanitized.slice(0, 255 - ext.length);
      sanitized = `${nameWithoutExt}${ext}`;
    }

    return sanitized || 'document.pdf';
  }
}
