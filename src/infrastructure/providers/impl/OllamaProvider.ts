import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

interface OllamaGenerateRequest extends Record<string, unknown> {
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

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaErrorResponse {
  error: string;
  status?: number;
}

function isOllamaGenerateResponse(data: unknown): data is OllamaGenerateResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'response' in data &&
    'done' in data &&
    typeof (data as { response: unknown }).response === 'string' &&
    typeof (data as { done: unknown }).done === 'boolean'
  );
}

function isOllamaErrorResponse(data: unknown): data is OllamaErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434/api/generate';
const DEFAULT_OLLAMA_MODEL = 'gemma3:27b';

@injectable()
export class OllamaProvider extends BaseProvider {
  public readonly providerId = 'ollama';
  private ollamaApiUrl: string | undefined;
  private ollamaModel: string | undefined;

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('OllamaProvider initialized');
  }

  protected getApiUrl(): string {
    return this.ollamaApiUrl ?? DEFAULT_OLLAMA_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: this.ollamaModel ?? DEFAULT_OLLAMA_MODEL,
      prompt,
      format: 'json',
      stream: false,
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (isOllamaErrorResponse(response)) {
      throw new Error(`Ollama API error: ${response.error}`);
    }

    if (!isOllamaGenerateResponse(response)) {
      throw new Error('Invalid response structure from Ollama API');
    }

    const rawText = response.response;
    const validatedResponse = this.validateResponse(rawText);

    this.logger.info('Ollama analysis completed successfully', {
      url: this.ollamaApiUrl,
      model: this.ollamaModel,
      tags: validatedResponse.tags,
      confidence: validatedResponse.confidence,
    });

    return validatedResponse;
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid =
      typeof settings.apiUrl === 'string' &&
      settings.apiUrl.length > 0 &&
      typeof settings.model === 'string' &&
      settings.model.length > 0;

    if (isValid) {
      this.ollamaApiUrl = settings.apiUrl;
      this.ollamaModel = settings.model;
    } else {
      this.logger.error('Ollama Error: Invalid settings provided');
    }

    return isValid;
  }

  protected override getHeaders(_settings: BaseProviderSettings): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }
}
