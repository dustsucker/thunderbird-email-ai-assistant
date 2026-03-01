// ============================================================================
// Metrics Types
// ============================================================================
// Performance monitoring and metrics tracking for email analysis operations.

/**
 * Metrics for a single analysis operation.
 */
export interface AnalysisMetrics {
  /** Unique identifier for this metric record */
  id: string;
  /** The email message ID that was analyzed */
  messageId: string;
  /** The AI provider used (e.g., 'openai', 'claude', 'gemini') */
  provider: string;
  /** The model used for analysis */
  model: string;
  /** Timestamp when analysis started (ms since epoch) */
  startTime: number;
  /** Timestamp when analysis completed (ms since epoch) */
  endTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Whether analysis was successful */
  success: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Number of input tokens (if available) */
  inputTokens?: number;
  /** Number of output tokens (if available) */
  outputTokens?: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
}

/**
 * Aggregated metrics for a time period.
 */
export interface AggregatedMetrics {
  /** The time period for aggregation */
  period: 'hour' | 'day' | 'week' | 'month';
  /** Start timestamp of the period (ms since epoch) */
  startTime: number;
  /** End timestamp of the period (ms since epoch) */
  endTime: number;
  /** Total number of analyses in the period */
  totalAnalyses: number;
  /** Number of successful analyses */
  successfulAnalyses: number;
  /** Number of failed analyses */
  failedAnalyses: number;
  /** Average duration in milliseconds */
  averageDuration: number;
  /** Total input tokens used */
  totalInputTokens: number;
  /** Total output tokens used */
  totalOutputTokens: number;
  /** Total estimated cost in USD */
  totalEstimatedCost: number;
  /** Metrics broken down by provider */
  byProvider: Record<
    string,
    {
      /** Number of analyses with this provider */
      count: number;
      /** Success rate (0-1) */
      successRate: number;
      /** Average duration in milliseconds */
      averageDuration: number;
      /** Total cost for this provider */
      totalCost: number;
    }
  >;
}

/**
 * Cost rates per 1K tokens for different providers/models.
 * Rates are in USD per 1000 tokens.
 */
export const PROVIDER_COST_RATES: Record<
  string,
  Record<string, { input: number; output: number }>
> = {
  openai: {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  },
  claude: {
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  },
  gemini: {
    'gemini-pro': { input: 0.00025, output: 0.0005 },
    'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  },
  deepseek: {
    'deepseek-chat': { input: 0.0001, output: 0.0002 },
    'deepseek-coder': { input: 0.0001, output: 0.0002 },
  },
  mistral: {
    'mistral-large': { input: 0.004, output: 0.012 },
    'mistral-medium': { input: 0.0027, output: 0.0081 },
    'mistral-small': { input: 0.0002, output: 0.0006 },
  },
  // Ollama and local providers are free
  ollama: {},
  zaiPaas: {},
  zaiCoding: {},
};

/**
 * Storage key for metrics in messenger.storage.local
 */
export const METRICS_STORAGE_KEY = 'analysisMetrics';

/**
 * Maximum number of metric records to store
 */
export const MAX_METRICS_ITEMS = 1000;
