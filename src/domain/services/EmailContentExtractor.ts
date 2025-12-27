import { htmlToText } from 'html-to-text';
import {
  EmailPart,
  ParsedEmail,
  StructuredEmailData,
  PromptBuilderResult,
  Attachment,
} from '@/shared/types/EmailPart';
import { CustomTags } from '@/shared/types/ProviderTypes';
import { singleton, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

@singleton()
export class EmailContentExtractor {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  findEmailParts(parts: ReadonlyArray<EmailPart>): ParsedEmail {
    let textBody = '';
    let htmlBody = '';
    const attachments: Attachment[] = [];

    this.logger.debug('Parsing email parts...');

    function recurse(part: EmailPart): void {
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
    }

    parts.forEach(recurse);

    const finalBody: string = htmlBody ? convertHtmlToText(htmlBody) : textBody;

    return { body: finalBody, attachments };
  }

  buildPrompt(
    structuredData: StructuredEmailData,
    customTags: CustomTags,
    promptTemplate: string,
    contextCharLimit: number
  ): PromptBuilderResult {
    const headersJSON: string = JSON.stringify(structuredData.headers, null, 2);
    const attachmentsJSON: string = JSON.stringify(structuredData.attachments, null, 2);

    const customInstructions: string = customTags
      .map((tag) => `- ${tag.key}: (boolean) ${tag.prompt}`)
      .join('\n');

    const fullInstructions: string = `${promptTemplate}\n${customInstructions}`;

    const frameSize: number = fullInstructions
      .replace('{headers}', headersJSON)
      .replace('{body}', '')
      .replace('{attachments}', attachmentsJSON).length;

    const maxBodyLength: number = contextCharLimit - frameSize;
    let emailBody: string = structuredData.body;

    if (emailBody.length > maxBodyLength) {
      this.logger.warn('Body length exceeds remaining space, truncating', {
        bodyLength: emailBody.length,
        maxBodyLength,
      });
      emailBody = this.truncateText(emailBody, maxBodyLength);
    }

    const finalPrompt: string = fullInstructions
      .replace('{headers}', headersJSON)
      .replace('{body}', emailBody)
      .replace('{attachments}', attachmentsJSON);

    if (finalPrompt.length > contextCharLimit) {
      this.logger.error('Final prompt still too long, hard cutting', {
        promptLength: finalPrompt.length,
        limit: contextCharLimit,
      });
      return finalPrompt.substring(0, contextCharLimit);
    }

    return finalPrompt;
  }

  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength);
  }
}

function hasNestedParts(part: EmailPart): part is EmailPart & { parts: EmailPart[] } {
  return part.parts !== undefined && part.parts.length > 0;
}

function isPlainTextBody(part: EmailPart): boolean {
  return part.contentType === 'text/plain' && !part.isAttachment;
}

function isHtmlBody(part: EmailPart): boolean {
  return part.contentType === 'text/html' && !part.isAttachment;
}

function isAttachment(part: EmailPart): boolean {
  return part.isAttachment || part.name !== undefined;
}

function convertHtmlToText(html: string): string {
  return htmlToText(html, { wordwrap: 130 });
}
