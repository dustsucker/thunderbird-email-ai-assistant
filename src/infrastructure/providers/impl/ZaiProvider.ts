import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

const ZAI_PAAS_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZAI_CODING_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
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

interface ZaiChatCompletionRequest extends Record<string, unknown> {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const ANALYSIS_SYSTEM_PROMPT_ZAI = 'You are an AI email analysis assistant that analyzes emails and assigns tags.';

@injectable()
export class ZaiProvider extends BaseProvider {
  public readonly providerId = 'zai';
  private zaiModel: string = DEFAULT_MODEL;
  private zaiVariant: 'paas' | 'coding' = DEFAULT_VARIANT;
  private zaiBaseUrl: string | undefined;

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('ZaiProvider initialized');
  }

  protected getApiUrl(): string {
    return this.zaiBaseUrl || (this.zaiVariant === 'coding' ? ZAI_CODING_API_URL : ZAI_PAAS_API_URL);
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
    if (!isZaiChatCompletionResponse(response)) {
      if (isZaiErrorResponse(response)) {
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
    if (!isNonEmptyString(content)) {
      throw new Error('Invalid response format: missing content');
    }

    const parsedResponse: unknown = JSON.parse(content);

    if (!isRecord(parsedResponse)) {
      throw new Error('Invalid response format: parsed response is not an object');
    }

    this.logger.info('Z.ai analysis completed successfully', {
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
      this.logger.error('Z.ai Error: API key is not set.');
    }
    return isValid;
  }
}
