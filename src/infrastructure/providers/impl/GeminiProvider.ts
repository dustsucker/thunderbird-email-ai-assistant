import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import { buildPrompt } from '../../../../core/analysis';
import type { StructuredEmailData } from '../../../../core/analysis';
import type { CustomTags } from '../../../../core/config';

const GEMINI_MODEL = 'gemini-1.5-flash-latest';

interface GeminiContentPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiContentPart[];
}

interface GeminiGenerateContentRequest extends Record<string, unknown> {
  contents: GeminiContent[];
  generationConfig: {
    response_mime_type: string;
  };
}

type GeminiFinishReason =
  | 'FINISH_REASON_UNSPECIFIED'
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'OTHER';

interface GeminiResponseContent {
  parts: GeminiContentPart[];
  role?: string;
}

interface GeminiCandidate {
  content?: GeminiResponseContent;
  finishReason: GeminiFinishReason;
  index?: number;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

function isGeminiResponse(value: unknown): value is GeminiGenerateContentResponse {
  return typeof value === 'object' && value !== null && 'candidates' in value;
}

function hasValidText(candidate: GeminiCandidate): candidate is GeminiCandidate & {
  content: GeminiResponseContent;
} {
  return (
    candidate.content !== undefined &&
    candidate.content.parts !== undefined &&
    candidate.content.parts.length > 0 &&
    'text' in candidate.content.parts[0] &&
    typeof candidate.content.parts[0].text === 'string'
  );
}

function isErrorResponse(
  value: unknown
): value is { error: { code: number; message: string; status: string } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null
  );
}

@injectable()
export class GeminiProvider extends BaseProvider {
  public readonly providerId = 'gemini';
  private geminiApiKey: string | undefined;

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('GeminiProvider initialized');
  }

  protected getApiUrl(): string {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is not set');
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.geminiApiKey}`;
  }

  protected buildRequestBody(
    _settings: BaseProviderSettings,
    prompt: string,
    _structuredData: StructuredEmailData,
    _customTags: CustomTags
  ): Record<string, unknown> {
    return {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json' },
    };
  }

  protected parseResponse(response: unknown): TagResponse {
    if (isErrorResponse(response)) {
      throw new Error(
        `Gemini API Error: ${response.error.message} (code: ${response.error.code}, status: ${response.error.status})`
      );
    }

    if (!isGeminiResponse(response)) {
      throw new Error('Invalid response format: missing candidates field');
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error('Invalid response format: no candidates returned');
    }

    if (!hasValidText(candidate)) {
      throw new Error('Invalid response format: missing text content');
    }

    const text = candidate.content.parts[0].text;
    return this.validateResponse(text);
  }

  public validateSettings(settings: BaseProviderSettings): boolean {
    const isValid = typeof settings.apiKey === 'string' && settings.apiKey.length > 0;
    if (isValid) {
      this.geminiApiKey = settings.apiKey;
    } else {
      this.logger.error('Gemini Error: API key is not set.');
    }
    return isValid;
  }

  protected override getHeaders(_settings: BaseProviderSettings): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }
}
