import { BaseProvider, BaseProviderSettings } from './BaseProvider';
import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { TagResponse, extractJson } from './utils';
import { Logger } from './Logger';
import { isClaudeResponse } from './Validator';

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

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-0";
const CLAUDE_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_SYSTEM_PROMPT = "You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.";

export class ClaudeProvider extends BaseProvider {
  private readonly logger: Logger;

  constructor(timeout: number = 30000) {
    super(timeout);
    this.logger = Logger.getInstance('CLAUDE');
  }

  protected getApiUrl(): string {
    return CLAUDE_API_URL;
  }

  protected getHeaders(settings: BaseProviderSettings): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (settings.apiKey) {
      headers['x-api-key'] = settings.apiKey;
    }

    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    headers['anthropic-version'] = CLAUDE_API_VERSION;

    return headers;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    const { apiKey } = settings;

    if (!apiKey) {
      this.logger.error("Claude API key is not set");
      return false;
    }

    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      this.logger.error("Claude API key is invalid", { apiKey: this.maskApiKey(apiKey) });
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
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [
        { role: "user" as const, content: prompt }
      ]
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isClaudeResponse(response)) {
      this.logger.error("Claude API returned invalid response structure", {
        response: JSON.stringify(response).substring(0, 200)
      });
      throw new Error('Invalid response format from Claude API');
    }

    const rawText = response.content[0]?.text;
    if (!rawText) {
      this.logger.error("Claude API response missing content text");
      throw new Error('Invalid response format from Claude API');
    }

    try {
      const jsonText = extractJson(rawText);
      const parsed = JSON.parse(jsonText);
      return this.validateResponse(parsed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to parse Claude response", { error: errorMessage });
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
      model: CLAUDE_MODEL
    },
    structuredData,
    customTags
  });
}
