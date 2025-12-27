import { buildPrompt, StructuredEmailData } from '../core/analysis';
import { ProviderConfig, CustomTags } from '../core/config';
import { validateLLMResponse, TagResponse } from './utils';
import { BaseProvider, BaseProviderSettings, AnalyzeInput, AnalyzeOutput } from './BaseProvider';
import { Logger } from './Logger';
import { Validator, isGeminiResponse } from './Validator';
import { ANALYSIS_SYSTEM_PROMPT_DETAILED } from './constants';

const GEMINI_MODEL = 'gemini-1.5-flash-latest';

interface GeminiSettings extends BaseProviderSettings {
  geminiApiKey?: string;
}

interface GeminiContentPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiContentPart[];
}

interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  generationConfig: {
    response_mime_type: string;
  };
}

interface GeminiResponseContent {
  parts: GeminiContentPart[];
  role?: string;
}

interface GeminiCandidate {
  content?: GeminiResponseContent;
  finishReason: string;
  index?: number;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

function isGeminiErrorResponse(value: unknown): value is GeminiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null
  );
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

export class GeminiProvider extends BaseProvider {
  private readonly logger: Logger;
  private readonly apiKey: string;

  constructor(apiKey: string, timeout?: number) {
    super(timeout);
    this.apiKey = apiKey;
    this.logger = Logger.getInstance('GEMINI');
  }

  protected getApiUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
  }

  protected getApiKey(settings: BaseProviderSettings): string | undefined {
    // Gemini uses API key in URL, not in headers
    return undefined;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    return this.apiKey.length > 0;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): Record<string, unknown> {
    const requestBody: GeminiGenerateContentRequest & Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: ANALYSIS_SYSTEM_PROMPT_DETAILED + '\n\n' + prompt }],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
      },
    };
    return requestBody;
  }

  protected parseResponse(response: unknown): TagResponse {
    if (isGeminiErrorResponse(response)) {
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

    try {
      const parsedResponse = JSON.parse(text);
      return validateLLMResponse(parsedResponse);
    } catch (error) {
      throw new Error(
        `Failed to parse Gemini response as JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const geminiProvider = new GeminiProvider('');

export async function analyzeWithGemini<T extends TagResponse = TagResponse>(
  settings: Pick<ProviderConfig, 'geminiApiKey'>,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<T | null> {
  const provider = new GeminiProvider(settings.geminiApiKey || '');
  return (await provider.analyze({
    settings: settings as BaseProviderSettings,
    structuredData,
    customTags,
  })) as T | null;
}
