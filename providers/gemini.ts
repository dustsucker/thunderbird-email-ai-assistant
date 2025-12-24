import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { retryWithBackoff, validateLLMResponse, logger, maskApiKey, TagResponse } from './utils';

// ============================================================================
// GEMINI API TYPES
// ============================================================================

/**
 * Gemini model identifier
 */
const GEMINI_MODEL: string = 'gemini-1.5-flash-latest';

/**
 * Gemini API text part
 */
interface GeminiContentPart {
  text: string;
}

/**
 * Gemini API content part
 */
interface GeminiContent {
  parts: GeminiContentPart[];
}

/**
 * Gemini API request body for generateContent
 */
interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  generationConfig: {
    response_mime_type: string;
  };
}

/**
 * Gemini API finish reason
 */
type GeminiFinishReason = 'FINISH_REASON_UNSPECIFIED' | 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';

/**
 * Gemini API content in response
 */
interface GeminiResponseContent {
  parts: GeminiContentPart[];
  role?: string;
}

/**
 * Gemini API candidate response
 */
interface GeminiCandidate {
  content?: GeminiResponseContent;
  finishReason: GeminiFinishReason;
  index?: number;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

/**
 * Gemini API usage metadata
 */
interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

/**
 * Gemini API generateContent response
 */
interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

/**
 * Fetch with timeout support
 * @template T - Expected response type
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to Response
 * @throws {Error} If request times out or fails
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
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if value is a valid GeminiGenerateContentResponse
 */
function isGeminiResponse(value: unknown): value is GeminiGenerateContentResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'candidates' in value
  );
}

/**
 * Type guard to check if candidate has valid content with text
 */
function hasValidText(candidate: GeminiCandidate): candidate is GeminiCandidate & {
  content: GeminiResponseContent;
} {
  return (
    candidate.content !== undefined &&
    candidate.content.parts !== undefined &&
    candidate.content.parts.length > 0 &&
    'text' in candidate.content.parts[0] &&
    typeof candidate.content.parts[0].text === 'string'
  );
}

/**
 * Type guard to check if response has error
 */
function isErrorResponse(value: unknown): value is { error: { code: number; message: string; status: string } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null
  );
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes email using Gemini AI API
 *
 * @template T - Expected analysis result type (defaults to TagResponse)
 * @param settings - Provider configuration containing API key
 * @param structuredData - Email data with headers, body, and attachments
 * @param customTags - Array of custom tag configurations
 * @returns Promise resolving to validated analysis result or null on error
 *
 * @example
 * const result = await analyzeWithGemini(settings, emailData, customTags);
 * if (result) {
 *   console.log('Tags:', result.tags);
 *   console.log('Confidence:', result.confidence);
 * }
 */
export async function analyzeWithGemini<T extends TagResponse = TagResponse>(
  settings: Pick<ProviderConfig, 'geminiApiKey'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<T | null> {
  const prompt: string = buildPrompt(structuredData, customTags);
  const { geminiApiKey } = settings;

  // Validate API key presence
  if (!geminiApiKey) {
    logger.error('Gemini Error: API key is not set.');
    return null;
  }

  const apiUrl: string = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

  try {
    // Prepare request body
    const requestBody: GeminiGenerateContentRequest = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json'
      }
    };

    // Fetch with retry logic
    const response: Response = await retryWithBackoff(async (): Promise<Response> => {
      const res: Response = await fetchWithTimeout(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        },
        30000
      );

      // Check for HTTP errors
      if (!res.ok) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }

      return res;
    });

    // Parse response
    const result: unknown = await response.json();

    // Check for API-level errors
    if (isErrorResponse(result)) {
      throw new Error(
        `Gemini API Error: ${result.error.message} (code: ${result.error.code}, status: ${result.error.status})`
      );
    }

    // Validate response structure
    if (!isGeminiResponse(result)) {
      throw new Error('Invalid response format: missing candidates field');
    }

    // Extract text from first candidate
    const candidate: GeminiCandidate | undefined = result.candidates?.[0];
    if (!candidate) {
      throw new Error('Invalid response format: no candidates returned');
    }

    if (!hasValidText(candidate)) {
      throw new Error('Invalid response format: missing text content');
    }

    const text: string = candidate.content.parts[0].text;

    // Parse JSON from text response
    const parsedResponse: unknown = JSON.parse(text);

    // Validate against schema
    return validateLLMResponse(parsedResponse) as T;
  } catch (error) {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    logger.error('Gemini Error', {
      error: errorMessage,
      apiKey: maskApiKey(geminiApiKey)
    });
    return null;
  }
}
