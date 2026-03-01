// ============================================================================
// Prompt Builder - AI Analysis Prompt Construction
// ============================================================================
// Migrated from core/analysis.ts
// Builds prompts for AI providers with proper tag context
// ============================================================================

import type { CustomTags, Tag } from '@/shared/types/TagTypes';
import type { StructuredEmailData, PromptBuilderResult } from '@/shared/types/EmailPart';
import { PROMPT_BASE } from '@/shared/constants/PromptConstants';
import { HARDCODED_TAGS } from '@/shared/constants/TagConstants';
import { logger } from './ProviderUtils';

// ============================================================================
// Prompt Building Functions
// ============================================================================

/**
 * Builds a prompt for AI analysis with proper context limit handling
 *
 * @param structuredData - Structured email data including headers, body, and attachments
 * @param customTags - Array of custom tag configurations
 * @returns Object containing constructed prompt and all tags description
 *
 * @example
 * const result = buildPrompt(structuredData, customTags);
 * const prompt = result.prompt;
 * const tagDescription = result.allTagsDescription;
 */
export function buildPrompt(
  structuredData: StructuredEmailData,
  customTags: CustomTags
): PromptBuilderResult {
  // 1. Collect and merge all tags
  const hardcodedTagsAsArray: Tag[] = Object.values(HARDCODED_TAGS);
  const allTags = [...hardcodedTagsAsArray, ...customTags];

  // 2. Generate tag definitions as text format (NOT as JSON!)
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

  // 3. Headers and attachments JSON
  const headersJSON: string = JSON.stringify(structuredData.headers, null, 2);
  const attachmentsJSON: string = JSON.stringify(structuredData.attachments, null, 2);

  // 4. Replace placeholders
  const finalPrompt: string = `${PROMPT_BASE}\n${instructionsText}`
    .replace('{headers}', headersJSON)
    .replace('{body}', structuredData.body)
    .replace('{attachments}', attachmentsJSON);

  // 5. Debug log
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
 *
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
