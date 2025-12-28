export interface Tag {
  key: string;
  name: string;
  color: string;
  prompt?: string;
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
  zaiPaasBaseUrl?: string;
  zaiPaasModel: string;
  zaiCodingApiKey: string;
  zaiCodingBaseUrl?: string;
  zaiCodingModel: string;
  model?: string;
}

export interface AnalysisLimits {
  contextTokenLimit: number;
  charsPerTokenEstimate: number;
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
}

export interface DefaultConfig extends AppConfig {}
