import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { retryWithBackoff, validateLLMResponse, logger, maskApiKey, TagResponse } from '../src/infrastructure/providers/ProviderUtils';
import { CustomTags } from '../core/config';
import { ANALYSIS_SYSTEM_PROMPT } from '../src/shared/constants/ProviderConstants';

// ============================================================================
// DEEPSEEK API TYPES
// ============================================================================

/**
 * Message role in DeepSeek API
 */
export type DeepSeekMessageRole = 'system' | 'user' | 'assistant';

/**
 * Chat message for DeepSeek API
 */
export interface DeepSeekMessage {
  role: DeepSeekMessageRole;
  content: string;
}

/**
 * DeepSeek API request body
 */
export interface DeepSeekApiRequest {
  model: string;
  messages: DeepSeekMessage[];
  stream: boolean;
}

/**
 * Message in DeepSeek API response
 */
export interface DeepSeekResponseMessage {
  role: string;
  content: string;
}

/**
 * Choice in DeepSeek API response
 */
export interface DeepSeekChoice {
  index: number;
  message: DeepSeekResponseMessage;
  finish_reason: string;
}

/**
 * Usage information in DeepSeek API response
 */
export interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * DeepSeek API response
 */
export interface DeepSeekApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: DeepSeekUsage;
}

/**
 * Settings configuration required for DeepSeek analysis
 */
export interface DeepSeekSettings {
  deepseekApiKey: string;
}

/**
 * Input parameters for analyzeWithDeepseek function
 */
export interface AnalyzeDeepseekInput {
  settings: DeepSeekSettings;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
}

/**
 * Result type for analyzeWithDeepseek function
 */
export type AnalyzeDeepseekResult = TagResponse | null;

// ============================================================================
// CONSTANTS
// ============================================================================

const DEEPSEEK_API_URL: string = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL: string = 'deepseek-chat';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if unknown data is a DeepSeekApiResponse
 * Validates the structure of the API response
 */
function isDeepSeekApiResponse(data: unknown): data is DeepSeekApiResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof data.id === 'string' &&
    'object' in data &&
    typeof data.object === 'string' &&
    'created' in data &&
    typeof data.created === 'number' &&
    'model' in data &&
    typeof data.model === 'string' &&
    'choices' in data &&
    Array.isArray(data.choices) &&
    data.choices.length > 0 &&
    typeof data.choices[0] === 'object' &&
    data.choices[0] !== null &&
    'message' in data.choices[0] &&
    typeof data.choices[0].message === 'object' &&
    data.choices[0].message !== null &&
    'content' in data.choices[0].message &&
    typeof data.choices[0].message.content === 'string' &&
    'usage' in data &&
    typeof data.usage === 'object' &&
    data.usage !== null &&
    'total_tokens' in data.usage &&
    typeof data.usage.total_tokens === 'number'
  );
}

/**
 * Type guard to check if unknown data is a DeepSeekSettings object
 */
export function isDeepSeekSettings(settings: unknown): settings is DeepSeekSettings {
  return (
    typeof settings === 'object' &&
    settings !== null &&
    'deepseekApiKey' in settings &&
    typeof (settings as DeepSeekSettings).deepseekApiKey === 'string'
  );
}

/**
 * Type guard to check if unknown data is an AnalyzeDeepseekInput object
 */
export function isAnalyzeDeepseekInput(input: unknown): input is AnalyzeDeepseekInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'settings' in input &&
    'structuredData' in input &&
    'customTags' in input &&
    isDeepSeekSettings((input as AnalyzeDeepseekInput).settings) &&
    typeof (input as AnalyzeDeepseekInput).structuredData === 'object' &&
    typeof (input as AnalyzeDeepseekInput).customTags === 'object'
  );
}

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Fetches a URL with timeout support using AbortController
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (RequestInit)
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the fetch Response
 * @throws {Error} If the timeout is exceeded or fetch fails
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 30000
): Promise<Response> {
  const controller: AbortController = new AbortController();
  const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), timeout);

  try {
    const response: Response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes email data using the DeepSeek API
 *
 * This function:
 * 1. Builds a prompt from the structured email data and custom tags
 * 2. Validates the API key presence
 * 3. Makes a POST request to the DeepSeek API with retry logic
 * 4. Extracts and validates the response
 * 5. Returns the parsed tag response or null on error
 *
 * @param settings - Application settings containing the DeepSeek API key
 * @param structuredData - Structured email data with headers, body, and attachments
 * @param customTags - Array of custom tag configurations for analysis
 * @returns Promise resolving to validated TagResponse or null on failure
 *
 * @example
 * ```typescript
 * const result = await analyzeWithDeepseek(
 *   { deepseekApiKey: 'your-api-key' },
 *   { headers: {...}, body: '...', attachments: [...] },
 *   [{ key: 'is_work', name: 'Work', color: '#FF0000' }]
 * );
 * if (result) {
 *   console.log('Tags:', result.tags);
 *   console.log('Confidence:', result.confidence);
 * }
 * ```
 */
export async function analyzeWithDeepseek(
  settings: DeepSeekSettings,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<AnalyzeDeepseekResult> {
  // Build the prompt from structured email data and custom tags
  const prompt: string = buildPrompt(structuredData, customTags);
  const { deepseekApiKey }: DeepSeekSettings = settings;

  // Validate API key presence
  if (!deepseekApiKey) {
    logger.error('DeepSeek Error: API key is not set.');
    return null;
  }

  try {
    // Make API request with retry logic
    const response: Response = await retryWithBackoff(async (): Promise<Response> => {
      const res: Response = await fetchWithTimeout(
        DEEPSEEK_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deepseekApiKey}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: [
              {
                role: 'system',
                content: ANALYSIS_SYSTEM_PROMPT,
              },
              { role: 'user', content: prompt },
            ],
            stream: false,
          } as DeepSeekApiRequest),
        },
        30000
      );

      // Check for HTTP errors
      if (!res.ok) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }

      return res;
    });

    // Parse and validate response
    const result: unknown = await response.json();

    // Validate response structure with type guard
    if (!isDeepSeekApiResponse(result)) {
      throw new Error('Invalid API response structure');
    }

    // Extract content from response
    const rawText: string | undefined = result.choices?.[0]?.message?.content;
    if (!rawText) {
      throw new Error('Invalid response format: missing content');
    }

    // Validate and parse LLM response
    return validateLLMResponse(rawText);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('DeepSeek Error', {
      error: errorMessage,
      apiKey: maskApiKey(deepseekApiKey),
    });
    return null;
  }
}

/**
 * Analyzes email data using DeepSeek with input object parameter
 * Convenience function accepting a single input object
 *
 * @param input - Input object containing settings, structuredData, and customTags
 * @returns Promise resolving to validated TagResponse or null on failure
 */
export async function analyzeEmail(input: AnalyzeDeepseekInput): Promise<AnalyzeDeepseekResult> {
  return analyzeWithDeepseek(input.settings, input.structuredData, input.customTags);
}
