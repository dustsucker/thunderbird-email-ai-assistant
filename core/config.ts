// ============================================================================
// Tag Configuration Types
// ============================================================================

/**
 * Represents a single tag configuration
 */
export interface Tag {
  key: string;
  name: string;
  color: string;
  prompt?: string;
}

/**
 * Type for the key of a hardcoded tag
 */
export type HardcodedTagKey = 'is_scam' | 'spf_fail' | 'dkim_fail' | 'tagged' | 'email_ai_analyzed';

/**
 * Readonly map of hardcoded tags with their configurations
 */
export type HardcodedTags = Record<HardcodedTagKey, Tag>;

/**
 * Array of custom tag configurations
 */
export type CustomTags = ReadonlyArray<Tag>;

/**
 * Combined type for all tags
 */
export type AllTags = HardcodedTags & CustomTags;

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * Supported AI providers
 */
export enum Provider {
  OLLAMA = 'ollama',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  CLAUDE = 'claude',
  MISTRAL = 'mistral',
  DEEPSEEK = 'deepseek',
  ZAI_PAAS = 'zai-paas',
  ZAI_CODING = 'zai-coding',
}

/**
 * Provider API configuration interface
 */
export interface ProviderConfig {
  provider: Provider;
  ollamaApiUrl: string;
  ollamaModel: string;
  openaiApiKey: string;
  geminiApiKey: string;
  claudeApiKey: string;
  mistralApiKey: string;
  deepseekApiKey: string;
  zaiPaasApiKey: string;
  zaiPaasModel: string;
  zaiCodingApiKey: string;
  zaiCodingModel: string;
  model?: string;
}

// ============================================================================
// Analysis Configuration Types
// ============================================================================

/**
 * Analysis context limits
 */
export interface AnalysisLimits {
  contextCharLimit: number;
}

/**
 * Analysis prompt template interface
 */
export interface AnalysisPrompt {
  template: string;
  instructions: ReadonlyArray<string>;
}

/**
 * Feature flags for analysis
 */
export interface AnalysisFeatures {
  enableNotifications: boolean;
  enableLogging: boolean;
}

/**
 * Model concurrency configuration
 */
export interface ModelConcurrencyConfig {
  provider: string;
  model?: string;
  concurrency: number;
}

/**
 * Confidence threshold configuration
 */
export interface AppConfig extends ProviderConfig, AnalysisFeatures {
  customTags: CustomTags;
  modelConcurrencyLimits?: ModelConcurrencyConfig[];
  minConfidenceThreshold: number;
}

/**
 * Default configuration structure
 */
export interface DefaultConfig extends AppConfig {}

// ============================================================================
// Tag Key Constants
// ============================================================================

export const TAG_KEY_PREFIX: string = '_ma_' as const;
export const TAG_NAME_PREFIX: string = 'A:' as const;

// ============================================================================
// Hardcoded Tags (readonly with const assertion)
// ============================================================================

export const HARDCODED_TAGS: HardcodedTags = {
  is_scam: { key: 'is_scam', name: 'Scam Alert', color: '#FF5722' },
  spf_fail: { key: 'spf_fail', name: 'SPF Fail', color: '#E91E63' },
  dkim_fail: { key: 'dkim_fail', name: 'DKIM Fail', color: '#E91E63' },
  tagged: { key: 'tagged', name: 'Tagged', color: '#4f4f4f' },
  email_ai_analyzed: { key: 'email_ai_analyzed', name: 'AI Analyzed', color: '#9E9E9E' },
} as const;

// ============================================================================
// Default Custom Tags (readonly array)
// ============================================================================

export const DEFAULT_CUSTOM_TAGS: CustomTags = [
  {
    key: 'is_advertise',
    name: 'Advertisement',
    color: '#FFC107',
    prompt:
      'check if email is advertising something and contains an offer or someone is asking for contact to show the offer',
  },
  {
    key: 'is_business_approach',
    name: 'Business Ad',
    color: '#2196F3',
    prompt:
      'check if email is a cold marketing/sales/business approach (or next message in the approach process where sender reply to self to refresh the approach in the mailbox). Consider typical sales and lead generation scenarios.',
  },
  {
    key: 'is_personal',
    name: 'Personal',
    color: '#4CAF50',
    prompt:
      'check if this is non-sales scenario approach from someone who likes to contact in a non-business context.',
  },
  {
    key: 'is_business',
    name: 'Business',
    color: '#af4c87',
    prompt: 'check if this looks like work related email',
  },
  {
    key: 'is_service_important',
    name: 'Service Important',
    color: '#F44336',
    prompt:
      'check if email contains important information related to already subscribed service (if this is subscription offer - ignore it): bill, password reset, login link, 2fa code, expiration notice. Consider common services like electricity, bank account, netflix, or similar subscription service.',
  },
  {
    key: 'is_service_not_important',
    name: 'Service Info',
    color: '#9E9E9E',
    prompt:
      'check if email contains non critical information from already subscribed service (if this is subscription offer - ignore it) - like: daily posts update from linkedin, AWS invitation for conference, cross sale, tips how to use product, surveys, new offers',
  },
  {
    key: 'is_bill',
    name: 'Bill',
    color: '#f4b136',
    prompt: 'check if email contains bill or invoice information.',
  },
  {
    key: 'has_calendar_invite',
    name: 'Appointment',
    color: '#7F07f2',
    prompt:
      'check if the mail has invitation to the call or meeting (with calendar appointment attached)',
  },
] as const;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULTS: Readonly<DefaultConfig> = {
  provider: Provider.OLLAMA,
  ollamaApiUrl: 'http://localhost:11434/api/generate',
  ollamaModel: 'gemma3:27b',
  openaiApiKey: '',
  geminiApiKey: '',
  claudeApiKey: '',
  mistralApiKey: '',
  deepseekApiKey: '',
  zaiPaasApiKey: '',
  zaiPaasModel: 'glm-4.5',
  zaiCodingApiKey: '',
  zaiCodingModel: 'glm-4.7',
  customTags: DEFAULT_CUSTOM_TAGS,
  enableNotifications: true,
  enableLogging: true,
  model: undefined,
  modelConcurrencyLimits: undefined,
  minConfidenceThreshold: 70,
} as const;

// ============================================================================
// Analysis Prompt Template
// ============================================================================

const PROMPT_INSTRUCTIONS: ReadonlyArray<string> = [
  'Hi, I like you to check and score an email based on the following structured data. Please respond as a single, clean JSON object with the specified properties.',
  '',
  '### Email Headers',
  '```json',
  '{headers}',
  '```',
  '',
  '### Email Body (converted from HTML to plain text)',
  '```text',
  '{body}',
  '```',
  '',
  '### Attachments',
  '```json',
  '{attachments}',
  '```',
  '',
  '### DEFINED TAGS - YOU MUST USE ONLY THESE',
  'You MUST ONLY use tags from the list below. Do NOT invent or create new tags!',
  '',
] as const;

export const PROMPT_BASE: string = PROMPT_INSTRUCTIONS.join('\n');

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a provider value is valid
 */
export function isValidProvider(provider: string): provider is Provider {
  return Object.values(Provider).includes(provider as Provider);
}

/**
 * Type guard to check if a tag is a hardcoded tag
 */
export function isHardcodedTag(tag: Tag): tag is Tag & { key: HardcodedTagKey } {
  return Object.keys(HARDCODED_TAGS).includes(tag.key as HardcodedTagKey);
}

/**
 * Type guard to check if a value is a valid tag color
 */
export function isValidColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Type guard to check if a confidence threshold value is valid
 */
export function isValidConfidenceThreshold(threshold: number): boolean {
  return Number.isInteger(threshold) && threshold >= 0 && threshold <= 100;
}

const PROVIDER_DEFAULT_CONCURRENCY: Record<Provider, number> = {
  [Provider.OLLAMA]: 5,
  [Provider.OPENAI]: 10,
  [Provider.GEMINI]: 5,
  [Provider.CLAUDE]: 5,
  [Provider.MISTRAL]: 10,
  [Provider.DEEPSEEK]: 10,
  [Provider.ZAI_PAAS]: 5,
  [Provider.ZAI_CODING]: 5,
} as const;

export function getConcurrencyLimit(config: AppConfig, provider: string, model: string): number {
  if (!config.modelConcurrencyLimits) {
    return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
  }

  const modelConfig = config.modelConcurrencyLimits.find(
    (c) => c.provider === provider && c.model === model
  );

  if (modelConfig && modelConfig.concurrency > 0) {
    return modelConfig.concurrency;
  }

  const providerConfig = config.modelConcurrencyLimits.find(
    (c) => c.provider === provider && !c.model
  );

  if (providerConfig && providerConfig.concurrency > 0) {
    return providerConfig.concurrency;
  }

  return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
}

export function validateConcurrencyConfig(config: ModelConcurrencyConfig[]): string[] {
  const errors: string[] = [];

  for (const entry of config) {
    if (!isValidProvider(entry.provider)) {
      errors.push(`Invalid provider: ${entry.provider}`);
    }

    if (!entry.model && !entry.provider) {
      errors.push('Either provider or model must be specified');
    }

    if (
      entry.concurrency !== undefined &&
      (entry.concurrency < 1 || !Number.isInteger(entry.concurrency))
    ) {
      errors.push(
        `Invalid concurrency value for ${entry.provider}/${entry.model}: ${entry.concurrency}. Must be a positive integer.`
      );
    }
  }

  return errors;
}

/**
 * Validates the confidence threshold configuration
 */
export function validateConfidenceThreshold(threshold: number): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(threshold)) {
    errors.push(`Confidence threshold must be an integer, got: ${threshold}`);
  }

  if (threshold < 0 || threshold > 100) {
    errors.push(
      `Confidence threshold must be between 0 and 100, got: ${threshold}`
    );
  }

  return errors;
}
