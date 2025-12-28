import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

type OpenAIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface OpenAIMessage {
  role: OpenAIMessageRole;
  content: string;
}

type OpenAIResponseType = 'text' | 'json_object';

interface OpenAIResponseFormat {
  type: OpenAIResponseType;
}

interface OpenAIChatCompletionRequest extends Record<string, unknown> {
  model: string;
  messages: OpenAIMessage[];
  response_format?: OpenAIResponseFormat;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChoiceMessage {
  role: OpenAIMessageRole;
  content: string;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIChoiceMessage;
  finish_reason: string | null;
}

interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

function isOpenAIChatCompletionResponse(
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

function isOpenAIErrorResponse(response: unknown): response is OpenAIErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as OpenAIErrorResponse).error === 'object' &&
    (response as OpenAIErrorResponse).error !== null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';
const ANALYSIS_SYSTEM_PROMPT =
  'You are an AI email analysis assistant that analyzes emails and assigns tags.';

@injectable()
export class OpenAIProvider extends BaseProvider {
  public readonly providerId = 'openai';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('OpenAIProvider initialized');
  }

  protected getApiUrl(): string {
    return OPENAI_API_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    _prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: _prompt },
      ],
      response_format: { type: 'json_object' },
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isOpenAIChatCompletionResponse(response)) {
      if (isOpenAIErrorResponse(response)) {
        this.logger.error('OpenAI API returned an error response', {
          error: response.error.message,
          type: response.error.type,
        });
      }
      throw new Error('Invalid response format from OpenAI API');
    }

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid response format: missing content');
    }

    const parsedResponse: unknown = JSON.parse(content);

    if (!isRecord(parsedResponse)) {
      throw new Error('Invalid response format: parsed response is not an object');
    }

    return this.validateResponse(parsedResponse);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (!isValid) {
      this.logger.error('OpenAI Error: API key is not set.');
    }
    return isValid;
  }

  /**
   * Fetches available models from OpenAI API
   * @param settings - Provider settings containing API key
   * @returns Promise resolving to an array of available model IDs
   */
  public async listModels(settings: BaseProviderSettings): Promise<string[]> {
    try {
      const apiKey = settings.apiKey;
      if (!apiKey) {
        this.logger.error('OpenAI listModels: API key is missing');
        return [];
      }

      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        this.logger.error('OpenAI listModels: API request failed', { status: response.status });
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
      this.logger.error('OpenAI listModels: Failed to fetch models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
