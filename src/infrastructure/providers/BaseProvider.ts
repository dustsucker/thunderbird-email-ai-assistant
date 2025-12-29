import { buildPrompt, StructuredEmailData } from '../../../core/analysis';
import type { CustomTags } from '../../../core/config';
import {
  retryWithBackoff,
  validateLLMResponse,
  logger,
  maskApiKey,
  TagResponse as UtilsTagResponse,
} from './ProviderUtils';

export type TagResponse = UtilsTagResponse;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Base settings interface for all providers
 * Specific providers can extend this with their own properties
 */
export interface BaseProviderSettings {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
}

/**
 * Generic request body type for provider API calls
 * Specific providers can have more structured types
 */
export type RequestBody = Record<string, unknown>;

/**
 * Generic provider response type
 * Specific providers can have more structured types
 */
export type ProviderResponse = unknown;

/**
 * Input parameters for analyze method
 */
export interface AnalyzeInput {
  settings: BaseProviderSettings;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
  signal?: AbortSignal;
}

/**
 * Output type for analyze method
 * Note: analyze() now throws errors instead of returning null
 */
export type AnalyzeOutput = TagResponse;

/**
 * HTTP headers for API requests
 */
export type HttpHeaders = Record<string, string>;

/**
 * Fetch options for API requests
 */
export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: HttpHeaders;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_TIMEOUT = 300000 as const;
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  factor: 2,
  jitter: 0.5,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetches a URL with timeout support using AbortController
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to the fetch response
 * @throws {Error} If the fetch fails or times out
 */
async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {},
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

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

/**
 * Checks if an HTTP response is OK (status 200-299)
 * @param response - The fetch response
 * @returns True if the response is OK
 */
function isOkResponse(response: Response): response is Response & { ok: true } {
  return response.ok;
}

// ============================================================================
// ABSTRACT BASE PROVIDER CLASS
// ============================================================================

/**
 * Abstract base class for all AI providers
 * Implements common functionality for email analysis with retry logic,
 * error handling, and response validation
 */
export abstract class BaseProvider {
  protected readonly timeout: number;
  protected readonly retryConfig: Readonly<typeof DEFAULT_RETRY_CONFIG>;

  constructor(timeout: number = DEFAULT_TIMEOUT) {
    this.timeout = timeout;
    this.retryConfig = DEFAULT_RETRY_CONFIG;
  }

  // ========================================================================
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ========================================================================

  /**
   * Returns the API URL for the provider
   */
  protected abstract getApiUrl(): string;

  /**
   * Builds the request body for the API call
   * @param settings - Provider settings
   * @param prompt - The analysis prompt
   * @param structuredData - Email data
   * @param customTags - Custom tag configurations
   * @returns Request body for the API call
   */
  protected abstract buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): RequestBody;

  /**
   * Parses the provider response into a TagResponse
   * @param response - Raw provider response
   * @returns Parsed and validated tag response
   */
  protected abstract parseResponse(response: ProviderResponse): TagResponse;

  /**
   * Validates provider-specific settings
   * @param settings - Provider settings to validate
   * @returns True if settings are valid
   */
  public abstract validateSettings(settings: BaseProviderSettings): boolean;

  // ========================================================================
  // TEMPLATE METHODS (can be overridden by subclasses)
  // ========================================================================

  /**
   * Extracts the API key from provider settings
   * Default implementation uses settings.apiKey
   * Override for providers with custom key names (e.g., openaiApiKey, zaiApiKey)
   * @param settings - Provider settings
   * @returns API key or undefined
   */
  protected getApiKey(settings: BaseProviderSettings): string | undefined {
    return settings.apiKey;
  }

  /**
   * Returns the HTTP header key for authentication
   * Default implementation returns 'Authorization'
   * Override for providers with different auth header (e.g., Claude uses 'x-api-key')
   * @returns Header key string
   */
  protected getAuthHeaderKey(): string {
    return 'Authorization';
  }

  /**
   * Formats the API key for the authentication header
   * Default implementation uses Bearer token format
   * Override for providers with different auth schemes
   * @param apiKey - The API key to format
   * @returns Formatted header value
   */
  protected formatAuthHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  /**
   * Returns additional provider-specific headers
   * Override to add custom headers (e.g., Claude's version headers)
   * @param settings - Provider settings
   * @returns Additional headers object
   */
  protected getAdditionalHeaders(_settings: BaseProviderSettings): HttpHeaders {
    return {};
  }

  // ========================================================================
  // COMMON UTILITY METHODS
  // ========================================================================

  /**
   * Builds the analysis prompt from structured email data
   * @param structuredData - Email data including headers, body, and attachments
   * @param customTags - Custom tag configurations
   * @returns Analysis prompt string
   */
  protected buildPrompt(structuredData: StructuredEmailData, customTags: CustomTags): string {
    return buildPrompt(structuredData, customTags);
  }

  /**
   * Validates the LLM response against the Tag schema
   * @param response - Raw LLM response (string or object)
   * @returns Validated tag response with fallback values
   */
  protected validateResponse(response: unknown): TagResponse {
    return validateLLMResponse(response);
  }

  /**
   * Logs an error message with API key masking
   * @param message - Error message
   * @param context - Additional context (apiKey will be masked if present)
   */
  protected logError(message: string, context: Record<string, unknown> = {}): void {
    const sanitizedContext: Record<string, unknown> = { ...context };
    if (sanitizedContext.apiKey) {
      sanitizedContext.apiKey = this.maskApiKey(sanitizedContext.apiKey as string);
    }
    logger.error(message, sanitizedContext);
  }

  /**
   * Logs an info message
   * @param message - Info message
   * @param context - Additional context
   */
  protected logInfo(message: string, context: Record<string, unknown> = {}): void {
    logger.info(message, context);
  }

  /**
   * Logs a debug message
   * @param message - Debug message
   * @param context - Additional context
   */
  protected logDebug(message: string, context: Record<string, unknown> = {}): void {
    logger.debug(message, context);
  }

  /**
   * Masks an API key for logging purposes
   * Shows first 7 and last 3 characters with ellipsis in between
   * @param key - The API key to mask
   * @returns Masked key string
   */
  protected maskApiKey(key: unknown): string | undefined {
    return maskApiKey(key);
  }

  /**
   * Gets the API headers for the request
   * Uses template methods for provider-specific authentication
   * @param settings - Provider settings
   * @returns HTTP headers object
   */
  protected getHeaders(settings: BaseProviderSettings): HttpHeaders {
    const headers: HttpHeaders = {
      'Content-Type': 'application/json',
    };

    // Add authentication header using template methods
    const apiKey = this.getApiKey(settings);
    if (apiKey) {
      headers[this.getAuthHeaderKey()] = this.formatAuthHeader(apiKey);
    }

    // Add provider-specific headers
    const additionalHeaders = this.getAdditionalHeaders(settings);
    Object.assign(headers, additionalHeaders);

    return headers;
  }

  // ========================================================================
  // REQUEST EXECUTION
  // ========================================================================

  /**
   * Executes the API request with retry logic and timeout handling
   * @param settings - Provider settings
   * @param requestBody - Request body to send
   * @returns Promise resolving to the API response
   * @throws {Error} If the request fails after all retries
   */
  protected async executeRequest(
    settings: BaseProviderSettings,
    requestBody: RequestBody,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const apiUrl = this.getApiUrl();
    const headers = this.getHeaders(settings);

    this.logDebug('Executing API request', {
      url: apiUrl,
      hasApiKey: !!this.getApiKey(settings),
      model: settings.model,
    });

    try {
      const response = await retryWithBackoff<Response>(async (): Promise<Response> => {
        const res = await fetchWithTimeout(
          apiUrl,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          },
          this.timeout,
          externalSignal
        );

        if (!isOkResponse(res)) {
          const errorText = await res.text().catch(() => 'Could not read error response');
          this.logError('API request failed', {
            status: res.status,
            statusText: res.statusText,
            error: errorText,
          });
          throw new Error(`API request failed: ${res.status} ${res.statusText}`);
        }

        return res;
      }, this.retryConfig);

      return response;
    } catch (error) {
      this.logError('Request execution failed', {
        error: error instanceof Error ? error.message : String(error),
        url: apiUrl,
      });
      throw error;
    }
  }

  // ========================================================================
  // PUBLIC ENTRY POINT
  // ========================================================================

  /**
   * Analyzes an email using the AI provider
   * This is the main entry point for email analysis
   * @param input - Analysis input parameters
   * @returns Promise resolving to validated tag response, or null on error
   */
  public async analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const { settings, structuredData, customTags, signal } = input;

    try {
      this.logInfo('Starting email analysis', {
        hasBody: !!structuredData.body,
        attachmentCount: structuredData.attachments.length,
        tagCount: customTags.length,
        model: settings.model,
      });

      if (!this.validateSettings(settings)) {
        this.logError('Invalid provider settings', { settings });
        throw new Error('Invalid provider settings: Missing required API key or model');
      }

      const prompt = this.buildPrompt(structuredData, customTags);
      this.logDebug('Built analysis prompt', { promptLength: prompt.length });

      const requestBody = this.buildRequestBody(settings, prompt, structuredData, customTags);
      this.logDebug('Built request body');

      const response = await this.executeRequest(settings, requestBody, signal);
      const responseData = await response.json();

      this.logDebug('Parsing provider response');
      const parsedResponse = this.parseResponse(responseData);

      const validatedResponse = this.validateResponse(parsedResponse);

      this.logInfo('Email analysis completed', {
        tagCount: validatedResponse.tags.length,
        confidence: validatedResponse.confidence,
      });

      return validatedResponse;
    } catch (error) {
      this.logError('Email analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Re-throw the error with context
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }
}
