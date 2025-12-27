import {
  DEFAULTS,
  HARDCODED_TAGS,
  TAG_KEY_PREFIX,
  CustomTags,
  AppConfig,
  Tag,
  getConcurrencyLimit,
} from './core/config';
import { findEmailParts, Attachment, StructuredEmailData } from './core/analysis';
import { ensureTagsExist } from './core/tags';
import {
  PROVIDER_ENGINES,
  ProviderFunction,
  isValidProvider as isProviderValid,
  AVAILABLE_PROVIDERS,
} from './providers/index';
import {
  logger,
  logAndDisplayError,
  ErrorType,
  ShowErrorRuntimeMessage,
  ErrorSeverity,
  validateAppConfig,
  validateCustomTagsResult,
  isBatchAnalysisProgress,
} from './providers/utils';
import { analysisCache, createCacheKey, normalizeHeaders } from './core/cache';

// ============================================================================
// BROWSER WEBEXTENSION API TYPES
// ============================================================================

/**
 * Tab interface for browser tabs
 */
interface Tab {
  id: number;
  type: string;
  index?: number;
  windowId?: number;
  selected?: boolean;
}

/**
 * Thunderbird/WebExtension global messenger object
 */
interface Messenger {
  messages: {
    onNewMailReceived: {
      addListener(callback: (folder: Folder, messages: NewMailMessages) => void): void;
    };
    getFull(messageId: number): Promise<FullMessage>;
    get(messageId: number): Promise<MessageDetails>;
    update(messageId: number, properties: { tags: string[] }): Promise<void>;
    list(folderId?: string): Promise<MessageListResult>;
    tags: {
      create(key: string, tag: string, color: string): Promise<void>;
      list(): Promise<unknown[]>;
    };
  };
  messageDisplay: {
    getDisplayedMessage(tabId?: number): Promise<{ id: number } | null>;
  };
  folders: {
    query(query: Record<string, unknown>): Promise<MailFolder[]>;
  };
  storage: {
    local: {
      get(keys: Partial<AppConfig> | { [key: string]: unknown }): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
  };
  runtime: {
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => void
      ): void;
    };
  };
  notifications: {
    create(options: NotificationOptions): Promise<string>;
  };
  menus: {
    create(createProperties: Record<string, unknown>, callback?: () => void): void;
    onClicked: {
      addListener(callback: (info: FolderMenuOnClickData, tab: Tab) => void): void;
    };
  };
  browserAction?: BrowserAction;
  action?: BrowserAction;
}

/**
 * Browser action API for badge management
 */
interface BrowserAction {
  setBadgeText(options: { text: string }): Promise<void>;
  setBadgeBackgroundColor(options: { color: string }): Promise<void>;
  onClicked?: {
    addListener(callback: (tab: Tab) => void): void;
  };
}

// ============================================================================
// THUNDERBIRD MESSAGE TYPES
// ============================================================================

/**
 * Message part structure from Thunderbird's getFull()
 */
interface MessagePart {
  contentType: string;
  body: string;
  isAttachment: boolean;
  name?: string;
  size?: number;
  parts?: MessagePart[];
}

/**
 * Full message structure from messenger.messages.getFull()
 */
interface FullMessage {
  id: number;
  headers: Record<string, string[]>;
  parts: MessagePart[];
}

/**
 * Message details from messenger.messages.get()
 */
interface MessageDetails {
  id: number;
  tags?: string[];
}

/**
 * Message list result from messenger.messages.list()
 */
interface MessageListResult {
  messages: Array<{ id: number; folder?: { accountId?: number } }>;
}

/**
 * New mail messages structure from onNewMailReceived event
 */
interface NewMailMessages {
  messages: Array<{ id: number }>;
}

/**
 * Folder structure from onNewMailReceived event
 */
interface Folder {
  accountId: number;
  name: string;
  type: string;
  path?: string;
}

interface MailFolder {
  accountId: string;
  id: string;
  path: string;
  name: string;
  type: string;
}

interface FolderMenuOnClickData {
  menuItemId: string | number;
  selectedFolders?: MailFolder[];
  modifiers: string[];
}

// ============================================================================
// RATE LIMITER TYPES
// ============================================================================

/**
 * Rate limiter bucket state
 */
interface RateLimiterBucket {
  tokens: number;
  lastRefill: number;
  limit: number;
  window: number;
}

/**
 * Rate limiter configuration for a provider
 */
interface RateLimiterConfig {
  limit: number;
  window: number;
}

/**
 * Rate limiter configuration map for all providers
 */
interface RateLimiterConfigMap {
  openai: RateLimiterConfig;
  claude: RateLimiterConfig;
  ollama: RateLimiterConfig;
  mistral: RateLimiterConfig;
  deepseek: RateLimiterConfig;
  gemini: RateLimiterConfig;
  [provider: string]: RateLimiterConfig;
}

/**
 * Queued task for rate limiter
 */
interface QueuedTask<T = unknown> {
  fn: () => Promise<T>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  priority: number;
}

/**
 * Rate limiter state buckets map
 */
interface RateLimiterBuckets {
  [provider: string]: RateLimiterBucket;
}

/**
 * Rate limiter queues map
 */
interface RateLimiterQueues {
  [provider: string]: QueuedTask<unknown>[];
}

/**
 * Rate limiter processing promises map
 */
interface RateLimiterProcessing {
  [provider: string]: Promise<void> | null;
}

/**
 * Model concurrency configuration
 */
type ModelConcurrencyConfig = Record<string, number>;

/**
 * Semaphore state for a model
 */
interface ModelSemaphore {
  active: number;
  limit: number;
  waiting: Array<{ resolve: () => void; reject: (reason: unknown) => void }>;
}

// ============================================================================
// BADGE STATUS TYPES
// ============================================================================

/**
 * Badge status types for UI feedback
 */
type BadgeStatus = 'processing' | 'success' | 'error';

/**
 * Badge configuration for different statuses
 */
interface BadgeConfig {
  text: string;
  color: string;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/**
 * Notification type
 */
type NotificationType = 'info' | 'error';

/**
 * Notification options for WebExtension API
 */
interface NotificationOptions {
  type: 'basic' | 'image' | 'list' | 'progress';
  iconUrl: string;
  title: string;
  message: string;
}

/**
 * Notification settings from storage
 */
interface NotificationSettings {
  enableNotifications: boolean;
}

// ============================================================================
// EMAIL ANALYSIS TYPES
// ============================================================================

/**
 * Email headers for priority calculation
 */
interface EmailHeaders {
  from?: string[];
  subject?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Structured email data for analysis
 */
interface AnalysisData {
  headers: EmailHeaders;
  body: string;
  attachments: Attachment[];
}

/**
 * Analysis priority level
 */
type Priority = number;

/**
 * Analysis result with provider info
 */
interface AnalysisResult {
  tags: string[];
  confidence: number;
  reasoning: string;
}

/**
 * Extended analysis result with scam detection fields
 */
interface ExtendedAnalysisResult extends AnalysisResult {
  sender?: string;
  sender_consistent?: boolean | null;
  spf_pass?: boolean | null;
  dkim_pass?: boolean | null;
  is_scam?: boolean;
  [key: string]: unknown;
}

/**
 * Batch processing statistics
 */
interface BatchStatistics {
  total: number;
  successful: number;
  failed: number;
  [key: string]: unknown;
}

/**
 * Processed message with analysis result
 */
interface ProcessedMessage {
  messageId: number;
  fullMessage: FullMessage;
  analysisResult: ExtendedAnalysisResult | null;
  analysisError?: Error;
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Storage result with custom tags
 */
interface StorageResult extends Partial<AppConfig> {
  customTags?: CustomTags;
}

/**
 * Storage result with only custom tags
 */
interface StorageCustomTagsResult {
  customTags: CustomTags;
}

// ============================================================================
// BATCH ANALYSIS API TYPES
// ============================================================================

/**
 * Batch analysis progress status
 */
type BatchAnalysisStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

/**
 * Batch analysis progress data
 */
interface BatchAnalysisProgress {
  status: BatchAnalysisStatus;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

/**
 * Batch analysis start result with cancel token
 */
interface BatchAnalysisStartResult {
  success: boolean;
  statistics?: BatchStatistics;
  error?: string;
  message?: string;
  messageCount?: number;
}

// ============================================================================
// RUNTIME MESSAGE TYPES
// ============================================================================

/**
 * Discriminated union for runtime message actions
 */
type RuntimeMessage =
  | StartBatchAnalysisMessage
  | GetBatchProgressMessage
  | CancelBatchAnalysisMessage
  | ClearQueueMessage
  | ClearCacheMessage
  | GetCacheStatsMessage
  | ShowErrorRuntimeMessage;

/**
 * Start batch analysis message
 */
interface StartBatchAnalysisMessage {
  action: 'startBatchAnalysis';
  folderId?: string;
}

/**
 * Get batch progress message
 */
interface GetBatchProgressMessage {
  action: 'getBatchProgress';
}

/**
 * Cancel batch analysis message
 */
interface CancelBatchAnalysisMessage {
  action: 'cancelBatchAnalysis';
}

/**
 * Clear queue message
 */
interface ClearQueueMessage {
  action: 'clearQueue';
  cancelRunning?: boolean;
}

/**
 * Clear queue result
 */
interface ClearQueueResult {
  success: boolean;
  clearedTasks: number;
  cancelledProviders: string[];
  providers: Record<string, { queueLength: number; isProcessing: boolean }>;
}

/**
 * Clear queue message
 */
interface ClearQueueMessage {
  action: 'clearQueue';
  cancelRunning?: boolean;
}

/**
 * Clear cache message
 */
interface ClearCacheMessage {
  action: 'clearCache';
}

/**
 * Get cache stats message
 */
interface GetCacheStatsMessage {
  action: 'getCacheStats';
}

/**
 * Get cache stats response
 */
interface GetCacheStatsResponse {
  success: boolean;
  message?: string;
  totalEntries?: number;
  hitRate?: number;
}

/**
 * Discriminated union for runtime message responses
 */
type RuntimeMessageResponse =
  | BatchAnalysisStartResult
  | BatchAnalysisProgress
  | ClearQueueResult
  | GetCacheStatsResponse
  | { success: boolean; message: string };

/**
 * Type guard for StartBatchAnalysisMessage
 */
function isStartBatchAnalysisMessage(message: unknown): message is StartBatchAnalysisMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'startBatchAnalysis'
  );
}

/**
 * Type guard for GetBatchProgressMessage
 */
function isGetBatchProgressMessage(message: unknown): message is GetBatchProgressMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'getBatchProgress'
  );
}

/**
 * Type guard for CancelBatchAnalysisMessage
 */
function isCancelBatchAnalysisMessage(message: unknown): message is CancelBatchAnalysisMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'cancelBatchAnalysis'
  );
}

/**
 * Type guard for ClearQueueMessage
 */
function isClearQueueMessage(message: unknown): message is ClearQueueMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'clearQueue'
  );
}

/**
 * Type guard for ClearCacheMessage
 */
function isClearCacheMessage(message: unknown): message is ClearCacheMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'clearCache'
  );
}

/**
 * Type guard for GetCacheStatsMessage
 */
function isGetCacheStatsMessage(message: unknown): message is GetCacheStatsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'getCacheStats'
  );
}

// ============================================================================
// GLOBAL DECLARATIONS
// ============================================================================

declare const messenger: Messenger;
declare const browser: {
  runtime?: {
    lastError?: { message: string };
  };
};

logger.info('Spam-Filter Extension: Background script loaded.');

// ============================================================================
// PROVIDER VALIDATION HELPER
// ============================================================================

/**
 * Validates if a provider string is a valid provider name
 * @param provider - Provider name to validate
 * @returns True if provider is valid, false otherwise
 */
function isValidProvider(provider: string): boolean {
  return isProviderValid(provider);
}

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

/**
 * Rate limiter class to manage API request rates per provider
 * Uses token bucket algorithm with priority queue
 * Extended with per-model concurrency limiting using semaphores
 */
export class RateLimiter {
  public readonly buckets: RateLimiterBuckets;
  private readonly queues: RateLimiterQueues;
  private readonly processing: RateLimiterProcessing;
  private readonly appConfig: AppConfig;
  private readonly modelSemaphores: Record<string, ModelSemaphore>;

  /**
   * Creates a new RateLimiter instance
   * @param config - Rate limiter configuration for each provider
   * @param appConfig - Application configuration containing model concurrency limits
   */
  constructor(
    config: RateLimiterConfigMap,
    appConfig: AppConfig
  ) {
    this.buckets = {};
    this.queues = {};
    this.processing = {};
    this.appConfig = appConfig;
    this.modelSemaphores = {};

    for (const provider in config) {
      this.buckets[provider] = {
        tokens: config[provider].limit,
        lastRefill: Date.now(),
        limit: config[provider].limit,
        window: config[provider].window,
      };
      this.queues[provider] = [];
      this.processing[provider] = null;
    }
  }

  /**
   * Gets or creates a semaphore for a model
   * @param provider - Provider name
   * @param model - Model name
   * @returns Semaphore for the model
   */
  private getSemaphore(provider: string, model: string): ModelSemaphore {
    const semaphoreKey = `${provider}:${model}`;

    if (!this.modelSemaphores[semaphoreKey]) {
      const limit = getConcurrencyLimit(this.appConfig, provider, model);
      this.modelSemaphores[semaphoreKey] = {
        active: 0,
        limit,
        waiting: [],
      };
    }
    return this.modelSemaphores[semaphoreKey];
  }

  /**
   * Acquires a semaphore slot for a model
   * Waits if all slots are occupied
   * @param provider - Provider name
   * @param model - Model name
   * @returns Promise that resolves when a slot is acquired
   */
  private async acquireSemaphore(provider: string, model: string): Promise<void> {
    const semaphore = this.getSemaphore(provider, model);

    if (semaphore.active < semaphore.limit) {
      semaphore.active++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      semaphore.waiting.push({ resolve, reject });
    });
  }

  /**
   * Releases a semaphore slot for a model
   * @param provider - Provider name
   * @param model - Model name
   */
  private releaseSemaphore(provider: string, model: string): void {
    const semaphore = this.getSemaphore(provider, model);
    semaphore.active--;

    if (semaphore.waiting.length > 0) {
      const next = semaphore.waiting.shift();
      if (next) {
        semaphore.active++;
        next.resolve();
      }
    }
  }

  /**
   * Refills tokens based on elapsed time since last refill
   * @param provider - Provider to refill tokens for
   */
  private refillTokens(provider: string): void {
    const bucket = this.buckets[provider];
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / bucket.window) * bucket.limit;

    bucket.tokens = Math.min(bucket.limit, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  /**
   * Checks if provider has available tokens
   * @param provider - Provider to check
   * @returns True if at least 1 token is available
   */
  private hasTokens(provider: string): boolean {
    this.refillTokens(provider);
    return this.buckets[provider].tokens >= 1;
  }

  /**
   * Consumes one token from the provider's bucket
   * @param provider - Provider to consume token from
   */
  private consumeToken(provider: string): void {
    this.buckets[provider].tokens -= 1;
  }

  /**
   * Processes the queue for a given provider
   * @param provider - Provider to process queue for
   */
  private async processQueue(provider: string): Promise<void> {
    if (this.processing[provider]) {
      await this.processing[provider];
      return;
    }

    this.processing[provider] = (async (): Promise<void> => {
      try {
        while (this.queues[provider].length > 0) {
          const { fn, resolve, reject } = this.queues[provider].shift()!;

          while (!this.hasTokens(provider)) {
            await new Promise<void>((r) => setTimeout(r, 100));
          }

          this.consumeToken(provider);

          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      } finally {
        this.processing[provider] = null;
      }
    })();

    await this.processing[provider];
  }

  /**
   * Executes a function with rate limiting and priority queuing
   * @param provider - Provider to execute function for
   * @param requestFn - Async function to execute
   * @param priority - Priority level (higher = more important)
   * @param model - Optional model name for concurrency limiting
   * @returns Promise resolving to function result
   */
  async execute<T>(
    provider: string,
    requestFn: () => Promise<T>,
    priority: Priority = 1,
    model?: string
  ): Promise<T> {
    // Defensive Check: Provider muss in der Konfiguration existieren
    if (!(provider in this.queues)) {
      throw new Error(
        `Provider '${provider}' not configured in RateLimiter. Valid providers: ${Object.keys(this.queues).join(', ')}`
      );
    }

    // Wrap the request function with semaphore logic if model is specified
    const wrappedFn = async (): Promise<T> => {
      if (!model) {
        return await requestFn();
      }

      await this.acquireSemaphore(provider, model);
      try {
        return await requestFn();
      } finally {
        this.releaseSemaphore(provider, model);
      }
    };

    return new Promise<T>((resolve, reject) => {
      this.queues[provider].push({
        fn: wrappedFn,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
      });
      this.queues[provider].sort((a, b) => b.priority - a.priority);
      this.processQueue(provider);
    });
  }

  /**
   * Clears all queues and optionally cancels running processes
   * @param cancelRunning - Whether to reject pending tasks and clear processing promises
   * @returns Statistics about cleared queues
   */
  clearQueue(cancelRunning: boolean = false): {
    clearedTasks: number;
    cancelledProviders: string[];
    providers: Record<string, { queueLength: number; isProcessing: boolean }>;
  } {
    let clearedTasks = 0;
    const cancelledProviders: string[] = [];
    const providers: Record<string, { queueLength: number; isProcessing: boolean }> = {};

    for (const provider in this.queues) {
      const queueLength = this.queues[provider].length;
      const isCurrentlyExecuting = this.processing[provider] !== null;

      clearedTasks += queueLength;

      // Reject all pending tasks in the queue (only if not currently executing)
      if (cancelRunning && queueLength > 0) {
        if (!isCurrentlyExecuting) {
          for (const task of this.queues[provider]) {
            task.reject(new Error('Queue cleared'));
          }
        }
      }

      // Clear the queue (only if not currently executing)
      if (!isCurrentlyExecuting) {
        this.queues[provider] = [];
      }

      // Clear processing flag if requested and provider is processing
      if (cancelRunning && isCurrentlyExecuting) {
        this.processing[provider] = null;
        cancelledProviders.push(provider);
      }

      providers[provider] = {
        queueLength: queueLength,
        isProcessing: isCurrentlyExecuting,
      };
    }

    logger.info('Rate limiter queues cleared', {
      clearedTasks,
      cancelledProviders,
      providers,
    });

    return {
      clearedTasks,
      cancelledProviders,
      providers,
    };
  }
}

// ============================================================================
// RATE LIMITER INSTANCE
// ============================================================================

let rateLimiterInstance: RateLimiter | null = null;
let rateLimiterInitialized = false;

async function getRateLimiter(): Promise<RateLimiter> {
  if (rateLimiterInstance && rateLimiterInitialized) {
    return rateLimiterInstance;
  }

  const storage = await messenger.storage.local.get(DEFAULTS);
  const appConfig = storage as unknown as AppConfig;

  rateLimiterInstance = new RateLimiter(
    {
      openai: { limit: 500, window: 60000 },
      claude: { limit: 50, window: 60000 },
      ollama: { limit: 1000, window: 60000 },
      mistral: { limit: 50, window: 60000 },
      deepseek: { limit: 50, window: 60000 },
      gemini: { limit: 50, window: 60000 },
      zai: { limit: 50, window: 60000 },
    },
    appConfig
  );

  rateLimiterInitialized = true;

  logger.info('Rate limiter initialized', {
    providers: Object.keys(rateLimiterInstance.buckets).join(', '),
  });

  return rateLimiterInstance;
}

function resetRateLimiter(): void {
  rateLimiterInstance = null;
  rateLimiterInitialized = false;
}

// ============================================================================
// BADGE MANAGEMENT
// ============================================================================

/**
 * Badge configuration for different statuses
 */
const badgeConfig = {
  processing: { text: '⏳', color: '#2196F3' },
  success: { text: '', color: '' },
  error: { text: '⚠', color: '#F44336' },
} as const;

/**
 * Updates the browser badge based on status
 * @param status - Current badge status
 */
async function updateBadge(status: BadgeStatus): Promise<void> {
  const settings = await messenger.storage.local.get(DEFAULTS);

  const config = badgeConfig[status];
  if (!config) return;

  const badge = messenger.browserAction || messenger.action;
  if (!badge) return;

  badge.setBadgeText({ text: config.text });
  if (config.color) {
    badge.setBadgeBackgroundColor({ color: config.color });
  }
}

// ============================================================================
// NOTIFICATION MANAGEMENT
// ============================================================================

/**
 * Shows a notification to the user
 * @param title - Notification title
 * @param message - Notification message
 * @param type - Notification type ('info' or 'error')
 */
async function showNotification(
  title: string,
  message: string,
  type: NotificationType = 'info'
): Promise<void> {
  const settings = await messenger.storage.local.get(DEFAULTS);

  if (type === 'error' || (type === 'info' && settings.enableNotifications)) {
    messenger.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: title,
      message: message,
    });
  }
}

// ============================================================================
// EMAIL ANALYSIS
// ============================================================================

/**
 * Analyzes an email using the configured AI provider
 * @param structuredData - Structured email data including headers, body, and attachments
 * @param priority - Analysis priority (higher = more important)
 * @returns Promise resolving to analysis result or null on error
 */
async function analyzeEmail(
  structuredData: AnalysisData,
  priority: Priority = 1
): Promise<ExtendedAnalysisResult | null> {
  // Convert headers to Record<string, string> for provider compatibility
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(structuredData.headers)) {
    if (value && value.length > 0) {
      headers[key] = value[0];
    }
  }

  const providerData: StructuredEmailData = {
    headers,
    body: structuredData.body,
    attachments: structuredData.attachments,
  };

  // Check cache before API call
  const cacheKey = await createCacheKey(structuredData.body, headers);
  const cachedResult = await analysisCache.get(cacheKey);

  if (cachedResult) {
    logger.info('Using cached analysis result', { cacheKey });
    return cachedResult as ExtendedAnalysisResult;
  }

  const result = await messenger.storage.local.get(DEFAULTS);
  const settings = validateAppConfig(result);
  const engine: ProviderFunction | undefined = PROVIDER_ENGINES[settings.provider!];

  logger.info('Starting email analysis', {
    provider: settings.provider,
    priority,
    bodyLength: structuredData.body.length,
    attachmentCount: structuredData.attachments.length,
  });

  // Provider-Validierung
  if (!settings.provider || !isValidProvider(settings.provider)) {
    const error = `Invalid or missing provider configured: ${settings.provider || 'undefined'}. Please check your settings.`;
    await logAndDisplayError(
      error,
      ErrorType.PROVIDER,
      { provider: settings.provider },
      ErrorSeverity.WARNING
    );
    return null;
  }

  if (!engine) {
    const error = `Provider function not found for: ${settings.provider}`;
    await logAndDisplayError(
      error,
      ErrorType.PROVIDER,
      { provider: settings.provider },
      ErrorSeverity.WARNING
    );
    return null;
  }

  // Provider und Engine sind validiert - führe Analysis aus
  logger.info(`Using provider: ${settings.provider}`);
  try {
    await updateBadge('processing');
    logger.info('API call started', { provider: settings.provider, priority });
    const limiter = await getRateLimiter();
    const result = (await limiter.execute(
      settings.provider!,
      () => engine(settings, providerData, settings.customTags || DEFAULTS.customTags),
      priority,
      settings.model
    )) as ExtendedAnalysisResult;

    // Store result in cache after successful analysis
    await analysisCache.set(cacheKey, result);

    logger.info('API call completed successfully', {
      provider: settings.provider,
      tagsFound: result.tags?.length || 0,
      confidence: result.confidence,
    });
    await updateBadge('success');
    return result;
  } catch (error) {
    logAndDisplayError(
      error,
      ErrorType.PROVIDER,
      {
        provider: settings.provider,
        priority,
        action: 'email_analysis',
      },
      `AI provider error: ${error instanceof Error ? error.message : String(error)}`
    );
    await updateBadge('error');
    return null;
  }
}

// ============================================================================
// PRIORITY CALCULATION
// ============================================================================

/**
 * Calculates analysis priority based on email headers
 * @param headers - Email headers to analyze
 * @returns Priority level (higher = more important)
 */
function calculatePriority(headers: EmailHeaders): Priority {
  const from = headers['from']?.[0] ?? '';
  const subject = headers['subject']?.[0] ?? '';

  const highPriorityKeywords = ['urgent', 'important', 'asap', 'priority'];
  const highPriorityDomains = ['@company.com', '@important.org'];

  let priority: Priority = 1;

  for (const keyword of highPriorityKeywords) {
    if (subject.toLowerCase().includes(keyword)) {
      priority += 1;
    }
  }

  for (const domain of highPriorityDomains) {
    if (from.includes(domain)) {
      priority += 2;
    }
  }

  return priority;
}

// ============================================================================
// SINGLE MESSAGE ANALYSIS
// ============================================================================

/**
 * Analyzes a single message and applies tags
 * @param messageId - The ID of the message to analyze
 * @returns Promise resolving to success status and message
 */
async function analyzeSingleMessage(
  messageId: number
): Promise<{ success: boolean; message: string }> {
  logger.info('Single message analysis started', { messageId });

  try {
    const fullMessage = await messenger.messages.getFull(messageId);
    const { body, attachments } = findEmailParts(fullMessage.parts);

    const structuredData: AnalysisData = {
      headers: fullMessage.headers,
      body: body,
      attachments: attachments,
    };

    const priority = calculatePriority(fullMessage.headers);
    const analysis = await analyzeEmail(structuredData, priority);

    if (!analysis) {
      logger.warn('Analysis returned null', { messageId });
      return {
        success: false,
        message: 'Analysis failed: No result returned from AI provider',
      };
    }

    if (!isExtendedAnalysisResult(analysis)) {
      throw new Error('Analysis result has unexpected structure');
    }

    const storageResultRaw = await messenger.storage.local.get({ customTags: DEFAULTS.customTags });
    const storageResult = validateCustomTagsResult(storageResultRaw);
    const customTags = storageResult.customTags;
    const messageDetails: MessageDetails = await messenger.messages.get(messageId);
    const tagSet: Set<string> = new Set(messageDetails.tags ?? []);

    if (analysis.is_scam === true || analysis.spf_pass === false || analysis.dkim_pass === false) {
      tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.is_scam.key);
    }
    if (analysis.spf_pass === false) {
      tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.spf_fail.key);
    }
    if (analysis.dkim_pass === false) {
      tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.dkim_fail.key);
    }

    for (const tag of customTags) {
      const tagValue = analysis[tag.key];
      if (isBoolean(tagValue) && tagValue === true) {
        tagSet.add(TAG_KEY_PREFIX + tag.key);
      }
    }

    tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.tagged.key);
    tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.email_ai_analyzed.key);

    await messenger.messages.update(messageId, { tags: Array.from(tagSet) });
    logger.info('Single message tagged successfully', {
      messageId,
      tagSet: Array.from(tagSet),
    });

    await showNotification(
      'AI-Analyse abgeschlossen',
      'E-Mail erfolgreich analysiert und getaggt',
      'info'
    );

    return {
      success: true,
      message: 'Message analyzed and tagged successfully',
    };
  } catch (error) {
    logAndDisplayError(
      error,
      ErrorType.PROVIDER,
      {
        messageId,
        action: 'single_message_analysis',
      },
      'Single message analysis failed'
    );
    return {
      success: false,
      message: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Constant for maximum batch size
 */
const MAX_BATCH_SIZE = 1; // Zum Testen: 1 E-Mail gleichzeitig verarbeiten

/**
 * Processes a batch of email messages with loading, analysis, and tagging
 * @param messages - Array of message metadata objects to process
 * @param signal - Optional AbortSignal for cancellation support
 * @returns Promise resolving to batch processing statistics
 */
async function processEmailBatch(
  messages: Array<{ id: number }>,
  signal?: AbortSignal
): Promise<BatchStatistics> {
  const totalMessages = messages.length;
  let processedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;

  logger.info('Batch processing started', {
    totalMessages,
    timestamp: new Date().toISOString(),
  });

  // Process messages in batches
  for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
    // Check for cancellation before each batch (if signal provided)
    if (signal?.aborted) {
      throw new DOMException('Batch analysis cancelled', 'AbortError');
    }

    const batchMessages = messages.slice(i, i + MAX_BATCH_SIZE);
    const batchStart = i + 1;
    const batchEnd = Math.min(i + MAX_BATCH_SIZE, messages.length);

    logger.info(`Processing batch ${batchStart}-${batchEnd} of ${totalMessages}`);

    // Step 1: Load full messages in parallel
    const fullMessagesResults = await Promise.allSettled(
      batchMessages.map(async (message) => {
        return {
          messageId: message.id,
          fullMessage: await messenger.messages.getFull(message.id),
        };
      })
    );

    // Separate successful loads from failures
    const successfullyLoaded: Array<{ messageId: number; fullMessage: FullMessage }> = [];
    for (const result of fullMessagesResults) {
      if (result.status === 'fulfilled') {
        successfullyLoaded.push(result.value);
      } else {
        failedCount++;
        logAndDisplayError(result.reason, ErrorType.SYSTEM, {
          batch: `${batchStart}-${batchEnd}`,
          action: 'load_message',
        });
      }
    }

    logger.info(
      `Batch ${batchStart}-${batchEnd}: Loaded ${successfullyLoaded.length}/${batchMessages.length} messages`
    );

    // Step 2: Analyze messages in parallel with error isolation
    const analysisResults = await Promise.allSettled(
      successfullyLoaded.map(async ({ messageId, fullMessage }) => {
        const { body, attachments } = findEmailParts(fullMessage.parts);

        const structuredData: AnalysisData = {
          headers: fullMessage.headers,
          body: body,
          attachments: attachments,
        };

        const priority = calculatePriority(fullMessage.headers);
        const analysis = await analyzeEmail(structuredData, priority);

        return {
          messageId,
          fullMessage,
          analysisResult: analysis,
        } as ProcessedMessage;
      })
    );

    // Separate successful analyses from failures
    const successfullyAnalyzed: ProcessedMessage[] = [];
    for (const result of analysisResults) {
      if (result.status === 'fulfilled') {
        if (result.value.analysisResult !== null) {
          successfullyAnalyzed.push(result.value);
          successfulCount++;
        } else {
          failedCount++;
          logger.warn('Analysis returned null', { messageId: result.value.messageId });
        }
      } else {
        failedCount++;
        logger.error('Analysis failed', {
          messageId: 'unknown',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    // Step 3: Apply tags in parallel
    const taggingResults = await Promise.allSettled(
      successfullyAnalyzed.map(async (processed: ProcessedMessage) => {
        const analysis = processed.analysisResult;

        if (!isExtendedAnalysisResult(analysis)) {
          throw new Error('Analysis result has unexpected structure');
        }

        const storageResultRaw = await messenger.storage.local.get({
          customTags: DEFAULTS.customTags,
        });
        const storageResult = validateCustomTagsResult(storageResultRaw);
        const customTags = storageResult.customTags ?? DEFAULTS.customTags;
        const messageDetails: MessageDetails = await messenger.messages.get(processed.messageId);
        const tagSet: Set<string> = new Set(messageDetails.tags ?? []);

        // Handle hardcoded tags
        if (
          analysis.is_scam === true ||
          analysis.spf_pass === false ||
          analysis.dkim_pass === false
        ) {
          tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.is_scam.key);
        }
        if (analysis.spf_pass === false) {
          tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.spf_fail.key);
        }
        if (analysis.dkim_pass === false) {
          tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.dkim_fail.key);
        }

        // Handle dynamic custom tags
        for (const tag of customTags) {
          const tagValue = analysis[tag.key];
          if (isBoolean(tagValue) && tagValue === true) {
            tagSet.add(TAG_KEY_PREFIX + tag.key);
          }
        }

        tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.tagged.key);
        tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.email_ai_analyzed.key);

        await messenger.messages.update(processed.messageId, { tags: Array.from(tagSet) });
        logger.info('Message tagged successfully', {
          messageId: processed.messageId,
          tagSet: Array.from(tagSet),
        });

        return processed.messageId;
      })
    );

    // Track tagging failures
    for (const result of taggingResults) {
      if (result.status === 'rejected') {
        failedCount++;
        successfulCount--; // Revert successful count for tagging failures

        // Enhanced error logging with more details
        const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        logger.error('Failed to apply tags - DETAILED ERROR', {
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name,
          errorString: String(result.reason),
          errorType: typeof result.reason,
          errorKeys: typeof result.reason === 'object' ? Object.keys(result.reason) : undefined,
        });
      }
    }

    // Update progress
    processedCount += batchMessages.length;
    logger.info(`Batch progress: ${processedCount}/${totalMessages} messages processed`, {
      successful: successfulCount,
      failed: failedCount,
    });
  }

  const statistics: BatchStatistics = {
    total: totalMessages,
    successful: successfulCount,
    failed: failedCount,
  };

  logger.info('Batch processing completed', { ...statistics });

  return statistics;
}

/**
 * Analyzes multiple messages in batches with parallel processing
 * @param messages - Array of message metadata objects
 * @returns Promise resolving to batch processing statistics
 */
async function analyzeMessagesBatch(messages: Array<{ id: number }>): Promise<BatchStatistics> {
  return processEmailBatch(messages);
}

function registerFolderContextMenu(): void {
  messenger.menus.create(
    {
      id: 'batch-analyze-folder',
      title: 'Analysiere diesen Ordner',
      contexts: ['folder_pane'],
      visible: true,
    },
    () => {
      if (browser.runtime && browser.runtime.lastError) {
        logAndDisplayError(
          browser.runtime.lastError,
          ErrorType.SYSTEM,
          { action: 'create_context_menu' },
          'Failed to create folder context menu'
        );
      } else {
        logger.info('Folder context menu registered successfully');
      }
    }
  );

  messenger.menus.create(
    {
      id: 'analyze-single-message-list',
      title: 'AI-Analyse',
      contexts: ['message_list'],
      visible: true,
    },
    () => {
      if (browser.runtime && browser.runtime.lastError) {
        logAndDisplayError(
          browser.runtime.lastError,
          ErrorType.SYSTEM,
          { action: 'create_context_menu' },
          'Failed to create message list context menu'
        );
      } else {
        logger.info('Message list context menu registered successfully');
      }
    }
  );

  messenger.menus.create(
    {
      id: 'analyze-single-message-display',
      title: 'AI-Analyse',
      contexts: ['message_display_action_menu'],
      visible: true,
    },
    () => {
      if (browser.runtime && browser.runtime.lastError) {
        logAndDisplayError(
          browser.runtime.lastError,
          ErrorType.SYSTEM,
          { action: 'create_context_menu' },
          'Failed to create message display context menu'
        );
      } else {
        logger.info('Message display context menu registered successfully');
      }
    }
  );

  messenger.menus.onClicked.addListener(async (info: FolderMenuOnClickData, tab: Tab) => {
    // Validate menuItemId is string
    if (typeof info.menuItemId !== 'string') {
      logger.warn('Invalid menuItemId type', {
        menuItemId: info.menuItemId,
        type: typeof info.menuItemId,
      });
      return;
    }

    const menuItemId = info.menuItemId;

    if (menuItemId === 'batch-analyze-folder' && info.selectedFolders) {
      const folders = info.selectedFolders;
      if (folders.length > 0) {
        const folder = folders[0];
        const folderId = folder.id;
        logger.info('Context menu: Starting batch analysis for folder', {
          folderId,
          folderName: folder.name,
          folderPath: folder.path,
        });

        const result = await startBatchAnalysis(folderId);

        if (result.success) {
          await showNotification(
            'Batch-Analysis gestartet',
            `Analysiere ${result.messageCount} E-Mails in Ordner "${folder.name}"`,
            'info'
          );
          logger.info('Context menu: Batch analysis started', {
            messageCount: result.messageCount,
          });
        } else {
          logAndDisplayError(
            result.error || 'Unknown error',
            ErrorType.USER,
            {
              folderName: folder.name,
              folderId,
            },
            `Batch-Analysis fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`
          );
        }
      }
    }

    if (
      (menuItemId === 'analyze-single-message-list' ||
        menuItemId === 'analyze-single-message-display') &&
      'selectedMessages' in info &&
      info.selectedMessages
    ) {
      const messages = info.selectedMessages as Array<{ id: number }>;
      if (messages && messages.length > 0) {
        const messageId = messages[0].id;
        logger.info('Context menu: Starting single message analysis', { messageId });

        const result = await analyzeSingleMessage(messageId);

        if (result.success) {
          logger.info('Context menu: Single message analysis completed', { messageId });
        } else {
          logAndDisplayError(
            result.message,
            ErrorType.USER,
            {
              messageId,
            },
            `Einzelne Nachricht Analyse fehlgeschlagen: ${result.message}`
          );
        }
      }
    }
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Type guard for ExtendedAnalysisResult
 * @param result - Result to check
 * @returns True if result is an ExtendedAnalysisResult
 */
function isExtendedAnalysisResult(result: unknown): result is ExtendedAnalysisResult {
  if (typeof result !== 'object' || result === null) {
    return false;
  }

  const obj = result as Record<string, unknown>;

  // Prüfe Basis-Felder von TagResponse/AnalysisResult
  const hasTags = Array.isArray(obj.tags);
  const hasConfidence = typeof obj.confidence === 'number';
  const hasReasoning = typeof obj.reasoning === 'string';

  const hasBasicFields = hasTags && hasConfidence && hasReasoning;

  // Prüfe ob es Scam-Detection-Felder hat (optional)
  const hasScamFields =
    'is_scam' in obj ||
    'spf_pass' in obj ||
    'dkim_pass' in obj;

  return hasBasicFields;
}

/**
 * Type guard to check if a value is boolean
 * @param value - Value to check
 * @returns True if value is a boolean primitive type
 */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

logger.info('Spam-Filter Extension: Setting up onNewMailReceived handler');

/**
 * Handler for new mail received events
 * Processes messages through batch analysis and applies tags
 */
messenger.messages.onNewMailReceived.addListener(
  async (folder: Folder, messages: NewMailMessages): Promise<void> => {
    logger.info('New mail event received', {
      messageCount: messages.messages.length,
      folderName: folder.name,
      folderPath: folder.path,
      folderType: folder.type,
    });

    try {
      const statistics = await analyzeMessagesBatch(messages.messages);

      logger.info('New mail processing completed', {
        total: statistics.total,
        successful: statistics.successful,
        failed: statistics.failed,
      });

      if (statistics.failed > 0) {
        await showNotification(
          'Batch Processing Complete',
          `Processed: ${statistics.successful}/${statistics.total}\nFailed: ${statistics.failed}`,
          'info'
        );
      }
    } catch (error) {
      logAndDisplayError(
        error,
        ErrorType.SYSTEM,
        {
          folderName: folder.name,
          messageCount: messages.messages.length,
        },
        'Batch processing failed for new mail'
      );
    }
  }
);

// ============================================================================
// BATCH ANALYSIS API
// ============================================================================

/**
 * Storage key for batch analysis progress
 */
const BATCH_PROGRESS_KEY = 'batchAnalysis:progress';

/**
 * Global abort controller for canceling batch analysis
 */
let currentAbortController: AbortController | null = null;

/**
 * Checks if a message has already been analyzed (has custom tags)
 * @param messageTags - Array of message tags
 * @returns True if message has been analyzed
 */
function isMessageAnalyzed(messageTags: string[] = []): boolean {
  // Message is considered analyzed if it has the 'tagged' tag
  const taggedTag = TAG_KEY_PREFIX + HARDCODED_TAGS.tagged.key;
  return messageTags.some((tag) => tag === taggedTag || tag.startsWith(TAG_KEY_PREFIX));
}

/**
 * Filters messages that have not been analyzed yet
 * Uses parallel queries for O(1) performance instead of sequential O(n)
 * @param messages - Array of message metadata objects
 * @returns Promise resolving to array of unanalyzed messages
 */
async function filterUnanalyzedMessages(
  messages: Array<{ id: number }>
): Promise<Array<{ id: number }>> {
  const analyzedCount: number = messages.length;

  // Parallel query all message details at once
  const allDetailsResults = await Promise.allSettled(
    messages.map(
      (message): Promise<{ id: number; details: MessageDetails }> =>
        messenger.messages.get(message.id).then((details) => ({ id: message.id, details }))
    )
  );

  // Filter successfully retrieved and unanalyzed messages
  const unanalyzed: Array<{ id: number }> = [];
  let errorCount = 0;

  for (const result of allDetailsResults) {
    if (result.status === 'fulfilled') {
      const { id, details } = result.value;
      if (!isMessageAnalyzed(details.tags)) {
        unanalyzed.push({ id });
      }
    } else {
      errorCount++;
      logger.error('Failed to check message tags', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  const filteredOut = analyzedCount - unanalyzed.length - errorCount;
  logger.info(
    `Filtered messages: ${filteredOut} already analyzed, ${unanalyzed.length} to process, ${errorCount} errors`,
    {
      total: analyzedCount,
      filteredOut,
      remaining: unanalyzed.length,
      errors: errorCount,
    }
  );

  return unanalyzed;
}

/**
 * Updates the batch analysis progress in storage
 * @param progress - Current progress data
 */
async function updateBatchProgress(progress: BatchAnalysisProgress): Promise<void> {
  try {
    await messenger.storage.local.set({ [BATCH_PROGRESS_KEY]: progress });
  } catch (error) {
    logger.error('Failed to update batch progress in storage', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Retrieves the current batch analysis progress from storage
 * @returns Promise resolving to current progress or default idle state
 */
async function getBatchProgress(): Promise<BatchAnalysisProgress> {
  try {
    const result = await messenger.storage.local.get({ [BATCH_PROGRESS_KEY]: null });
    const stored = result[BATCH_PROGRESS_KEY];

    if (isBatchAnalysisProgress(stored)) {
      return stored;
    }

    // Return default idle state if no progress stored
    return {
      status: 'idle',
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
    };
  } catch (error) {
    logger.error('Failed to retrieve batch progress from storage', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'idle',
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
    };
  }
}

/**
 * Collects all messages from all folders
 * @returns Promise resolving to array of message objects
 */
async function collectAllMessages(): Promise<Array<{ id: number }>> {
  const allMessages: Array<{ id: number }> = [];

  try {
    const folders = await messenger.folders.query({});

    for (const folder of folders) {
      try {
        logger.info('Collecting messages from folder', {
          accountId: folder.accountId,
          folderId: folder.id,
          folderName: folder.name,
          folderPath: folder.path,
        });
        const result = await messenger.messages.list(folder.id);
        if (result.messages && result.messages.length > 0) {
          allMessages.push(...result.messages);
        }
      } catch (error) {
        logger.warn('Failed to list messages for folder', {
          accountId: folder.accountId,
          folderId: folder.id,
          folderName: folder.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(`Collected ${allMessages.length} messages from ${folders.length} folders`);
  } catch (error) {
    logger.error('Failed to query folders', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return allMessages;
}

/**
 * Starts a batch analysis of messages
 * @param folderId - Optional folder ID to analyze. If not provided, analyzes all messages.
 * @returns Promise resolving to start result with statistics or error
 */
async function startBatchAnalysis(folderId?: string): Promise<BatchAnalysisStartResult> {
  try {
    // Check if another batch is already running
    const currentProgress = await getBatchProgress();
    if (currentProgress.status === 'running') {
      logger.warn('Batch analysis already running');
      return {
        success: false,
        error: 'Batch analysis is already running. Cancel the current batch first.',
      };
    }

    // Create new abort controller for this batch
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // Fetch messages from the specified folder or all accounts
    let messages: Array<{ id: number }>;
    try {
      logger.info('Collecting messages', { folderId });
      messages =
        folderId !== undefined
          ? (await messenger.messages.list(folderId)).messages
          : await collectAllMessages();
      logger.info(
        `Collected ${messages.length} messages from ${folderId ? 'folder' : 'all folders'}`
      );
    } catch (error) {
      logAndDisplayError(
        error,
        ErrorType.SYSTEM,
        {
          folderId,
          action: 'collect_messages',
        },
        'Failed to retrieve messages. Please check folder permissions.'
      );
      return {
        success: false,
        error: 'Failed to retrieve messages. Please check folder permissions.',
      };
    }

    if (messages.length === 0) {
      logger.info('No messages found to analyze');
      return {
        success: false,
        error: 'No messages found to analyze.',
      };
    }

    // Filter out already analyzed messages
    const unanalyzedMessages = await filterUnanalyzedMessages(messages);

    if (unanalyzedMessages.length === 0) {
      logger.info('No unanalyzed messages found - all messages already processed');
      return {
        success: false,
        error: 'No unanalyzed messages found. All messages have already been processed.',
      };
    }

    // Initialize progress
    const progress: BatchAnalysisProgress = {
      status: 'running',
      total: unanalyzedMessages.length,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
    };
    await updateBatchProgress(progress);

    logger.info(`Starting batch analysis: ${unanalyzedMessages.length} messages to process`);

    // Run analysis in background with progress updates
    const analysisTask = (async (): Promise<BatchStatistics> => {
      // Process with cancellation support and progress tracking
      const statistics = await processEmailBatch(unanalyzedMessages, signal);

      // Final progress update is handled in .then() block
      return statistics;
    })();

    analysisTask
      .then(async (statistics) => {
        const finalProgress: BatchAnalysisProgress = {
          status: 'completed',
          total: statistics.total,
          processed: statistics.total,
          successful: statistics.successful,
          failed: statistics.failed,
          startTime: progress.startTime,
          endTime: Date.now(),
        };
        await updateBatchProgress(finalProgress);
        logger.info('Batch analysis completed successfully', statistics);
      })
      .catch(async (error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const cancelProgress = await getBatchProgress();
          const finalProgress: BatchAnalysisProgress = {
            ...cancelProgress,
            status: 'cancelled',
            endTime: Date.now(),
          };
          await updateBatchProgress(finalProgress);
        } else {
          const errorProgress: BatchAnalysisProgress = {
            status: 'error',
            total: 0,
            processed: 0,
            successful: 0,
            failed: 0,
            startTime: progress.startTime,
            endTime: Date.now(),
            errorMessage: error instanceof Error ? error.message : String(error),
          };
          await updateBatchProgress(errorProgress);
          logger.error('Batch analysis failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        currentAbortController = null;
      });

    return {
      success: true,
      messageCount: unanalyzedMessages.length,
    };
  } catch (error) {
    logger.error('Failed to start batch analysis', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: `Failed to start batch analysis: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Cancels the currently running batch analysis
 * @returns Promise resolving to cancel result
 */
async function cancelBatchAnalysis(): Promise<{ success: boolean; message: string }> {
  try {
    const currentProgress = await getBatchProgress();

    if (currentProgress.status !== 'running') {
      return {
        success: false,
        message: 'No batch analysis is currently running.',
      };
    }

    if (currentAbortController === null) {
      return {
        success: false,
        message: 'Batch analysis controller not available.',
      };
    }

    // Abort the current analysis
    currentAbortController.abort();

    logger.info('Batch analysis cancellation requested');

    return {
      success: true,
      message: 'Batch analysis cancellation requested. The current batch will be cancelled.',
    };
  } catch (error) {
    logger.error('Failed to cancel batch analysis', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      message: `Failed to cancel batch analysis: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clears all queues in the rate limiter
 * @param cancelRunning - Whether to cancel running processes
 * @returns Promise resolving to clear queue result
 */
async function clearQueue(cancelRunning: boolean = false): Promise<ClearQueueResult> {
  try {
    const limiter = await getRateLimiter();
    const result = limiter.clearQueue(cancelRunning);

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    logger.error('Failed to clear queues', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      clearedTasks: 0,
      cancelledProviders: [],
      providers: {},
    };
  }
}

/**
 * Clears all entries from analysis cache
 * @returns Promise resolving to success result
 */
async function clearCache(): Promise<{ success: boolean; message: string }> {
  try {
    await analysisCache.clear();

    logger.info('Analysis cache cleared');

    return {
      success: true,
      message: 'Cache erfolgreich geleert',
    };
  } catch (error) {
    logger.error('Failed to clear cache', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      message: `Fehler beim Leeren des Cache: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Gets cache statistics
 * @returns Promise resolving to cache stats
 */
async function getCacheStats(): Promise<GetCacheStatsResponse> {
  try {
    const stats = await analysisCache.getStats();

    logger.info('Cache stats retrieved', { ...stats } as Record<string, unknown>);

    return {
      success: true,
      totalEntries: stats.totalEntries,
      hitRate: stats.hitRate,
    };
  } catch (error) {
    logger.error('Failed to get cache stats', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      message: `Fehler beim Abrufen der Statistiken: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// RUNTIME MESSAGE HANDLERS
// ============================================================================

/**
 * Handles incoming runtime messages from options page
 * @param message - The received message
 * @param sender - Message sender information
 * @param sendResponse - Function to send response back
 * @returns true if response is sent asynchronously
 */
async function handleRuntimeMessage(
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
): Promise<boolean> {
  try {
    if (isStartBatchAnalysisMessage(message)) {
      const result = await startBatchAnalysis(message.folderId);
      sendResponse(result);
      return false;
    }

    if (isGetBatchProgressMessage(message)) {
      const progress = await getBatchProgress();
      sendResponse(progress);
      return false;
    }

    if (isCancelBatchAnalysisMessage(message)) {
      const result = await cancelBatchAnalysis();
      if (result.success) {
        await clearQueue(true);
      }
      sendResponse(result);
      return false;
    }

    if (isClearQueueMessage(message)) {
      const result = await clearQueue(message.cancelRunning ?? false);
      sendResponse(result);
      return false;
    }

    if (isClearCacheMessage(message)) {
      const result = await clearCache();
      sendResponse(result);
      return false;
    }

    if (isGetCacheStatsMessage(message)) {
      const result = await getCacheStats();
      sendResponse(result);
      return false;
    }

    // Handle error display messages (these don't need response)
    if (isShowErrorRuntimeMessage(message)) {
      // Error was already logged in logAndDisplayError
      // Just acknowledge receipt
      sendResponse({ success: true });
      return false;
    }

    // Unknown message type
    logger.warn('Unknown runtime message received', { message });
    sendResponse({ success: false, message: 'Unknown message type' });
    return false;
  } catch (error) {
    logAndDisplayError(
      error,
      ErrorType.SYSTEM,
      {
        message,
        action: 'handle_runtime_message',
      },
      'Internal error processing message'
    );
    sendResponse({ success: false, message: 'Internal error processing message' });
    return false;
  }
}

/**
 * Type guard for ShowErrorRuntimeMessage
 */
function isShowErrorRuntimeMessage(message: unknown): message is ShowErrorRuntimeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'showError' &&
    'error' in message
  );
}

// Register runtime message handler
messenger.runtime.onMessage.addListener(handleRuntimeMessage);

logger.info('Spam-Filter Extension: Batch analysis API registered');

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the extension by ensuring all tags exist
 */
ensureTagsExist();

registerFolderContextMenu();

const browserAction = messenger.browserAction || messenger.action;
if (browserAction && browserAction.onClicked) {
  browserAction.onClicked.addListener(async (tab: Tab) => {
    try {
      logger.info('Toolbar button clicked', { tabId: tab.id, tabType: tab.type });

      const displayedMessage = await messenger.messageDisplay.getDisplayedMessage(tab.id);

      if (!displayedMessage) {
        await showNotification(
          'Keine Nachricht',
          'Keine Nachricht in diesem Tab angezeigt',
          'error'
        );
        logger.info('No message displayed in tab');
        return;
      }

      const messageId = displayedMessage.id;
      logger.info('Toolbar button: Starting single message analysis', { messageId });

      const result = await analyzeSingleMessage(messageId);

      if (result.success) {
        logger.info('Toolbar button: Single message analysis completed', { messageId });
      } else {
        logAndDisplayError(
          result.message,
          ErrorType.USER,
          {
            messageId,
          },
          `Einzelne Nachricht Analyse fehlgeschlagen: ${result.message}`
        );
      }
    } catch (error) {
      logAndDisplayError(
        error,
        ErrorType.SYSTEM,
        {
          action: 'toolbar_button_click',
        },
        'Fehler beim Klicken auf den Toolbar-Button'
      );
    }
  });

  logger.info('Toolbar button registered successfully');
} else {
  logger.warn('Browser action API not available for toolbar button');
}
