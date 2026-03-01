import { PROMPT_BASE, CustomTags, HARDCODED_TAGS, type Tag } from './config';
import { logger } from '../src/infrastructure/providers/ProviderUtils';
import type {
  EmailPart,
  Attachment,
  ParsedEmail,
  StructuredEmailData,
  AnalysisData,
  PromptBuilderResult,
} from '../src/shared/types/EmailPart';
import {
  hasNestedParts,
  isPlainTextBody,
  isHtmlBody,
  isAttachment,
  convertHtmlToText,
} from '../src/shared/utils/emailPartUtils';

// Re-export types for backward compatibility
export type {
  EmailPart,
  Attachment,
  ParsedEmail,
  StructuredEmailData,
  AnalysisData,
  PromptBuilderResult,
};

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

// ============================================================================
// Prompt Building Functions
// ============================================================================

/**
 * Builds a prompt for AI analysis with proper context limit handling
 * @param structuredData - Structured email data including headers, body, and attachments
 * @param customTags - Array of custom tag configurations
 * @returns Object containing constructed prompt and all tags description
 */
export function buildPrompt(
  structuredData: StructuredEmailData,
  customTags: CustomTags
): PromptBuilderResult {
  // 1. Alle Tags sammeln und mergen
  const hardcodedTagsAsArray: Tag[] = Object.values(HARDCODED_TAGS);
  const allTags = [...hardcodedTagsAsArray, ...customTags];

  // 2. Tag-Definitionen als Text-Format generieren (NICHT als JSON!)
  const tagNamesList: string = allTags.map((tag) => tag.key).join(', ');

  const instructionsText: string = `

=== AVAILABLE TAGS ===
The following tags are available: ${tagNamesList}

=== TAG DEFINITIONS ===
${allTags.map((tag) => `${tag.key}: ${tag.prompt || 'custom tag'}`).join('\n')}

### INSTRUCTIONS
Based on the data above, return a JSON object with:
- tags: array of tag keys where the check is true
- confidence: number (0.0-1.0)
- reasoning: brief explanation

IMPORTANT: Return ONLY the JSON object, not the individual tag values!
`;

  // 3. Headers und Attachments JSON
  const headersJSON: string = JSON.stringify(structuredData.headers, null, 2);
  const attachmentsJSON: string = JSON.stringify(structuredData.attachments, null, 2);

  // 4. Platzhalter ersetzen
  const finalPrompt: string = `${PROMPT_BASE}\n${instructionsText}`
    .replace('{headers}', headersJSON)
    .replace('{body}', structuredData.body)
    .replace('{attachments}', attachmentsJSON);

  // 5. Debug-Log hinzufügen
  logger.debug('[DEBUG-PROMPT] Generated prompt:', {
    tagDefinitionsCount: allTags.length,
    promptLength: finalPrompt.length,
  });

  return {
    prompt: finalPrompt,
    allTagsDescription: tagNamesList,
  };
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
