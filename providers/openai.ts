import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { retryWithBackoff, validateLLMResponse, logger, maskApiKey } from './utils';

// ============================================================================
// OPENAI API TYPES
// ============================================================================

/**
 * OpenAI API message role
 */
export type OpenAIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * OpenAI API message interface
 */
export interface OpenAIMessage {
  role: OpenAIMessageRole;
  content: string;
}

/**
 * OpenAI API response format type
 */
export type OpenAIResponseType = 'text' | 'json_object';

/**
 * OpenAI API response format interface
 */
export interface OpenAIResponseFormat {
  type: OpenAIResponseType;
}

/**
 * OpenAI API chat completion request
 */
export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  response_format?: OpenAIResponseFormat;
}

/**
 * OpenAI API usage statistics
 */
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * OpenAI API choice message
 */
export interface OpenAIChoiceMessage {
  role: OpenAIMessageRole;
  content: string;
}

/**
 * OpenAI API choice interface
 */
export interface OpenAIChoice {
  index: number;
  message: OpenAIChoiceMessage;
  finish_reason: string | null;
}

/**
 * OpenAI API chat completion response
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
}

/**
 * OpenAI API error response
 */
export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for OpenAI chat completion response
 */
export function isOpenAIChatCompletionResponse(
  response: unknown
): response is OpenAIChatCompletionResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'choices' in response &&
    Array.isArray((response as OpenAIChatCompletionResponse).choices) &&
    (response as OpenAIChatCompletionResponse).choices.length > 0 &&
    typeof (response as OpenAIChatCompletionResponse).choices[0] === 'object' &&
    (response as OpenAIChatCompletionResponse).choices[0] !== null &&
    'message' in (response as OpenAIChatCompletionResponse).choices[0]
  );
}

/**
 * Type guard for OpenAI error response
 */
export function isOpenAIErrorResponse(response: unknown): response is OpenAIErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as OpenAIErrorResponse).error === 'object' &&
    (response as OpenAIErrorResponse).error !== null
  );
}

/**
 * Type guard to check if a value is a record (non-null object)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for parsed LLM response object
 */
function isParsedResponse(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

/**
 * Type guard to check if a value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if fetch response is ok
 */
function isOkResponse(response: Response): response is Response & { ok: true } {
  return response.ok;
}

/**
 * Type guard to check if an error has a message property
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions" as const;
const OPENAI_MODEL = "gpt-4o" as const;
const DEFAULT_TIMEOUT = 30000 as const;

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Fetches a URL with timeout support using AbortController
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the fetch response
 * @throws {Error} If the fetch fails or times out
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
// OPENAI API FUNCTIONS
// ============================================================================

/**
 * Function signature for analyzing email with OpenAI
 */
export type AnalyzeEmailInput = {
  settings: Pick<ProviderConfig, 'openaiApiKey'>;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
};

/**
 * Output type for email analysis
 */
export type AnalyzeEmailOutput = ReturnType<typeof validateLLMResponse>;

/**
 * Analyzes an email using OpenAI's GPT-4o model
 *
 * This function sends email data to OpenAI's API for analysis, using the
 * chat completions endpoint with JSON response format. It implements retry
 * logic with exponential backoff for transient failures.
 *
 * @param settings - Provider settings containing the OpenAI API key
 * @param structuredData - Email data including headers, body, and attachments
 * @param customTags - Array of custom tag configurations for analysis
 * @returns Promise resolving to validated LLM response, or null on error
 *
 * @example
 * const result = await analyzeWithOpenAI(
 *   { openaiApiKey: 'sk-...' },
 *   { headers: {...}, body: '...', attachments: [...] },
 *   [{ key: 'urgent', name: 'Urgent', color: '#FF0000', prompt: '...' }]
 * );
 */
export async function analyzeWithOpenAI(
  settings: AnalyzeEmailInput['settings'],
  structuredData: AnalyzeEmailInput['structuredData'],
  customTags: AnalyzeEmailInput['customTags']
): Promise<AnalyzeEmailOutput | null> {
  const prompt = buildPrompt(structuredData, customTags);
  const { openaiApiKey } = settings;

  if (!isNonEmptyString(openaiApiKey)) {
    logger.error("OpenAI Error: API key is not set.");
    return null;
  }

  try {
    const response = await retryWithBackoff<Response>(async (): Promise<Response> => {
      const requestPayload: OpenAIChatCompletionRequest = {
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' }
      };

      const res = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify(requestPayload)
        },
        DEFAULT_TIMEOUT
      );

      if (!isOkResponse(res)) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }

      return res;
    });

    const result: unknown = await response.json();

    if (!isOpenAIChatCompletionResponse(result)) {
      if (isOpenAIErrorResponse(result)) {
        logger.error('OpenAI API returned an error response', {
          error: result.error.message,
          type: result.error.type
        });
      }
      throw new Error('Invalid response format from OpenAI API');
    }

    const content = result.choices[0]?.message?.content;
    if (!isNonEmptyString(content)) {
      throw new Error('Invalid response format: missing content');
    }

    const parsedResponse: unknown = JSON.parse(content);

    if (!isParsedResponse(parsedResponse)) {
      throw new Error('Invalid response format: parsed response is not an object');
    }

    return validateLLMResponse(parsedResponse);
  } catch (error) {
    const errorMessage = isErrorWithMessage(error) ? error.message : String(error);
    logger.error('OpenAI Error', {
      error: errorMessage,
      apiKey: maskApiKey(openaiApiKey)
    });
    return null;
  }
}
