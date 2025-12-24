import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { retryWithBackoff, validateLLMResponse, logger, maskApiKey } from './utils';

const ZAI_PAAS_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZAI_CODING_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MODEL = 'glm-4.5';
const DEFAULT_VARIANT: 'paas' | 'coding' = 'paas';

type ZaiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface ZaiMessage {
  role: ZaiMessageRole;
  content: string;
}

interface ZaiThinking {
  type: 'enabled' | 'disabled';
}

interface ZaiChatCompletionRequest {
  model: string;
  messages: ZaiMessage[];
  thinking?: ZaiThinking;
  temperature?: number;
  max_tokens?: number;
}

interface ZaiChoiceMessage {
  role: ZaiMessageRole;
  content: string;
}

interface ZaiChoice {
  index: number;
  message: ZaiChoiceMessage;
  finish_reason: string | null;
}

interface ZaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ZaiChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ZaiChoice[];
  usage: ZaiUsage;
}

interface ZaiErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
}

// ============================================================================
// Dynamic Model Fetching
// ============================================================================

let cachedModels: string[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 Stunde

/**
 * Fetches available models from z.ai API
 * Uses caching to avoid unnecessary API calls
 */
export async function fetchZaiModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  // Check cache
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedModels;
  }

  try {
    const url = baseUrl || 'https://api.z.ai/api/paas/v4/models';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    // Parse OpenAI-kompatibles Format
    const models = data.data?.map((m: any) => m.id) || [];

    // Cache results
    cachedModels = models;
    cacheTimestamp = Date.now();

    return models;
  } catch (error) {
    console.warn('Failed to fetch z.ai models, using fallback:', error);
    // Fallback auf hardcoded Liste
    const FALLBACK_MODELS = [
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-x',
      'glm-4.5-airx',
      'glm-4.5-flash'
    ];
    return FALLBACK_MODELS;
  }
}

export type ZaiVariant = 'paas' | 'coding';

export type ZaiSettings = {
  zaiApiKey: string;
  zaiBaseUrl?: string;
  zaiModel?: string;
  zaiVariant?: ZaiVariant;
};

function isZaiChatCompletionResponse(response: unknown): response is ZaiChatCompletionResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'choices' in response &&
    Array.isArray((response as ZaiChatCompletionResponse).choices) &&
    (response as ZaiChatCompletionResponse).choices.length > 0 &&
    typeof (response as ZaiChatCompletionResponse).choices[0] === 'object' &&
    (response as ZaiChatCompletionResponse).choices[0] !== null &&
    'message' in (response as ZaiChatCompletionResponse).choices[0]
  );
}

function isZaiErrorResponse(response: unknown): response is ZaiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ZaiErrorResponse).error === 'object' &&
    (response as ZaiErrorResponse).error !== null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isParsedResponse(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOkResponse(response: Response): response is Response & { ok: true } {
  return response.ok;
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

function getZaiApiUrl(variant: ZaiVariant = 'paas', baseUrl?: string): string {
  if (baseUrl && isNonEmptyString(baseUrl)) {
    return baseUrl;
  }
  return variant === 'coding' ? ZAI_CODING_API_URL : ZAI_PAAS_API_URL;
}

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

export type AnalyzeWithZaiInput = {
  settings: ZaiSettings;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
};

export type AnalyzeWithZaiOutput = ReturnType<typeof validateLLMResponse>;

export async function analyzeWithZai(
  settings: ZaiSettings,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<AnalyzeWithZaiOutput | null> {
  const prompt = buildPrompt(structuredData, customTags);
  const { zaiApiKey, zaiBaseUrl, zaiModel = DEFAULT_MODEL, zaiVariant = DEFAULT_VARIANT } = settings;

  if (!isNonEmptyString(zaiApiKey)) {
    logger.error("Z.ai Error: API key is not set.");
    return null;
  }

  const apiUrl = getZaiApiUrl(zaiVariant, zaiBaseUrl);

  logger.debug('Z.ai API request details', {
    url: apiUrl,
    model: zaiModel,
    variant: zaiVariant,
    apiKey: maskApiKey(zaiApiKey),
  });

  try {
    const response = await retryWithBackoff<Response>(async (): Promise<Response> => {
      const requestPayload: ZaiChatCompletionRequest = {
        model: zaiModel,
        messages: [
          {
            role: 'system',
            content: 'You are an email analysis assistant that tags emails based on their content. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        thinking: { type: 'enabled' },
        temperature: 0.3,
        max_tokens: 4000
      };

      const res = await fetchWithTimeout(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${zaiApiKey}`
          },
          body: JSON.stringify(requestPayload)
        },
        DEFAULT_TIMEOUT
      );

      if (!isOkResponse(res)) {
        const errorBody = await res.text().catch(() => 'Unable to read error body');
        logger.error('Z.ai API request failed', {
          status: res.status,
          statusText: res.statusText,
          body: errorBody.substring(0, 500),
        });
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }

      return res;
    });

    const result: unknown = await response.json();

    if (!isZaiChatCompletionResponse(result)) {
      if (isZaiErrorResponse(result)) {
        logger.error('Z.ai API returned an error response', {
          error: result.error.message,
          type: result.error.type,
          param: result.error.param,
          code: result.error.code,
        });
      }
      throw new Error('Invalid response format from Z.ai API');
    }

    const content = result.choices[0]?.message?.content;
    if (!isNonEmptyString(content)) {
      throw new Error('Invalid response format: missing content');
    }

    const parsedResponse: unknown = JSON.parse(content);

    if (!isParsedResponse(parsedResponse)) {
      throw new Error('Invalid response format: parsed response is not an object');
    }

    logger.info('Z.ai analysis completed successfully', {
      model: result.model,
      usage: result.usage,
    });

    return validateLLMResponse(parsedResponse);
  } catch (error) {
    const errorMessage = isErrorWithMessage(error) ? error.message : String(error);
    logger.error('Z.ai Error', {
      error: errorMessage,
      apiKey: maskApiKey(zaiApiKey),
      model: zaiModel,
      variant: zaiVariant,
    });
    return null;
  }
}
