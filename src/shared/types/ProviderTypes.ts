export interface Tag {
  key: string;
  name: string;
  color: string;
  prompt?: string;
  minConfidenceThreshold?: number;
}

export type HardcodedTagKey = 'is_scam' | 'spf_fail' | 'dkim_fail' | 'tagged' | 'email_ai_analyzed';

export type HardcodedTags = Record<HardcodedTagKey, Tag>;

export type CustomTags = ReadonlyArray<Tag>;

export type AllTags = HardcodedTags & CustomTags;

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
  customTags: [],
  enableNotifications: true,
  enableLogging: true,
  model: undefined,
  modelConcurrencyLimits: undefined,
  minConfidenceThreshold: 70,
} as const;
