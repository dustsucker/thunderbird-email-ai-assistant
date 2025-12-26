import { BaseProvider, BaseProviderSettings, AnalyzeOutput } from './BaseProvider';
import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { CustomTags, ProviderConfig } from '../core/config';
import { TagResponse } from './utils';
import { Logger } from './Logger';
import { Validator, isZaiResponse, ZaiResponse } from './Validator';

const ZAI_PAAS_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions' as const;
const ZAI_CODING_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions' as const;
const ZAI_PAAS_MODELS_API_URL = 'https://api.z.ai/api/paas/v4/models' as const;
const ZAI_CODING_MODELS_API_URL = 'https://api.z.ai/api/coding/paas/v4/models' as const;
const DEFAULT_MODEL = 'glm-4.5' as const;
const DEFAULT_VARIANT = 'paas' as const;
const DEFAULT_TIMEOUT = 300000; // 5 Minuten für sehr grosse Modelle

export type ZaiVariant = 'paas' | 'coding';

export interface ZaiSettings extends BaseProviderSettings {
  zaiApiKey?: string;
  zaiBaseUrl?: string;
  zaiModel?: string;
  zaiVariant?: ZaiVariant;
}

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
  response_format?: { type: 'json_object' | 'text' };
}

interface ZaiErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
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

const CACHE_TTL = 60 * 60 * 1000;

export class ZaiProvider extends BaseProvider {
  private readonly logger: Logger;
  private settings: ZaiSettings = {};
  private cachedModels: string[] | null = null;
  private cacheTimestamp: number = 0;

  constructor(timeout: number = DEFAULT_TIMEOUT) {
    super(timeout);
    this.logger = Logger.getInstance('ZAI');
  }

  protected getApiUrl(): string {
    if (this.settings.zaiBaseUrl && Validator.validateApiUrl(this.settings.zaiBaseUrl)) {
      this.logger.debug('Using custom zaiBaseUrl', { url: this.settings.zaiBaseUrl });
      return this.settings.zaiBaseUrl;
    }
    const variant = this.settings.zaiVariant || DEFAULT_VARIANT;
    const apiUrl = variant === 'coding' ? ZAI_CODING_API_URL : ZAI_PAAS_API_URL;
    this.logger.debug('Using variant-based endpoint', { variant, apiUrl });
    return apiUrl;
  }

  protected getHeaders(settings: BaseProviderSettings): Record<string, string> {
    const zaiSettings = settings as ZaiSettings;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (zaiSettings.zaiApiKey) {
      headers['Authorization'] = `Bearer ${zaiSettings.zaiApiKey}`;
    }

    return headers;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const zaiSettings = settings as ZaiSettings;
    const result = Validator.validateRequiredFields(
      { apiKey: zaiSettings.zaiApiKey, model: zaiSettings.zaiModel || DEFAULT_MODEL },
      ['apiKey', 'model']
    );

    if (!result.isValid) {
      this.logger.error('Z.ai Error: Invalid settings', { errors: result.errors });
      return false;
    }

    return true;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): Record<string, unknown> {
    const zaiSettings = settings as ZaiSettings;
    const model = zaiSettings.zaiModel || DEFAULT_MODEL;
    const variant = zaiSettings.zaiVariant || DEFAULT_VARIANT;

    const requestPayload: ZaiChatCompletionRequest = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an email analysis assistant. Your ONLY task is to analyze the provided email data and respond with a single, valid JSON object. Return NOTHING except the JSON object - no conversational text, no markdown formatting (no ```json``` blocks), no explanations, no greetings, no "Here is the analysis" text. The response MUST start directly with { and end with }. Ensure all required fields are present with correct data types.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    };

    if (variant === 'coding') {
      requestPayload.thinking = { type: 'enabled' };
    }

    return requestPayload;
  }

  protected parseResponse(response: unknown): TagResponse {
    if (isZaiErrorResponse(response)) {
      this.logger.error('Z.ai API returned an error response', {
        error: response.error.message,
        type: response.error.type,
        param: response.error.param,
        code: response.error.code
      });
      throw new Error(`Z.ai API Error: ${response.error.message}`);
    }

    if (!isZaiResponse(response)) {
      this.logger.error('Invalid response format from Z.ai API');
      throw new Error('Invalid response format from Z.ai API');
    }

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      this.logger.error('Invalid response format: missing content', {
        fullResponse: JSON.stringify(response, null, 2),
        responseType: typeof response,
        hasChoices: 'choices' in response,
        choicesLength: (response as any).choices?.length,
        firstChoice: (response as any).choices?.[0],
        hasMessage: 'message' in (response as any).choices?.[0],
        message: (response as any).choices?.[0]?.message,
        messageContent: (response as any).choices?.[0]?.message?.content,
        hasUsage: 'usage' in response
      });
      throw new Error('Invalid response format: missing content');
    }

    try {
      const parsedResponse = JSON.parse(content);
      return this.validateResponse(parsedResponse);
    } catch (error) {
      // Handle abort/timeout errors specifically
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        this.logger.error('Z.ai API request timeout', { error: error.message });
        throw new Error('Z.ai API Anfrage wurde abgebrochen (Timeout nach 5 Minuten)...');
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to parse JSON response', { error: errorMessage });
      throw new Error('Failed to parse JSON response');
    }
  }

  setSettings(settings: ZaiSettings): void {
    this.settings = settings;
  }

  async getModelList(): Promise<string[]> {
    if (this.cachedModels && Date.now() - this.cacheTimestamp < CACHE_TTL) {
      return this.cachedModels;
    }

    try {
      const apiKey = this.settings.zaiApiKey;
      if (!apiKey) {
        this.logger.warn('Cannot fetch models: API key is not set');
        return this.getFallbackModels();
      }

      const variant = this.settings.zaiVariant || DEFAULT_VARIANT;
      const modelsApiUrl = variant === 'coding' ? ZAI_CODING_MODELS_API_URL : ZAI_PAAS_MODELS_API_URL;

      const response = await fetch(modelsApiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        this.logger.warn('Failed to fetch models from Z.ai API');
        return this.getFallbackModels();
      }

      const data = await response.json();
      const models = data.data?.map((m: any) => m.id) || [];

      this.cachedModels = models;
      this.cacheTimestamp = Date.now();

      return models;
    } catch (error) {
      this.logger.warn('Failed to fetch Z.ai models, using fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): string[] {
    return [
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-x',
      'glm-4.5-airx',
      'glm-4.5-flash'
    ];
  }

}

export const zaiProvider = new ZaiProvider();

export async function analyzeWithZai(
  settings: Pick<ProviderConfig, 'zaiApiKey' | 'zaiBaseUrl' | 'zaiModel' | 'zaiVariant'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<AnalyzeOutput> {
  const providerSettings: ZaiSettings = {
    apiKey: settings.zaiApiKey,
    zaiApiKey: settings.zaiApiKey,
    zaiBaseUrl: settings.zaiBaseUrl,
    zaiModel: settings.zaiModel || DEFAULT_MODEL,
    zaiVariant: settings.zaiVariant || DEFAULT_VARIANT,
    model: settings.zaiModel || DEFAULT_MODEL
  };

  return await zaiProvider.analyze({
    settings: providerSettings,
    structuredData,
    customTags
  });
}

export async function fetchZaiModels(apiKey: string, baseUrl?: string, variant?: ZaiVariant): Promise<string[]> {
  try {
    const url = baseUrl || (variant === 'coding' ? ZAI_CODING_MODELS_API_URL : ZAI_PAAS_MODELS_API_URL);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch (error) {
    console.warn('Failed to fetch z.ai models, using fallback:', error);
    return [
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-x',
      'glm-4.5-airx',
      'glm-4.5-flash'
    ];
  }
}

export { ZaiResponse };

