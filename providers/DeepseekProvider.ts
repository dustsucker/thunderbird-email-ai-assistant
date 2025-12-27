import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { CustomTags } from '../core/config';
import { BaseProvider, BaseProviderSettings, RequestBody } from './BaseProvider';
import { TagResponse } from './utils';
import { Logger } from './Logger';
import { isDeepseekResponse, DeepseekResponse } from './Validator';
import { validateRequestBody } from './utils';
import { ANALYSIS_SYSTEM_PROMPT_DETAILED } from './constants';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions' as const;
const DEEPSEEK_MODEL = 'deepseek-chat' as const;

interface DeepseekProviderSettings extends BaseProviderSettings {
  deepseekApiKey?: string;
}

interface DeepseekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepseekApiRequest {
  model: string;
  messages: DeepseekMessage[];
  stream: boolean;
}

class DeepseekProvider extends BaseProvider {
  private readonly logger: Logger;
  private readonly modelName: string;

  constructor(model: string = DEEPSEEK_MODEL) {
    super();
    this.logger = Logger.getInstance('Deepseek');
    this.modelName = model;
  }

  protected getApiUrl(): string {
    return DEEPSEEK_API_URL;
  }

  protected getApiKey(settings: BaseProviderSettings): string | undefined {
    const deepseekSettings = settings as DeepseekProviderSettings;
    return deepseekSettings.deepseekApiKey;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const apiKey = this.getApiKey(settings);
    const hasKey = apiKey && apiKey.trim().length > 0;

    if (!hasKey) {
      this.logger.error('Deepseek Error: API key is not set.');
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

    const requestPayload: DeepseekApiRequest = {
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
      stream: false,
    };

    return validateRequestBody(requestPayload);
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isDeepseekResponse(response)) {
      this.logger.error('Invalid response format from Deepseek API');
      throw new Error('Invalid response format from Deepseek API');
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

export const deepseekProvider = new DeepseekProvider();

export type AnalyzeEmailInput = {
  settings: Pick<ProviderConfig, 'deepseekApiKey'>;
  structuredData: StructuredEmailData;
  customTags: CustomTags;
};

type ProviderConfig = {
  deepseekApiKey?: string;
};

export async function analyzeWithDeepseek(
  settings: AnalyzeEmailInput['settings'],
  structuredData: AnalyzeEmailInput['structuredData'],
  customTags: AnalyzeEmailInput['customTags']
) {
  const providerSettings: DeepseekProviderSettings = {
    apiKey: settings.deepseekApiKey,
    deepseekApiKey: settings.deepseekApiKey,
    model: DEEPSEEK_MODEL,
  };

  return deepseekProvider.analyze({
    settings: providerSettings,
    structuredData,
    customTags,
  });
}

export { DeepseekProvider, DeepseekResponse };
