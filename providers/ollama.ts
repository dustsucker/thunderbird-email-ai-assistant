/**
 * Ollama provider implementation for email analysis
 * @module providers/ollama
 */

import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, Provider, CustomTags } from '../core/config';
import { retryWithBackoff, validateLLMResponse, logger, TagResponse, LoggerContext } from './utils';

// ============================================================================
// OLLAMA API TYPE DEFINITIONS
// ============================================================================

/**
 * Request body for Ollama generate API endpoint
 */
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  format: 'json';
  stream: false;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

/**
 * Response body from Ollama generate API endpoint
 */
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama API error response
 */
export interface OllamaErrorResponse {
  error: string;
  status?: number;
}

/**
 * Type guard for Ollama generate response
 */
export function isOllamaGenerateResponse(data: unknown): data is OllamaGenerateResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'response' in data &&
    'done' in data &&
    typeof (data as { response: unknown }).response === 'string' &&
    typeof (data as { done: unknown }).done === 'boolean'
  );
}

/**
 * Type guard for Ollama error response
 */
export function isOllamaErrorResponse(data: unknown): data is OllamaErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

/**
 * Union type for all possible Ollama API responses
 */
export type OllamaApiResponse = OllamaGenerateResponse | OllamaErrorResponse;

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Fetch wrapper with timeout support
 * @param url - The URL to fetch from
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the fetch response
 * @throws Error if timeout is reached or fetch fails
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
// OLLAMA PROVIDER SETTINGS
// ============================================================================

/**
 * Ollama-specific settings subset from ProviderConfig
 */
export interface OllamaSettings {
  ollamaApiUrl: string;
  ollamaModel: string;
}

/**
 * Type guard for Ollama settings
 */
export function isOllamaSettings(settings: Partial<ProviderConfig>): settings is OllamaSettings {
  return (
    typeof settings === 'object' &&
    settings !== null &&
    'ollamaApiUrl' in settings &&
    typeof (settings as { ollamaApiUrl: unknown }).ollamaApiUrl === 'string' &&
    'ollamaModel' in settings &&
    typeof (settings as { ollamaModel: unknown }).ollamaModel === 'string'
  );
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes an email using Ollama's local LLM API
 *
 * @param settings - Provider configuration containing Ollama API URL and model name
 * @param structuredData - Structured email data (headers, body, attachments)
 * @param customTags - Array of custom tag configurations for classification
 * @returns Promise resolving to validated tag response, or null on error
 *
 * @example
 * const settings: OllamaSettings = {
 *   ollamaApiUrl: 'http://localhost:11434/api/generate',
 *   ollamaModel: 'gemma3:27b'
 * };
 * const result = await analyzeWithOllama(settings, emailData, customTags);
 * if (result) {
 *   console.log('Tags:', result.tags, 'Confidence:', result.confidence);
 * }
 */
export async function analyzeWithOllama(
  settings: OllamaSettings,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  // Validate settings
  if (!isOllamaSettings(settings)) {
    logger.error('Invalid Ollama settings provided', { settings });
    return null;
  }

  const { ollamaApiUrl, ollamaModel } = settings;

  // Build the prompt for email analysis
  const prompt: string = buildPrompt(structuredData, customTags);

  try {
    // Prepare the request body
    const requestBody: OllamaGenerateRequest = {
      model: ollamaModel,
      prompt: prompt,
      format: 'json',
      stream: false,
    };

    // Execute API call with retry logic
    const result: OllamaGenerateResponse = await retryWithBackoff(async () => {
      const response = await fetchWithTimeout(ollamaApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      // Validate response structure
      if (isOllamaErrorResponse(data)) {
        throw new Error(`Ollama API error: ${data.error}`);
      }

      if (!isOllamaGenerateResponse(data)) {
        throw new Error('Invalid response structure from Ollama API');
      }

      return data;
    });

    // Extract the raw text response
    const rawText: string = result.response;

    // Validate and parse the LLM response
    const validatedResponse: TagResponse = validateLLMResponse(rawText);

    logger.info('Ollama analysis completed successfully', {
      url: ollamaApiUrl,
      model: ollamaModel,
      tags: validatedResponse.tags,
      confidence: validatedResponse.confidence,
    });

    return validatedResponse;
  } catch (error) {
    // Extract error details for logging
    const errorContext: LoggerContext = {
      url: ollamaApiUrl,
      model: ollamaModel,
      error: error instanceof Error ? error.message : String(error),
    };

    // Add error stack if available
    if (error instanceof Error && error.stack) {
      errorContext.stack = error.stack;
    }

    logger.error('Ollama Error', errorContext);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates if a URL is a valid localhost Ollama endpoint
 * @param url - The URL to validate
 * @returns True if the URL is a valid localhost Ollama endpoint
 */
export function isValidOllamaUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname === '127.0.0.1' ||
        parsedUrl.hostname === '::1') &&
      parsedUrl.pathname.endsWith('/api/generate')
    );
  } catch {
    return false;
  }
}

/**
 * Gets the default Ollama API URL
 * @returns Default Ollama API URL for localhost
 */
export function getDefaultOllamaUrl(): string {
  return 'http://localhost:11434/api/generate';
}

/**
 * Gets the default Ollama model
 * @returns Default Ollama model name
 */
export function getDefaultOllamaModel(): string {
  return 'gemma3:27b';
}
