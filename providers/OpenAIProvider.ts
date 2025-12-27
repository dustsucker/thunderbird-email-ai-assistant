import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { CustomTags } from '../core/config';
import { BaseProvider, BaseProviderSettings, RequestBody, TagResponse } from './BaseProvider';
import { Logger } from './Logger';
import { isOpenAIResponse, OpenAIResponse } from './Validator';
import { validateRequestBody } from './utils';
import { ANALYSIS_SYSTEM_PROMPT_DETAILED } from './constants';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions' as const;
const OPENAI_MODEL = 'gpt-4o' as const;

interface OpenAIProviderSettings extends BaseProviderSettings {
  openaiApiKey?: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

interface OpenAIResponseFormat {
  type: 'text' | 'json_object';
}

interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  response_format?: OpenAIResponseFormat;
}

class OpenAIProvider extends BaseProvider {
  private readonly logger: Logger;
  private readonly modelName: string;

  constructor(model: string = OPENAI_MODEL) {
    super();
    this.logger = Logger.getInstance('OpenAI');
    this.modelName = model;
  }

  protected getApiUrl(): string {
    return OPENAI_API_URL;
  }

  protected getApiKey(settings: BaseProviderSettings): string | undefined {
    const openaiSettings = settings as OpenAIProviderSettings;
    return openaiSettings.openaiApiKey;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const apiKey = this.getApiKey(settings);
    const hasKey = apiKey && apiKey.trim().length > 0;

    if (!hasKey) {
      this.logger.error('OpenAI Error: API key is not set.');
      return false;
    }

    return true;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): RequestBody {
    const model = settings.model || this.modelName;

    const requestPayload: OpenAIChatCompletionRequest = {
      model,
      messages: [
        {
          role: 'system',
          content: ANALYSIS_SYSTEM_PROMPT_DETAILED,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    };

    return validateRequestBody(requestPayload);
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isOpenAIResponse(response)) {
      this.logger.error('Invalid response format from OpenAI API');
      throw new Error('Invalid response format from OpenAI API');
    }

    const content = response.choices[0]?.message?.content;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      this.logger.error('Invalid response format: missing content');
      throw new Error('Invalid response format: missing content');
    }

    try {
      const parsed = JSON.parse(content);
      return this.validateResponse(parsed);
    } catch (error) {
      this.logger.error('Failed to parse JSON response', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to parse JSON response');
    }
  }
}

export const openAIProvider = new OpenAIProvider();

export type AnalyzeEmailInput = {
  settings: Pick<ProviderConfig, 'openaiApiKey'>;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
};

type ProviderConfig = {
  openaiApiKey?: string;
};

export async function analyzeWithOpenAI(
  settings: AnalyzeEmailInput['settings'],
  structuredData: AnalyzeEmailInput['structuredData'],
  customTags: AnalyzeEmailInput['customTags']
) {
  const providerSettings: OpenAIProviderSettings = {
    apiKey: settings.openaiApiKey,
    openaiApiKey: settings.openaiApiKey,
    model: OPENAI_MODEL,
  };

  return openAIProvider.analyze({
    settings: providerSettings,
    structuredData,
    customTags,
  });
}

export { OpenAIProvider, OpenAIResponse };
