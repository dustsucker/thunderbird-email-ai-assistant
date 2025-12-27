import { BaseProvider, BaseProviderSettings } from './BaseProvider';
import { StructuredEmailData } from '../core/analysis';
import { CustomTags } from '../core/config';
import { Logger } from './Logger';
import { Validator, OllamaResponse } from './Validator';
import { validateLLMResponse, TagResponse } from './utils';
import { ANALYSIS_SYSTEM_PROMPT_DETAILED } from './constants';

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  format: 'json';
  stream: false;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export interface OllamaErrorResponse {
  error: string;
  status?: number;
}

export function isOllamaErrorResponse(data: unknown): data is OllamaErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

export interface OllamaSettings {
  ollamaApiUrl: string;
  ollamaModel: string;
}

export class OllamaProvider extends BaseProvider {
  protected readonly logger: Logger;
  private readonly apiUrl: string;
  private readonly model: string;

  constructor(ollamaApiUrl: string, ollamaModel: string, timeout: number = 30000) {
    super(timeout);
    this.apiUrl = ollamaApiUrl;
    this.model = ollamaModel;
    this.logger = Logger.getInstance('OLLAMA');
  }

  protected getApiUrl(): string {
    return this.apiUrl;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const ollamaSettings = settings as { ollamaApiUrl?: string; ollamaModel?: string };

    const result = Validator.validateRequiredFields(ollamaSettings, [
      'ollamaApiUrl',
      'ollamaModel',
    ]);
    if (!result.isValid) {
      this.logger.error('Invalid Ollama settings', { errors: result.errors });
      return false;
    }

    if (!Validator.validateApiUrl(ollamaSettings.ollamaApiUrl!)) {
      this.logger.error('Invalid Ollama API URL', { url: ollamaSettings.ollamaApiUrl });
      return false;
    }

    if (!Validator.validateModelName(ollamaSettings.ollamaModel!)) {
      this.logger.error('Invalid Ollama model name', { model: ollamaSettings.ollamaModel });
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
    const ollamaSettings = settings as { ollamaModel?: string };
    const model = ollamaSettings.ollamaModel || this.model;

    const requestBody: OllamaGenerateRequest & Record<string, unknown> = {
      model: this.model,
      prompt: ANALYSIS_SYSTEM_PROMPT_DETAILED + '\n\n' + prompt,
      format: 'json',
      stream: false,
      options: {
        num_predict: 4096,
      },
    };

    this.logger.debug('Built Ollama request body', {
      model: this.model,
      promptLength: prompt.length,
    });

    return requestBody;
  }

  protected parseResponse(response: unknown): TagResponse {
    if (isOllamaErrorResponse(response)) {
      throw new Error(`Ollama API error: ${response.error}`);
    }

    const ollamaResponse = response as OllamaResponse;

    if (!ollamaResponse.response || typeof ollamaResponse.response !== 'string') {
      throw new Error(
        'Invalid response structure from Ollama API: missing or invalid response field'
      );
    }

    const rawText = ollamaResponse.response;
    return validateLLMResponse(rawText);
  }
}

export const ollamaProvider = new OllamaProvider(
  'http://localhost:11434/api/generate',
  'gemma3:27b'
);

export async function analyzeWithOllama(
  settings: OllamaSettings,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  const provider = new OllamaProvider(settings.ollamaApiUrl, settings.ollamaModel);

  const baseSettings: BaseProviderSettings & Record<string, string> = {
    ollamaApiUrl: settings.ollamaApiUrl,
    ollamaModel: settings.ollamaModel,
  };

  return provider.analyze({
    settings: baseSettings,
    structuredData,
    customTags,
  });
}

export function isValidOllamaUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname === '127.0.0.1' ||
        parsedUrl.hostname === '::1') &&
      parsedUrl.pathname.endsWith('/api/generate')
    );
  } catch {
    return false;
  }
}

export function getDefaultOllamaUrl(): string {
  return 'http://localhost:11434/api/generate';
}

export function getDefaultOllamaModel(): string {
  return 'gemma3:27b';
}
