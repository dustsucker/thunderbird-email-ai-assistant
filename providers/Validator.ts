import { TagResponse } from './utils';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts: Array<{ text: string }>;
      role?: string;
    };
    finishReason: string;
    index?: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
    completion_tokens: number;
  };
}

export interface OllamaResponse {
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

export interface DeepseekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ZaiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class Validator {
  private constructor() {}

  static validateApiKey(apiKey?: string): boolean {
    if (!apiKey) return false;
    return apiKey.trim().length > 0;
  }

  static validateApiUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static validateModelName(model: string): boolean {
    return model.trim().length > 0;
  }

  private static isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim().length === 0) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
  }

  static validateRequiredFields(
    fields: Record<string, unknown>,
    required: string[]
  ): ValidationResult {
    const errors: string[] = [];

    for (const field of required) {
      if (Validator.isEmptyValue(fields[field])) {
        errors.push(`Missing or empty required field: ${field}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export function isOpenAIResponse(data: unknown): data is OpenAIResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'choices' in data &&
    Array.isArray((data as OpenAIResponse).choices) &&
    (data as OpenAIResponse).choices.length > 0 &&
    'message' in (data as OpenAIResponse).choices[0] &&
    'usage' in data
  );
}

export function isGeminiResponse(data: unknown): data is GeminiResponse {
  return typeof data === 'object' && data !== null && 'candidates' in data;
}

export function isClaudeResponse(data: unknown): data is ClaudeResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'content' in data &&
    Array.isArray((data as ClaudeResponse).content) &&
    'model' in data &&
    typeof (data as ClaudeResponse).model === 'string'
  );
}

export function isMistralResponse(data: unknown): data is MistralResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'choices' in data &&
    Array.isArray((data as MistralResponse).choices) &&
    (data as MistralResponse).choices.length > 0 &&
    'message' in (data as MistralResponse).choices[0] &&
    'content' in (data as MistralResponse).choices[0].message &&
    'usage' in data
  );
}

export function isOllamaResponse(data: unknown): data is OllamaResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'response' in data &&
    typeof (data as OllamaResponse).response === 'string' &&
    'done' in data &&
    typeof (data as OllamaResponse).done === 'boolean'
  );
}

export function isDeepseekResponse(data: unknown): data is DeepseekResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as DeepseekResponse).id === 'string' &&
    'object' in data &&
    typeof (data as DeepseekResponse).object === 'string' &&
    'created' in data &&
    typeof (data as DeepseekResponse).created === 'number' &&
    'model' in data &&
    typeof (data as DeepseekResponse).model === 'string' &&
    'choices' in data &&
    Array.isArray((data as DeepseekResponse).choices) &&
    (data as DeepseekResponse).choices.length > 0 &&
    'message' in (data as DeepseekResponse).choices[0] &&
    'content' in (data as DeepseekResponse).choices[0].message &&
    'usage' in data &&
    typeof (data as DeepseekResponse).usage === 'object' &&
    'total_tokens' in (data as DeepseekResponse).usage &&
    typeof (data as DeepseekResponse).usage.total_tokens === 'number'
  );
}

export function isZaiResponse(data: unknown): data is ZaiResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Prüfe choices Array
  if (!('choices' in obj) || !Array.isArray(obj.choices) || obj.choices.length === 0) {
    return false;
  }

  const firstChoice = obj.choices[0] as Record<string, unknown>;

  // Prüfe message Object
  if (
    !('message' in firstChoice) ||
    typeof firstChoice.message !== 'object' ||
    firstChoice.message === null
  ) {
    return false;
  }

  const message = firstChoice.message as Record<string, unknown>;

  // Prüfe content STRING!
  if (!('content' in message) || typeof message.content !== 'string') {
    return false;
  }

  // Prüfe usage
  if (!('usage' in obj) || typeof obj.usage !== 'object') {
    return false;
  }

  return true;
}

export type ApiResponse =
  | OpenAIResponse
  | GeminiResponse
  | ClaudeResponse
  | MistralResponse
  | OllamaResponse
  | DeepseekResponse
  | ZaiResponse;
