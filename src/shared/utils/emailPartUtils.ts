import { htmlToText } from 'html-to-text';
import type { EmailPart } from '../types/EmailPart';

// ============================================================================
// Type Guards for EmailPart
// ============================================================================

/**
 * Type guard to check if a part has nested parts
 */
export function hasNestedParts(part: EmailPart): part is EmailPart & { parts: EmailPart[] } {
  return part.parts !== undefined && part.parts.length > 0;
}

/**
 * Type guard to check if a part is a plain text body
 */
export function isPlainTextBody(part: EmailPart): boolean {
  return part.contentType === 'text/plain' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an HTML body
 */
export function isHtmlBody(part: EmailPart): boolean {
  return part.contentType === 'text/html' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an attachment
 */
export function isAttachment(part: EmailPart): boolean {
  return part.isAttachment || part.name !== undefined;
}

// ============================================================================
// HTML Conversion
// ============================================================================

/**
 * Converts HTML content to plain text
 * @param html - HTML string to convert
 * @returns Plain text representation of the HTML
 */
export function convertHtmlToText(html: string): string {
  return htmlToText(html, { wordwrap: 130 });
}
