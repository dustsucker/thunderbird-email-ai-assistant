import { BaseProvider, BaseProviderSettings, RequestBody, AnalyzeInput, AnalyzeOutput, TagResponse } from './BaseProvider';
import { StructuredEmailData } from '../core/analysis';
import { CustomTags } from '../core/config';
import { Logger } from './Logger';
import { Validator, isMistralResponse, MistralResponse } from './Validator';

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions" as const;
const MISTRAL_MODEL = "mistral-large-latest" as const;

interface MistralMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralResponseFormat {
  type: 'json_object' | 'text';
}

interface MistralApiRequest extends Record<string, unknown> {
  model: string;
  messages: MistralMessage[];
  response_format?: MistralResponseFormat;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export class MistralProvider extends BaseProvider {
  private readonly logger: Logger;

  constructor(timeout?: number) {
    super(timeout);
    this.logger = Logger.getInstance('Mistral');
  }

  protected getApiUrl(): string {
    return MISTRAL_API_URL;
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    if (!Validator.validateApiKey(settings.apiKey)) {
      this.logger.error('Mistral API key is not set or invalid');
      return false;
    }
    return true;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): RequestBody {
    const requestBody: MistralApiRequest = {
      model: MISTRAL_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    };
    return requestBody;
  }

  protected parseResponse(response: unknown): TagResponse {
    if (!isMistralResponse(response)) {
      this.logger.error('Invalid response structure from Mistral API');
      throw new Error('Invalid response structure from Mistral API');
    }

    const rawText = response.choices[0].message.content;
    return this.validateResponse(rawText);
  }
}

export const mistralProvider = new MistralProvider();

export async function analyzeWithMistral(
  settings: { mistralApiKey?: string },
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse | null> {
  return mistralProvider.analyze({
    settings: { apiKey: settings.mistralApiKey },
    structuredData,
    customTags
  });
}
