import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

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

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('OllamaProvider initialized');
  }

  protected getApiUrl(settings?: BaseProviderSettings): string {
    return settings?.apiUrl || DEFAULT_OLLAMA_URL;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: settings.model || DEFAULT_OLLAMA_MODEL,
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

    // debug: per-analysis completion — the single info log lives in AnalyzeEmail (#6)
    this.logger.debug('Ollama analysis completed successfully', {
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

    if (!isValid) {
      this.logger.error('Ollama Error: Invalid settings provided');
    }

    return isValid;
  }

  protected override getHeaders(_settings: BaseProviderSettings): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  /**
   * Fetches available models from Ollama API
   * @param settings - Provider settings containing API URL
   * @returns Promise resolving to an array of available model names
   */
  public async listModels(settings: BaseProviderSettings): Promise<string[]> {
    try {
      const baseUrl = (settings.apiUrl || DEFAULT_OLLAMA_URL).replace(/\/api\/generate$/, '');
      const tagsUrl = `${baseUrl}/api/tags`;

      const response = await fetch(tagsUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.error('Ollama listModels: API request failed', { status: response.status });
        return [];
      }

      const data = await response.json();

      if (
        typeof data === 'object' &&
        data !== null &&
        'models' in data &&
        Array.isArray(data.models)
      ) {
        const models = data.models.map((model: unknown) => {
          if (typeof model === 'object' && model !== null && 'name' in model) {
            return model.name as string;
          }
          return '';
        });

        return models.filter(Boolean);
      }

      return [];
    } catch (error) {
      this.logger.error('Ollama listModels: Failed to fetch models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
