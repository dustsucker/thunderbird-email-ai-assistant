// ============================================================================
// Import and Re-export Tag Types from TagTypes.ts (Single Source of Truth)
// ============================================================================
import type {
  Tag,
  ThunderbirdTag,
  StorageCustomTags,
  CustomTags,
  HardcodedTagKey,
  HardcodedTags,
} from './TagTypes';

// Re-export for consumers
export type { Tag, ThunderbirdTag, StorageCustomTags, CustomTags, HardcodedTagKey, HardcodedTags };

// ============================================================================
// AI Analysis Response Types
// ============================================================================

/**
 * AI analysis response with assigned tags.
 *
 * Result of email analysis containing tags, confidence score, and reasoning.
 * This is the canonical definition - infrastructure re-exports for backward compatibility.
 */
export interface ITagResponse {
  /** List of tag keys that apply to this email */
  tags: string[];
  /** Overall confidence score (0.0 to 1.0) */
  confidence: number;
  /** AI reasoning for the tag assignment */
  reasoning: string;
  /** Whether the email appears to be a scam */
  is_scam?: boolean;
  /** Detected sender name */
  sender?: string;
  /** Whether sender is consistent with headers */
  sender_consistent?: boolean | null;
  /** SPF authentication result */
  spf_pass?: boolean | null;
  /** DKIM authentication result */
  dkim_pass?: boolean | null;
  /** Additional provider-specific response data */
  [key: string]: unknown;
}

// ============================================================================
// Provider Configuration Types
// ============================================================================

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

export interface AnalysisLimits {
  contextCharLimit: number;
}

export interface AnalysisPrompt {
  template: string;
  instructions: ReadonlyArray<string>;
}

export interface AnalysisFeatures {
  enableNotifications: boolean;
  enableLogging: boolean;
}

export interface ModelConcurrencyConfig {
  provider: string;
  model?: string;
  concurrency: number;
}

export interface AppConfig extends ProviderConfig, AnalysisFeatures {
  customTags: CustomTags;
  modelConcurrencyLimits?: ModelConcurrencyConfig[];
  minConfidenceThreshold: number;
}

export interface DefaultConfig extends AppConfig {}

// ============================================================================
// Default Configuration Constants
// ============================================================================

/**
 * Default custom tags for email classification
 */
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
  {
    key: 'is_newsletter',
    name: 'Newsletter',
    color: '#00BCD4',
    prompt:
      'check if email is a newsletter, digest, or regular subscription update with curated content, articles, or updates.',
  },
  {
    key: 'is_promotion',
    name: 'Promotion',
    color: '#FF9800',
    prompt:
      'check if email contains promotional offers, discounts, sales, coupons, or special deals from a business or service.',
  },
  {
    key: 'is_social_media',
    name: 'Social Media',
    color: '#E91E63',
    prompt:
      'check if email is a notification or update from a social media platform (likes, comments, shares, friend requests, or engagement notifications).',
  },
  {
    key: 'is_shipping',
    name: 'Shipping',
    color: '#3F51B5',
    prompt:
      'check if email contains shipping notification, delivery confirmation, tracking information, or package status updates.',
  },
  {
    key: 'is_finance',
    name: 'Finance',
    color: '#009688',
    prompt:
      'check if email contains financial information like bank statements, investment updates, transaction alerts, or financial account notifications.',
  },
] as const;

/**
 * Default application configuration
 */
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
  customTags: DEFAULT_CUSTOM_TAGS as CustomTags,
  enableNotifications: true,
  enableLogging: true,
  model: undefined,
  modelConcurrencyLimits: undefined,
  minConfidenceThreshold: 70,
} as const;
