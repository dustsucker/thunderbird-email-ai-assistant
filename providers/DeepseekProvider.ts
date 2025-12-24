import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { CustomTags } from '../core/config';
import { BaseProvider, BaseProviderSettings, RequestBody } from './BaseProvider';
import { TagResponse } from './utils';
import { Logger } from './Logger';
import { isDeepseekResponse, DeepseekResponse } from './Validator';

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions" as const;
const DEEPSEEK_MODEL = "deepseek-chat" as const;

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

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const deepseekSettings = settings as DeepseekProviderSettings;
    const hasKey = deepseekSettings.deepseekApiKey && deepseekSettings.deepseekApiKey.trim().length > 0;
    
    if (!hasKey) {
      this.logger.error('Deepseek Error: API key is not set.');
      return false;
    }
    
    return true;
  }

  protected getHeaders(settings: BaseProviderSettings): Record<string, string> {
    const deepseekSettings = settings as DeepseekProviderSettings;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (deepseekSettings.deepseekApiKey) {
      headers['Authorization'] = `Bearer ${deepseekSettings.deepseekApiKey}`;
    }

    return headers;
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
          content: 'You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false
    };

    return requestPayload as unknown as RequestBody;
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
        error: error instanceof Error ? error.message : String(error)
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
    model: DEEPSEEK_MODEL
  };

  return deepseekProvider.analyze({
    settings: providerSettings,
    structuredData,
    customTags
  });
}

export { DeepseekProvider, DeepseekResponse };
