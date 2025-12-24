/**
 * Mistral AI provider implementation for email analysis
 * @module providers/mistral
 */

import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { AppConfig, CustomTags } from '../core/config';
import {
  retryWithBackoff,
  validateLLMResponse,
  logger,
  maskApiKey,
  TagResponse
} from './utils';

// ============================================================================
// MISTRAL API TYPES
// ============================================================================

/**
 * Mistral API message role types
 */
export type MistralMessageRole = 'system' | 'user' | 'assistant';

/**
 * Mistral API message interface
 */
export interface MistralMessage {
  role: MistralMessageRole;
  content: string;
}

/**
 * Mistral response format type
 */
export interface MistralResponseFormat {
  type: 'json_object' | 'text';
}

/**
 * Mistral API request body
 */
export interface MistralApiRequest {
  model: string;
  messages: MistralMessage[];
  response_format?: MistralResponseFormat;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

/**
 * Mistral API message choice
 */
export interface MistralChoice {
  index: number;
  message: {
    role: MistralMessageRole;
    content: string;
  };
  finish_reason: string;
}

/**
 * Mistral API usage information
 */
export interface MistralUsage {
  prompt_tokens: number;
  total_tokens: number;
  completion_tokens: number;
}

/**
 * Mistral API response
 */
export interface MistralApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: MistralChoice[];
  usage: MistralUsage;
}

/**
 * Mistral API error response
 */
export interface MistralApiErrorResponse {
  message: string;
  type: string;
  param?: string;
  code?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Mistral API endpoint URL
 */
const MISTRAL_API_URL: string = "https://api.mistral.ai/v1/chat/completions" as const;

/**
 * Default Mistral model to use
 */
const MISTRAL_MODEL: string = "mistral-large-latest" as const;

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT: number = 30000 as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an unknown value is a MistralApiResponse
 */
function isMistralApiResponse(value: unknown): value is MistralApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'choices' in value &&
    Array.isArray((value as MistralApiResponse).choices) &&
    (value as MistralApiResponse).choices.length > 0 &&
    'message' in (value as MistralApiResponse).choices[0] &&
    'content' in (value as MistralApiResponse).choices[0].message
  );
}

/**
 * Type guard to check if a response is an error response
 */
function isMistralErrorResponse(value: unknown): value is MistralApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'type' in value
  );
}

/**
 * Type guard for fetch Response with ok property
 */
function isFetchResponse(value: unknown): value is Response {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ok' in value &&
    'status' in value &&
    'json' in value &&
    typeof (value as Response).json === 'function'
  );
}

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Performs a fetch request with timeout support
 *
 * @param url - The URL to fetch from
 * @param options - Fetch options (method, headers, body, etc.)
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the fetch Response
 * @throws {Error} If timeout is reached or fetch fails
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
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
// ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes an email using the Mistral AI API
 *
 * @param settings - Application configuration including API keys
 * @param structuredData - Structured email data (headers, body, attachments)
 * @param customTags - Array of custom tag configurations for analysis
 * @returns Promise resolving to TagResponse or null on failure
 *
 * @example
 * const result = await analyzeWithMistral(settings, emailData, customTags);
 * if (result) {
 *   console.log('Tags:', result.tags);
 *   console.log('Confidence:', result.confidence);
 * }
 */
export async function analyzeWithMistral(
  settings: Pick<AppConfig, 'mistralApiKey'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  // Build prompt from email data and custom tags
  const prompt: string = buildPrompt(structuredData, customTags);
  const { mistralApiKey } = settings;

  // Validate API key
  if (!mistralApiKey) {
    logger.error("Mistral Error: API key is not set.");
    return null;
  }

  try {
    // Prepare request payload
    const requestBody: MistralApiRequest = {
      model: MISTRAL_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    };

    // Make API request with retry logic
    const response = await retryWithBackoff<Response>(async (): Promise<Response> => {
      return await fetchWithTimeout(
        MISTRAL_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify(requestBody),
        },
        DEFAULT_TIMEOUT
      );
    });

    // Validate response type
    if (!isFetchResponse(response)) {
      throw new Error('Invalid response type received from fetch');
    }

    // Check for HTTP errors
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    // Parse JSON response
    const result: unknown = await response.json();

    // Validate response structure
    if (!isMistralApiResponse(result)) {
      if (isMistralErrorResponse(result)) {
        throw new Error(`Mistral API error: ${result.message}`);
      }
      throw new Error('Invalid response structure from Mistral API');
    }

    // Extract content from first choice
    const rawText: string = result.choices[0].message.content;

    // Validate and return LLM response
    return validateLLMResponse(rawText);

  } catch (error) {
    // Log error with masked API key
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Mistral Error", {
      error: errorMessage,
      apiKey: maskApiKey(mistralApiKey)
    });
    return null;
  }
}
