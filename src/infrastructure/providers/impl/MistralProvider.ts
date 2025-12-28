import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

type MistralMessageRole = 'system' | 'user' | 'assistant';

interface MistralMessage {
  role: MistralMessageRole;
  content: string;
}

interface MistralResponseFormat {
  type: 'json_object' | 'text';
}

interface MistralApiRequest extends Record<string, unknown> {
  model: string;
  messages: MistralMessage[];
  response_format?: MistralResponseFormat;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

interface MistralChoice {
  index: number;
  message: {
    role: MistralMessageRole;
    content: string;
  };
  finish_reason: string;
}

interface MistralUsage {
  prompt_tokens: number;
  total_tokens: number;
  completion_tokens: number;
}

interface MistralApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: MistralChoice[];
  usage: MistralUsage;
}

interface MistralApiErrorResponse {
  message: string;
  type: string;
  param?: string;
  code?: string;
}

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

function isMistralErrorResponse(value: unknown): value is MistralApiErrorResponse {
  return typeof value === 'object' && value !== null && 'message' in value && 'type' in value;
}

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';
const ANALYSIS_SYSTEM_PROMPT =
  'You are an AI email analysis assistant that analyzes emails and assigns tags.';

@injectable()
export class MistralProvider extends BaseProvider {
  public readonly providerId = 'mistral';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('MistralProvider initialized');
  }

  protected getApiUrl(): string {
    return MISTRAL_API_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    _prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: _prompt },
      ],
      response_format: { type: 'json_object' },
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isMistralApiResponse(response)) {
      if (isMistralErrorResponse(response)) {
        throw new Error(`Mistral API error: ${response.message}`);
      }
      throw new Error('Invalid response structure from Mistral API');
    }

    const rawText = response.choices[0].message.content;
    return this.validateResponse(rawText);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (!isValid) {
      this.logger.error('Mistral Error: API key is not set.');
    }
    return isValid;
  }

  /**
   * Fetches available models from Mistral AI API
   * @param settings - Provider settings containing API key
   * @returns Promise resolving to an array of available model IDs
   */
  public async listModels(settings: BaseProviderSettings): Promise<string[]> {
    try {
      const apiKey = settings.apiKey;
      if (!apiKey) {
        this.logger.error('Mistral listModels: API key is missing');
        return [];
      }

      const response = await fetch('https://api.mistral.ai/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        this.logger.error('Mistral listModels: API request failed', { status: response.status });
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
      this.logger.error('Mistral listModels: Failed to fetch models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
