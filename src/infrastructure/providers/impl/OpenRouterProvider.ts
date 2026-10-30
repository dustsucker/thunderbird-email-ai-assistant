import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import type { StructuredEmailData } from '@/shared/types/EmailPart'
import type { CustomTags } from '@/shared/types/TagTypes'
import { validateApiKeyFormat } from '@/shared/utils/loggingUtils';

interface OpenRouterResponseMessage {
  role: string;
  content: string;
}

interface OpenRouterChoice {
  index: number;
  message: OpenRouterResponseMessage;
  finish_reason: string;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  // OpenRouter adds cost fields (cost, prompt_tokens_details, ...) — ignored
  [key: string]: unknown;
}

interface OpenRouterApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenRouterChoice[];
  usage: OpenRouterUsage;
}

function isOpenRouterApiResponse(data: unknown): data is OpenRouterApiResponse {
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

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
const ANALYSIS_SYSTEM_PROMPT =
  'You are an AI email analysis assistant that analyzes emails and assigns tags.';

// Recommended OpenRouter attribution headers
const APP_URL = 'https://github.com/dustsucker/thunderbird-email-ai-assistant';
const APP_TITLE = 'Thunderbird Email AI Assistant';

@injectable()
export class OpenRouterProvider extends BaseProvider {
  public readonly providerId = 'openrouter';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('OpenRouterProvider initialized');
  }

  protected getApiUrl(): string {
    return OPENROUTER_API_URL;
  }

  protected getAdditionalHeaders(_settings: BaseProviderSettings): Record<string, string> {
    return {
      'HTTP-Referer': APP_URL,
      'X-OpenRouter-Title': APP_TITLE,
    };
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    _prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: settings.model || OPENROUTER_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: _prompt },
      ],
      stream: false,
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isOpenRouterApiResponse(response)) {
      this.logger.error('OpenRouter API returned invalid response structure');
      throw new Error('Invalid API response structure');
    }

    const rawText = response.choices[0]?.message?.content;
    if (!rawText) {
      throw new Error('Invalid response format: missing content');
    }

    return this.validateResponse(rawText);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    // SECURITY: Enhanced validation with format checks
    const validation = validateApiKeyFormat(settings.apiKey, {
      minLength: 20,
      expectedPrefix: 'sk-or-',
      providerName: 'OpenRouter',
    });

    if (!validation.valid) {
      this.logger.error('OpenRouter settings validation failed', {
        error: validation.error,
        hasApiKey: !!settings.apiKey,
      });
      return false;
    }

    return true;
  }

  /**
   * Fetches available models from OpenRouter API
   * @param settings - Provider settings containing API key
   * @returns Promise resolving to an array of available model IDs
   */
  public async listModels(settings: BaseProviderSettings): Promise<string[]> {
    try {
      const apiKey = settings.apiKey;
      if (!apiKey) {
        this.logger.error('OpenRouter listModels: API key is missing');
        return [];
      }

      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        this.logger.error('OpenRouter listModels: API request failed', {
          status: response.status,
        });
        return [];
      }

      const data = await response.json();

      if (typeof data === 'object' && data !== null && 'data' in data && Array.isArray(data.data)) {
        const models = data.data.map((model: unknown) => {
          if (typeof model === 'object' && model !== null && 'id' in model) {
            return model.id as string;
          }
          return '';
        });

        return models.filter(Boolean);
      }

      return [];
    } catch (error) {
      this.logger.error('OpenRouter listModels: Failed to fetch models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
