import { EmailPart, ParsedEmail, Attachment } from '@/shared/types/EmailPart';
import {
  hasNestedParts,
  isPlainTextBody,
  isHtmlBody,
  isAttachment,
  convertHtmlToText,
} from '@/shared/utils/emailPartUtils';
import { singleton, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces';

@singleton()
export class EmailContentExtractor {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  findEmailParts(parts: ReadonlyArray<EmailPart>): ParsedEmail {
    let textBody = '';
    let htmlBody = '';
    const attachments: Attachment[] = [];

    this.logger.debug('Parsing email parts...');

    const recurse = (part: EmailPart): void => {
      if (hasNestedParts(part)) {
        part.parts.forEach(recurse);
        return;
      }

      if (isPlainTextBody(part)) {
        textBody = part.body;
      } else if (isHtmlBody(part)) {
        htmlBody = part.body;
      } else if (isAttachment(part) && part.name) {
        attachments.push({
          name: part.name,
          mimeType: part.contentType,
          size: part.size || 0,
        });
      }
    };

    parts.forEach(recurse);

    const finalBody: string = htmlBody ? convertHtmlToText(htmlBody) : textBody;

    return { body: finalBody, attachments };
  }
}
