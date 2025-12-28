import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

type DeepSeekMessageRole = 'system' | 'user' | 'assistant';

interface DeepSeekMessage {
  role: DeepSeekMessageRole;
  content: string;
}

interface DeepSeekApiRequest extends Record<string, unknown> {
  model: string;
  messages: DeepSeekMessage[];
  stream: boolean;
}

interface DeepSeekResponseMessage {
  role: string;
  content: string;
}

interface DeepSeekChoice {
  index: number;
  message: DeepSeekResponseMessage;
  finish_reason: string;
}

interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface DeepSeekApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: DeepSeekUsage;
}

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

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const ANALYSIS_SYSTEM_PROMPT =
  'You are an AI email analysis assistant that analyzes emails and assigns tags.';

@injectable()
export class DeepseekProvider extends BaseProvider {
  public readonly providerId = 'deepseek';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('DeepseekProvider initialized');
  }

  protected getApiUrl(): string {
    return DEEPSEEK_API_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    _prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: _prompt },
      ],
      stream: false,
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isDeepSeekApiResponse(response)) {
      this.logger.error('DeepSeek API returned invalid response structure');
      throw new Error('Invalid API response structure');
    }

    const rawText = response.choices[0]?.message?.content;
    if (!rawText) {
      throw new Error('Invalid response format: missing content');
    }

    return this.validateResponse(rawText);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (!isValid) {
      this.logger.error('DeepSeek Error: API key is not set.');
    }
    return isValid;
  }

  /**
   * Fetches available models from DeepSeek API
   * @param settings - Provider settings containing API key
   * @returns Promise resolving to an array of available model IDs
   */
  public async listModels(settings: BaseProviderSettings): Promise<string[]> {
    try {
      const apiKey = settings.apiKey;
      if (!apiKey) {
        this.logger.error('Deepseek listModels: API key is missing');
        return [];
      }

      const response = await fetch('https://api.deepseek.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        this.logger.error('Deepseek listModels: API request failed', { status: response.status });
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
      this.logger.error('Deepseek listModels: Failed to fetch models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
