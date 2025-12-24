/**
 * Claude AI provider implementation for email analysis
 * @module providers/claude
 */

import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import {
  TagResponse,
  extractJson,
  retryWithBackoff,
  validateLLMResponse,
  logger,
  maskApiKey
} from './utils';

// ============================================================================
// CLAUDE API TYPES
// ============================================================================

/**
 * Claude message role
 */
export type ClaudeMessageRole = 'user' | 'assistant';

/**
 * Claude message content structure
 */
export interface ClaudeMessage {
  role: ClaudeMessageRole;
  content: string;
}

/**
 * Claude API request payload
 */
export interface ClaudeApiRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: ClaudeMessage[];
}

/**
 * Claude content block response
 */
export interface ClaudeContentBlock {
  type: 'text';
  text: string;
}

/**
 * Claude usage information
 */
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Claude API response structure
 */
export interface ClaudeApiResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: ClaudeUsage;
}

/**
 * Type guard for Claude API response
 */
function isClaudeApiResponse(value: unknown): value is ClaudeApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray((value as ClaudeApiResponse).content) &&
    'model' in value &&
    typeof (value as ClaudeApiResponse).model === 'string'
  );
}

/**
 * Type guard for value being a valid error
 */
function isErrorLike(value: unknown): value is { message: string; name?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-0";
const CLAUDE_API_VERSION = "2023-06-01";

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Fetches a URL with timeout support using AbortController
 * @param url - The URL to fetch
 * @param options - Request options
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to Response object
 * @throws {Error} If timeout occurs or request fails
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// ANALYZE WITH CLAUDE
// ============================================================================

/**
 * Analyzes email data using Claude AI API
 * @param settings - Provider configuration including API key
 * @param structuredData - Structured email data (headers, body, attachments)
 * @param customTags - Custom tag configurations
 * @returns Promise resolving to validated tag response, or null on failure
 */
export async function analyzeWithClaude(
  settings: Pick<ProviderConfig, 'claudeApiKey'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  const prompt = buildPrompt(structuredData, customTags);
  const { claudeApiKey } = settings;

  if (!claudeApiKey) {
    logger.error("Claude Error: API key is not set.");
    return null;
  }

  try {
    const response = await retryWithBackoff<Response>(async () => {
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-version': CLAUDE_API_VERSION
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: "You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.",
          messages: [
            { role: "user", content: prompt }
          ]
        } as ClaudeApiRequest)
      };

      return await fetchWithTimeout(CLAUDE_API_URL, requestOptions);
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("Claude API Error", {
        status: response.status,
        statusText: response.statusText,
        body: text
      });
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Validate Claude API response structure
    if (!isClaudeApiResponse(result)) {
      logger.error("Claude API returned invalid response structure", {
        result: JSON.stringify(result).substring(0, 200)
      });
      return null;
    }

    // Extract text from first content block
    const rawText = result.content[0]?.text;
    if (!rawText) {
      logger.error("Claude API response missing content text");
      return null;
    }

    // Parse and validate JSON response
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText) as unknown;

    return validateLLMResponse(parsed);
  } catch (error) {
    const errorMessage = isErrorLike(error) ? error.message : String(error);
    logger.error("Claude Error", {
      error: errorMessage,
      apiKey: maskApiKey(claudeApiKey)
    });
    return null;
  }
}
