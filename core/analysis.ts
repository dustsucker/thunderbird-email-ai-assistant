import { htmlToText } from 'html-to-text';
import { PROMPT_BASE, CONTEXT_CHAR_LIMIT, CustomTags } from './config';
import { logger } from '../src/infrastructure/providers/ProviderUtils';

// ============================================================================
// Email Part Type Definitions
// ============================================================================

/**
 * Represents a single part of a MIME email structure
 */
export interface EmailPart {
  contentType: string;
  body: string;
  isAttachment: boolean;
  name?: string;
  size?: number;
  parts?: EmailPart[];
}

/**
 * Represents an extracted email attachment
 */
export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Result of parsing email parts
 */
export interface ParsedEmail {
  body: string;
  attachments: Attachment[];
}

/**
 * Structured email data for prompt building
 */
export interface StructuredEmailData {
  headers: Record<string, string>;
  body: string;
  attachments: Attachment[];
}

/**
 * Analysis data containing email information
 */
export interface AnalysisData {
  headers: Record<string, string>;
  body?: string;
  attachments: Attachment[];
  parts?: EmailPart[];
}

/**
 * Result of prompt building operation
 */
export type PromptBuilderResult = string;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a part has nested parts
 */
function hasNestedParts(part: EmailPart): part is EmailPart & { parts: EmailPart[] } {
  return part.parts !== undefined && part.parts.length > 0;
}

/**
 * Type guard to check if a part is a plain text body
 */
function isPlainTextBody(part: EmailPart): boolean {
  return part.contentType === 'text/plain' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an HTML body
 */
function isHtmlBody(part: EmailPart): boolean {
  return part.contentType === 'text/html' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an attachment
 */
function isAttachment(part: EmailPart): boolean {
  return part.isAttachment || part.name !== undefined;
}

// ============================================================================
// Email Parsing Functions
// ============================================================================

/**
 * Recursively parses email parts to extract text content and attachments
 * @param parts - Array of email parts to parse
 * @returns Parsed email with body and attachments
 */
export function findEmailParts(parts: ReadonlyArray<EmailPart>): ParsedEmail {
  let textBody = '';
  let htmlBody = '';
  const attachments: Attachment[] = [];

  logger.debug('Parsing email parts...');

  /**
   * Recursively processes nested email parts
   */
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

  // Convert HTML to plain text if available, otherwise use text body
  const finalBody: string = htmlBody ? convertHtmlToText(htmlBody) : textBody;

  return { body: finalBody, attachments };
}

/**
 * Converts HTML content to plain text
 * @param html - HTML string to convert
 * @returns Plain text representation of the HTML
 */
function convertHtmlToText(html: string): string {
  return htmlToText(html, { wordwrap: 130 });
}

// ============================================================================
// Prompt Building Functions
// ============================================================================

/**
 * Builds a prompt for AI analysis with proper context limit handling
 * @param structuredData - Structured email data including headers, body, and attachments
 * @param customTags - Array of custom tag configurations
 * @returns Constructed prompt string for AI analysis
 */
export function buildPrompt(
  structuredData: StructuredEmailData,
  customTags: CustomTags
): PromptBuilderResult {
  // Serialize headers and attachments to JSON
  const headersJSON: string = JSON.stringify(structuredData.headers, null, 2);
  const attachmentsJSON: string = JSON.stringify(structuredData.attachments, null, 2);

  // Build custom instructions from tags
  const customInstructions: string = customTags
    .map((tag) => `- ${tag.key}: (boolean) ${tag.prompt}`)
    .join('\n');

  // Combine base prompt with custom instructions
  const fullInstructions: string = `${PROMPT_BASE}\n${customInstructions}`;

  // Calculate frame size (prompt without email body)
  const frameSize: number = fullInstructions
    .replace('{headers}', headersJSON)
    .replace('{body}', '')
    .replace('{attachments}', attachmentsJSON).length;

  // Calculate remaining space for email body
  const maxBodyLength: number = CONTEXT_CHAR_LIMIT - frameSize;
  let emailBody: string = structuredData.body;

  // Truncate body if it exceeds available space
  if (emailBody.length > maxBodyLength) {
    logger.warn('Body length exceeds remaining space, truncating', {
      bodyLength: emailBody.length,
      maxBodyLength,
    });
    emailBody = truncateText(emailBody, maxBodyLength);
  }

  // Build final prompt with truncated body
  const finalPrompt: string = fullInstructions
    .replace('{headers}', headersJSON)
    .replace('{body}', emailBody)
    .replace('{attachments}', attachmentsJSON);

  // Hard cut if prompt still exceeds limit (should not happen with proper truncation)
  if (finalPrompt.length > CONTEXT_CHAR_LIMIT) {
    logger.error('Final prompt still too long, hard cutting', {
      promptLength: finalPrompt.length,
      limit: CONTEXT_CHAR_LIMIT,
    });
    return finalPrompt.substring(0, CONTEXT_CHAR_LIMIT);
  }

  return finalPrompt;
}

/**
 * Truncates text to specified length
 * @param text - Text to truncate
 * @param maxLength - Maximum length of the output text
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength);
}

