import { BaseProvider, BaseProviderSettings } from './BaseProvider';
import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { TagResponse, extractJson } from './utils';
import { Logger } from './Logger';
import { isClaudeResponse } from './Validator';
import { ANALYSIS_SYSTEM_PROMPT_DETAILED } from './constants';

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

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-0';
const CLAUDE_API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeProvider extends BaseProvider {
  private readonly logger: Logger;

  constructor(timeout: number = 30000) {
    super(timeout);
    this.logger = Logger.getInstance('CLAUDE');
  }

  protected getApiUrl(): string {
    return CLAUDE_API_URL;
  }

  protected getAuthHeaderKey(): string {
    return 'x-api-key';
  }

  protected formatAuthHeader(apiKey: string): string {
    return apiKey;
  }

  protected getAdditionalHeaders(settings: BaseProviderSettings): Record<string, string> {
    return {
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-version': CLAUDE_API_VERSION,
    };
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const { apiKey } = settings;

    if (!apiKey) {
      this.logger.error('Claude API key is not set');
      return false;
    }

    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      this.logger.error('Claude API key is invalid', { apiKey: this.maskApiKey(apiKey) });
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
    return {
      model: settings.model || CLAUDE_MODEL,
      max_tokens: (settings as any).max_tokens || DEFAULT_MAX_TOKENS,
      system: ANALYSIS_SYSTEM_PROMPT_DETAILED,
      messages: [{ role: 'user' as const, content: prompt }],
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isClaudeResponse(response)) {
      this.logger.error('Claude API returned invalid response structure', {
        response: JSON.stringify(response).substring(0, 200),
      });
      throw new Error('Invalid response format from Claude API');
    }

    const rawText = response.content[0]?.text;
    if (!rawText) {
      this.logger.error('Claude API response missing content text');
      throw new Error('Invalid response format from Claude API');
    }

    try {
      const jsonText = extractJson(rawText);
      const parsed = JSON.parse(jsonText);
      return this.validateResponse(parsed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to parse Claude response', { error: errorMessage });
      throw new Error('Invalid response format from Claude API');
    }
  }

  protected logError(message: string, context: Record<string, unknown> = {}): void {
    this.logger.error(message, context);
  }

  protected logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(message, context);
  }

  protected logDebug(message: string, context: Record<string, unknown> = {}): void {
    this.logger.debug(message, context);
  }
}

export const claudeProvider = new ClaudeProvider();

export async function analyzeWithClaude(
  settings: Pick<ProviderConfig, 'claudeApiKey'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  return await claudeProvider.analyze({
    settings: {
      apiKey: settings.claudeApiKey,
      model: CLAUDE_MODEL,
    },
    structuredData,
    customTags,
  });
}
