// ============================================================================
// Prompt Constants - AI Analysis Prompt Templates
// ============================================================================
// Migrated from core/config.ts - Single Source of Truth for prompt constants
// ============================================================================

// ============================================================================
// Prompt Instructions Template
// ============================================================================

/**
 * Base instructions for the AI analysis prompt.
 * Uses placeholders: {headers}, {body}, {attachments}
 */
const PROMPT_INSTRUCTIONS: ReadonlyArray<string> = [
  'Hi, I like you to check and score an email based on the following structured data. Please respond as a single, clean JSON object with the specified properties.',
  '',
  '### Email Headers',
  '```json',
  '{headers}',
  '```',
  '',
  '### Email Body (converted from HTML to plain text)',
  '```text',
  '{body}',
  '```',
  '',
  '### Attachments',
  '```json',
  '{attachments}',
  '```',
  '',
  '### DEFINED TAGS - YOU MUST USE ONLY THESE',
  'You MUST ONLY use tags from the list below. Do NOT invent or create new tags!',
  '',
] as const;

/**
 * Base prompt template with placeholders.
 * Combine with tag definitions for the complete prompt.
 */
export const PROMPT_BASE: string = PROMPT_INSTRUCTIONS.join('\n');
