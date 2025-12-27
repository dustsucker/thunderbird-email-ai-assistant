import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

type ClaudeMessageRole = 'user' | 'assistant';

interface ClaudeMessage {
  role: ClaudeMessageRole;
  content: string;
}

interface ClaudeApiRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: ClaudeMessage[];
}

interface ClaudeContentBlock {
  type: 'text';
  text: string;
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

interface ClaudeApiResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: ClaudeUsage;
}

function isClaudeApiResponse(value: unknown): value is ClaudeApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray((value as ClaudeApiResponse).content) &&
    'model' in value &&
    typeof (value as ClaudeApiResponse).model === 'string'
  );
}

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-0';
const CLAUDE_API_VERSION = '2023-06-01';
const ANALYSIS_SYSTEM_PROMPT = 'You are an AI email analysis assistant that analyzes emails and assigns tags.';

@injectable()
export class ClaudeProvider extends BaseProvider {
  public readonly providerId = 'claude';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('ClaudeProvider initialized');
  }

  protected getApiUrl(): string {
    return CLAUDE_API_URL;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isClaudeApiResponse(response)) {
      this.logger.error('Claude API returned invalid response structure', {
        result: JSON.stringify(response).substring(0, 200),
      });
      throw new Error('Invalid Claude API response structure');
    }

    const rawText = response.content[0]?.text;
    if (!rawText) {
      throw new Error('Claude API response missing content text');
    }

    return this.validateResponse(rawText);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (!isValid) {
      this.logger.error('Claude Error: API key is not set.');
    }
    return isValid;
  }

  protected override getAuthHeaderKey(): string {
    return 'x-api-key';
  }

  protected override formatAuthHeader(apiKey: string): string {
    return apiKey;
  }

  protected override getAdditionalHeaders(_settings: BaseProviderSettings): Record<string, string> {
    return {
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-version': CLAUDE_API_VERSION,
    };
  }
}
