import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { extractJson } from '../ProviderUtils';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';
import type { IProviderSettings } from '../../interfaces/IProvider';

// ============================================================================
// Zai API Types
// ============================================================================

const ZAI_CODING_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-4.7';

type ZaiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface ZaiMessage {
  role: ZaiMessageRole;
  content: string;
}

interface ZaiThinking {
  type: 'enabled' | 'disabled';
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

interface ZaiModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

interface ZaiModelsResponse {
  object: string;
  data: ZaiModel[];
}

// ============================================================================
// Zai Coding Provider Implementation
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT_ZAI =
  'You are an AI email analysis assistant that analyzes emails and assigns tags.';

/**
 * Zai Coding Provider for Z.ai API (Coding-Specific AI Models).
 *
 * Provider for accessing Z.ai's coding-specific AI models through the Coding API.
 * Supports models like glm-4.7 and other coding-optimized models.
 */
@injectable()
export class ZaiCodingProvider extends BaseProvider {
  public readonly providerId = 'zai-coding';
  private zaiModel: string = DEFAULT_MODEL;
  private zaiBaseUrl: string | undefined;

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('ZaiCodingProvider initialized');
  }

  protected getApiUrl(): string {
    return this.zaiBaseUrl ?? ZAI_CODING_API_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    _prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: this.zaiModel,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT_ZAI },
        { role: 'user', content: _prompt },
      ],
      thinking: { type: 'enabled' },
      temperature: 0.3,
      max_tokens: 4000,
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!this.isZaiChatCompletionResponse(response)) {
      if (this.isZaiErrorResponse(response)) {
        this.logger.error('Z.ai API returned an error response', {
          error: response.error.message,
          type: response.error.type,
          param: response.error.param,
          code: response.error.code,
        });
      }
      throw new Error('Invalid response format from Z.ai API');
    }

    const content = response.choices[0]?.message?.content;
    if (!this.isNonEmptyString(content)) {
      throw new Error('Invalid response format: missing content');
    }

    const jsonText = extractJson(content);
    const parsedResponse: unknown = JSON.parse(jsonText);

    if (!this.isRecord(parsedResponse)) {
      throw new Error('Invalid response format: parsed response is not an object');
    }

    this.logger.info('Z.ai Coding analysis completed successfully', {
      model: response.model,
      usage: response.usage,
    });

    return this.validateResponse(parsedResponse);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (isValid) {
      if (settings.model && typeof settings.model === 'string') {
        this.zaiModel = settings.model;
      }
      if (settings.apiUrl && typeof settings.apiUrl === 'string') {
        this.zaiBaseUrl = settings.apiUrl;
      }
    } else {
      this.logger.error('Z.ai Coding Error: API key is not set.');
    }
    return isValid;
  }

  // ==========================================================================
  // IProvider Implementation
  // ==========================================================================

  /**
   * Lists available models from Z.ai Coding API.
   *
   * Fetches the list of available models from the Z.ai Coding API endpoint.
   * No caching is used - models are fetched fresh each time.
   *
   * @param settings - Provider settings containing the API key
   * @returns Promise resolving to an array of available model names
   */
  async listModels(settings: IProviderSettings): Promise<string[]> {
    if (!settings.apiKey || typeof settings.apiKey !== 'string') {
      throw new Error('API key is required to list models');
    }

    const modelsEndpoint = 'https://api.z.ai/api/paas/v4/models';

    try {
      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Z.ai Coding models: ${response.status} ${response.statusText}`
        );
      }

      const data: unknown = await response.json();

      if (!this.isZaiModelsResponse(data)) {
        throw new Error('Invalid response format from Z.ai Coding models endpoint');
      }

      const models = data.data.map((model) => model.id);

      return models;
    } catch (error) {
      this.logger.error('Failed to fetch Z.ai Coding models', {
        error: error instanceof Error ? error.message : String(error),
      });

      const FALLBACK_MODELS = ['glm-4.7'];

      return FALLBACK_MODELS;
    }
  }

  // ==========================================================================
  // Type Guards
  // ==========================================================================

  private isZaiChatCompletionResponse(response: unknown): response is ZaiChatCompletionResponse {
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

  private isZaiErrorResponse(response: unknown): response is ZaiErrorResponse {
    return (
      typeof response === 'object' &&
      response !== null &&
      'error' in response &&
      typeof (response as ZaiErrorResponse).error === 'object' &&
      (response as ZaiErrorResponse).error !== null
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }

  private isZaiModelsResponse(response: unknown): response is ZaiModelsResponse {
    return (
      typeof response === 'object' &&
      response !== null &&
      'data' in response &&
      Array.isArray((response as ZaiModelsResponse).data) &&
      (response as ZaiModelsResponse).data.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof (item as ZaiModel).id === 'string'
      )
    );
  }
}
