// ============================================================================
// Legacy Analysis Module - DEPRECATED
// ============================================================================
/**
 * @deprecated This module is deprecated. Import from the new locations:
 *
 * - Email types: `import type { EmailPart, Attachment, ParsedEmail, StructuredEmailData, AnalysisData, PromptBuilderResult } from '@/shared/types/EmailPart'`
 * - Email utilities: `import { hasNestedParts, isPlainTextBody, isHtmlBody, isAttachment, convertHtmlToText } from '@/shared/utils/emailPartUtils'`
 * - Prompt builder: `import { buildPrompt, truncateText } from '@/infrastructure/providers/PromptBuilder'`
 *
 * This file will be removed in a future version.
 */
// ============================================================================

// Re-export types from new location
export type {
  EmailPart,
  Attachment,
  ParsedEmail,
  StructuredEmailData,
  AnalysisData,
  PromptBuilderResult,
} from '../src/shared/types/EmailPart';

// Re-export functions from new location
export { buildPrompt, truncateText } from '../src/infrastructure/providers/PromptBuilder';
