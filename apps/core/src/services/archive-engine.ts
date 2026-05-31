import { load } from 'cheerio';
import { ofetch } from 'ofetch';

import { currentQuad } from '@next/common';

import { MoodleConnector } from '@/connectors/moodle.js';
import { S3Connector } from '@/connectors/s3-connector.js';
import { ComponentModel } from '@/models/Component.js';
import {
  TeacherModel,
  findBestLevenshteinMatch,
  normalizeName,
} from '@/models/Teacher.js';

import { componentArchiveSchema } from '@/schemas/v2/components.js';
import { logger as baseLogger } from '@/utils/logger.js';

export type MoodleSession = {
  sessionId: string;
  sessKey: string;
};

export type MoodleCourse = {
  viewurl: string;
  fullname: string;
  shortname?: string;
  idnumber?: string;
  id: number;
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

  async findComponentByMoodleCourse(
    moodleCourse: MoodleCourse,
    teacherName?: string,
  ) {
    const season = currentQuad();
    this.logger.info(
      { courseId: moodleCourse.id, courseName: moodleCourse.fullname, season },
      'Matching moodle course to internal component',
    );

    const candidates: string[] = [];

    if (moodleCourse.idnumber) {
      candidates.push(moodleCourse.idnumber);
    }

    if (moodleCourse.shortname) {
      const codeMatch = moodleCourse.shortname.match(/[A-Z]{2,}\d{3,}(?:-\d+)?/);
      if (codeMatch) {
        candidates.push(codeMatch[0]);
      }
    }

    const codeMatch = moodleCourse.fullname.match(/[A-Z]{2,}\d{3,}(?:-\d+)?/);
    if (codeMatch) {
      candidates.push(codeMatch[0]);
    }

    const uniqueCandidates = [...new Set(candidates)];
    this.logger.info(
      { candidates: uniqueCandidates },
      'Extracted candidate codes from moodle course',
    );

    let teacherId: string | undefined;
    if (teacherName) {
      const normalizedTeacherName = normalizeName(teacherName);
      let teacher = await TeacherModel.findOne({
        name: normalizedTeacherName,
      });

      if (!teacher) {
        this.logger.info(
          { teacherName, normalizedName: normalizedTeacherName },
          'Exact teacher match not found, trying levenshtein',
        );
        const allTeachers = await TeacherModel.find({});
        const levMatch = findBestLevenshteinMatch(teacherName, allTeachers);
        if (levMatch) {
          teacher = levMatch;
        }
      }

      teacherId = teacher?._id?.toString();
    }

    this.logger.info(
      { teacherId: teacherId ?? null },
      'Resolved teacher for matching',
    );

    let matchedComponent = null;

    for (const candidateCode of uniqueCandidates) {
      matchedComponent = await ComponentModel.findOne({
        codigo: candidateCode,
        season,
        ...(teacherId && {
          $or: [{ teoria: teacherId }, { pratica: teacherId }],
        }),
      });

      if (matchedComponent) {
        this.logger.info(
          { candidateCode, componentDbId: matchedComponent._id },
          'Matched component by candidate code',
        );
        break;
      }
    }

    if (!matchedComponent && teacherId) {
      const words = moodleCourse.fullname
        .toLowerCase()
        .split(/[\s-]+/)
        .filter((w) => w.length > 3)
        .slice(0, 3);

      this.logger.info({ words }, 'No candidate match, trying disciplina keywords');

      for (const word of words) {
        matchedComponent = await ComponentModel.findOne({
          season,
          disciplina: { $regex: word, $options: 'i' },
          $or: [{ teoria: teacherId }, { pratica: teacherId }],
        });

        if (matchedComponent) {
          this.logger.info(
            { word, componentDbId: matchedComponent._id },
            'Matched component by disciplina keyword',
          );
          break;
        }
      }
    }

    if (matchedComponent) {
      await ComponentModel.findByIdAndUpdate(matchedComponent._id, {
        $set: { moodleCourseId: moodleCourse.id },
      });

      this.logger.info(
        { componentDbId: matchedComponent._id, moodleCourseId: moodleCourse.id },
        'Updated component with moodleCourseId',
      );

      return matchedComponent;
    }

    this.logger.warn(
      { moodleCourseId: moodleCourse.id, courseName: moodleCourse.fullname },
      'No matching component found',
    );
    return null;
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
    componentId: string,
    bucket: string,
  ) {
    const url = new URL(rawUrl);
    const headers: Record<string, string> = {};
    if (this.session) {
      headers.Cookie = `MoodleSession=${this.session.sessionId}`;
    }
    const buffer = await ofetch(url.href, {
      responseType: 'arrayBuffer',
      headers,
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
