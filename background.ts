import {
  DEFAULTS,
  HARDCODED_TAGS,
  TAG_KEY_PREFIX,
  CustomTags,
  AppConfig,
  Tag
} from './core/config';
import {
  findEmailParts,
  Attachment,
  StructuredEmailData
} from './core/analysis';
import {
  ensureTagsExist
} from './core/tags';
import {
  PROVIDER_ENGINES,
  ProviderFunction
} from './providers/index';
import {
  logger,
  logAndDisplayError,
  ErrorType,
  ShowErrorRuntimeMessage
} from './providers/utils';

// ============================================================================
// BROWSER WEBEXTENSION API TYPES
// ============================================================================

/**
 * Thunderbird/WebExtension global messenger object
 */
interface Messenger {
  messages: {
    onNewMailReceived: {
      addListener(callback: (folder: any, messages: NewMailMessages) => void): void;
    };
    getFull(messageId: number): Promise<FullMessage>;
    get(messageId: number): Promise<MessageDetails>;
    update(messageId: number, properties: { tags: string[] }): Promise<void>;
    list(folderId?: string): Promise<MessageListResult>;
    tags: {
      create(key: string, tag: string, color: string): Promise<void>;
      list(): Promise<any[]>;
    };
  };
  folders: {
    query(query: any): Promise<MailFolder[]>;
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
      addListener(callback: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void): void;
    };
  };
  notifications: {
    create(options: NotificationOptions): Promise<string>;
  };
  menus: {
    create(createProperties: any, callback?: () => void): void;
    onClicked: {
      addListener(callback: (info: any, tab: any) => void): void;
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
  resolve: (value: any) => void;
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
  [provider: string]: QueuedTask[];
}

/**
 * Rate limiter processing promises map
 */
interface RateLimiterProcessing {
  [provider: string]: Promise<void> | null;
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
 * Discriminated union for runtime message responses
 */
type RuntimeMessageResponse =
  | BatchAnalysisStartResult
  | BatchAnalysisProgress
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

// ============================================================================
// GLOBAL DECLARATIONS
// ============================================================================

declare const messenger: Messenger;
declare const browser: any;

logger.info("Spam-Filter Extension: Background script loaded.");

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

/**
 * Rate limiter class to manage API request rates per provider
 * Uses token bucket algorithm with priority queue
 */
class RateLimiter {
  public readonly buckets: RateLimiterBuckets;
  private readonly queues: RateLimiterQueues;
  private readonly processing: RateLimiterProcessing;

  /**
   * Creates a new RateLimiter instance
   * @param config - Rate limiter configuration for each provider
   */
  constructor(config: RateLimiterConfigMap) {
    this.buckets = {};
    this.queues = {};
    this.processing = {};

    for (const provider in config) {
      this.buckets[provider] = {
        tokens: config[provider].limit,
        lastRefill: Date.now(),
        limit: config[provider].limit,
        window: config[provider].window
      };
      this.queues[provider] = [];
      this.processing[provider] = null;
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
            (resolve as (value: unknown) => void)(result);
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
   * @returns Promise resolving to function result
   */
  async execute<T>(provider: string, requestFn: () => Promise<T>, priority: Priority = 1): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queues[provider].push({ fn: requestFn, resolve, reject, priority });
      this.queues[provider].sort((a, b) => b.priority - a.priority);
      this.processQueue(provider);
    });
  }
}

// ============================================================================
// RATE LIMITER INSTANCE
// ============================================================================

const rateLimiter = new RateLimiter({
  openai: { limit: 500, window: 60000 },
  claude: { limit: 50, window: 60000 },
  ollama: { limit: 1000, window: 60000 },
  mistral: { limit: 50, window: 60000 },
  deepseek: { limit: 50, window: 60000 },
  gemini: { limit: 50, window: 60000 }
});

// ============================================================================
// BADGE MANAGEMENT
// ============================================================================

/**
 * Badge configuration for different statuses
 */
const badgeConfig = {
  processing: { text: '⏳', color: '#2196F3' },
  success: { text: '', color: '' },
  error: { text: '⚠', color: '#F44336' }
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
      message: message
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
    attachments: structuredData.attachments
  };
  const settings = await messenger.storage.local.get(DEFAULTS) as Partial<AppConfig>;
  const engine: ProviderFunction | undefined = PROVIDER_ENGINES[settings.provider!];

  logger.info('Starting email analysis', {
    provider: settings.provider,
    priority,
    bodyLength: structuredData.body.length,
    attachmentCount: structuredData.attachments.length,
  });

  if (engine) {
    logger.info(`Using provider: ${settings.provider}`);
    try {
      await updateBadge('processing');
      logger.info('API call started', { provider: settings.provider, priority });
      const result = await rateLimiter.execute(
        settings.provider!,
        () => engine(settings, providerData, settings.customTags || DEFAULTS.customTags),
        priority
      ) as ExtendedAnalysisResult;
      logger.info('API call completed successfully', {
        provider: settings.provider,
        tagsFound: result.tags?.length || 0,
        confidence: result.confidence,
      });
      await updateBadge('success');
      return result;
    } catch (error) {
      logAndDisplayError(error, ErrorType.PROVIDER, {
        provider: settings.provider,
        priority,
        action: 'email_analysis',
      });
      await updateBadge('error');
      throw error;
    }
  } else {
    const error = `No analysis engine found for provider: ${settings.provider}`;
    logAndDisplayError(error, ErrorType.SYSTEM, { provider: settings.provider });
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
// BATCH PROCESSING
// ============================================================================

/**
 * Constant for maximum batch size
 */
const MAX_BATCH_SIZE = 10;

/**
 * Analyzes multiple messages in batches with parallel processing
 * @param messages - Array of message metadata objects
 * @returns Promise resolving to batch processing statistics
 */
async function analyzeMessagesBatch(messages: Array<{ id: number }>): Promise<BatchStatistics> {
  const totalMessages = messages.length;
  let processedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;

  logger.info('Batch processing started', {
    totalMessages,
    timestamp: new Date().toISOString(),
  });

  // Process messages in batches of MAX_BATCH_SIZE
  for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
    const batchMessages = messages.slice(i, i + MAX_BATCH_SIZE);
    const batchStart = i + 1;
    const batchEnd = Math.min(i + MAX_BATCH_SIZE, messages.length);

    logger.info(`Processing batch ${batchStart}-${batchEnd} of ${totalMessages}`);

    // Step 1: Load full messages in parallel
    const fullMessagesResults = await Promise.allSettled(
      batchMessages.map(async (message) => {
        return {
          messageId: message.id,
          fullMessage: await messenger.messages.getFull(message.id)
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
        logAndDisplayError(
          result.reason,
          ErrorType.SYSTEM,
          { batch: `${batchStart}-${batchEnd}`, action: 'load_message' }
        );
      }
    }

    logger.info(`Batch ${batchStart}-${batchEnd}: Loaded ${successfullyLoaded.length}/${batchMessages.length} messages`);

    // Step 2: Analyze messages in parallel with error isolation
    const analysisResults = await Promise.allSettled(
      successfullyLoaded.map(async ({ messageId, fullMessage }) => {
        const { body, attachments } = findEmailParts(fullMessage.parts);

        const structuredData: AnalysisData = {
          headers: fullMessage.headers,
          body: body,
          attachments: attachments
        };

        const priority = calculatePriority(fullMessage.headers);
        const analysis = await analyzeEmail(structuredData, priority);

        return {
          messageId,
          fullMessage,
          analysisResult: analysis
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
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
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

        const storageResult = await messenger.storage.local.get({ customTags: DEFAULTS.customTags }) as { customTags: CustomTags };
        const customTags = storageResult.customTags ?? DEFAULTS.customTags;
        const messageDetails: MessageDetails = await messenger.messages.get(processed.messageId);
        const tagSet: Set<string> = new Set(messageDetails.tags ?? []);

        // Handle hardcoded tags
        if (analysis.is_scam === true || analysis.spf_pass === false || analysis.dkim_pass === false) {
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

        await messenger.messages.update(processed.messageId, { tags: Array.from(tagSet) });
        logger.info('Message tagged successfully', {
          messageId: processed.messageId,
          tagSet: Array.from(tagSet)
        });

        return processed.messageId;
      })
    );

    // Track tagging failures
    for (const result of taggingResults) {
      if (result.status === 'rejected') {
        failedCount++;
        successfulCount--; // Revert successful count for tagging failures
        logger.error('Failed to apply tags', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }

    // Update progress
    processedCount += batchMessages.length;
    logger.info(`Batch progress: ${processedCount}/${totalMessages} messages processed`, {
      successful: successfulCount,
      failed: failedCount
    });
  }

  const statistics: BatchStatistics = {
    total: totalMessages,
    successful: successfulCount,
    failed: failedCount
  };

  logger.info('Batch processing completed', { ...statistics });

  return statistics;
}

function registerFolderContextMenu(): void {
  messenger.menus.create({
    id: 'batch-analyze-folder',
    title: 'Analysiere diesen Ordner',
    contexts: ['folder_pane'],
    visible: true
  }, () => {
    // Note: browser.runtime.lastError is valid for WebExtensions API
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
  });

  messenger.menus.onClicked.addListener(async (info: any, tab: any) => {
    const folderInfo = info as FolderMenuOnClickData;
    if (folderInfo.menuItemId === 'batch-analyze-folder' && folderInfo.selectedFolders) {
      const folders = folderInfo.selectedFolders;
      if (folders.length > 0) {
        const folder = folders[0];
        const folderId = folder.accountId;
        logger.info('Context menu: Starting batch analysis for folder', {
          folderId,
          folderName: folder.name,
          folderPath: folder.path
        });

        const result = await startBatchAnalysis(folderId);

        if (result.success) {
          await showNotification(
            'Batch-Analysis gestartet',
            `Analysiere ${result.messageCount} E-Mails in Ordner "${folder.name}"`,
            'info'
          );
          logger.info('Context menu: Batch analysis started', { messageCount: result.messageCount });
        } else {
          logAndDisplayError(result.error || 'Unknown error', ErrorType.USER, {
            folderName: folder.name,
            folderId,
          }, `Batch-Analysis fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
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
  return (
    typeof result === 'object' &&
    result !== null &&
    ('is_scam' in result || 'spf_pass' in result || 'dkim_pass' in result)
  );
}

/**
 * Type guard to check if a value is boolean
 * @param value - Value to check
 * @returns True if value is strictly true or false
 */
function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

logger.info("Spam-Filter Extension: Setting up onNewMailReceived handler");

/**
 * Handler for new mail received events
 * Processes messages through batch analysis and applies tags
 */
messenger.messages.onNewMailReceived.addListener(async (
  folder: Folder,
  messages: NewMailMessages
): Promise<void> => {
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
    logAndDisplayError(error, ErrorType.SYSTEM, {
      folderName: folder.name,
      messageCount: messages.messages.length,
    }, 'Batch processing failed for new mail');
  }
});

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
  return messageTags.some(tag => tag === taggedTag || tag.startsWith(TAG_KEY_PREFIX));
}

/**
 * Filters messages that have not been analyzed yet
 * @param messages - Array of message metadata objects
 * @returns Promise resolving to array of unanalyzed messages
 */
async function filterUnanalyzedMessages(messages: Array<{ id: number }>): Promise<Array<{ id: number }>> {
  const unanalyzed: Array<{ id: number }> = [];
  const analyzedCount: number = messages.length;

  for (const message of messages) {
    try {
      const details: MessageDetails = await messenger.messages.get(message.id);
      if (!isMessageAnalyzed(details.tags)) {
        unanalyzed.push(message);
      }
    } catch (error) {
      logger.error('Failed to check message tags', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error)
      });
      // Skip messages we can't check
    }
  }

  const filteredOut = analyzedCount - unanalyzed.length;
  logger.info(`Filtered messages: ${filteredOut} already analyzed, ${unanalyzed.length} to process`, {
    total: analyzedCount,
    filteredOut,
    remaining: unanalyzed.length,
  });

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
      error: error instanceof Error ? error.message : String(error)
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

    if (stored && typeof stored === 'object' && 'status' in stored) {
      return stored as BatchAnalysisProgress;
    }

    // Return default idle state if no progress stored
    return {
      status: 'idle',
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now()
    };
  } catch (error) {
    logger.error('Failed to retrieve batch progress from storage', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      status: 'idle',
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now()
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
        const result = await messenger.messages.list(folder.accountId);
        if (result.messages && result.messages.length > 0) {
          allMessages.push(...result.messages);
        }
      } catch (error) {
        logger.warn('Failed to list messages for folder', {
          folderId: folder.accountId,
          folderName: folder.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    logger.info(`Collected ${allMessages.length} messages from ${folders.length} folders`);
  } catch (error) {
    logger.error('Failed to query folders', {
      error: error instanceof Error ? error.message : String(error)
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
        error: 'Batch analysis is already running. Cancel the current batch first.'
      };
    }

    // Create new abort controller for this batch
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // Fetch messages from the specified folder or all accounts
    let messages: Array<{ id: number }>;
    try {
      logger.info('Collecting messages', { folderId });
      messages = folderId !== undefined
        ? (await messenger.messages.list(folderId)).messages
        : await collectAllMessages();
      logger.info(`Collected ${messages.length} messages from ${folderId ? 'folder' : 'all folders'}`);
    } catch (error) {
      logAndDisplayError(error, ErrorType.SYSTEM, {
        folderId,
        action: 'collect_messages',
      }, 'Failed to retrieve messages. Please check folder permissions.');
      return {
        success: false,
        error: 'Failed to retrieve messages. Please check folder permissions.'
      };
    }

  if (messages.length === 0) {
    logger.info('No messages found to analyze');
    return {
      success: false,
      error: 'No messages found to analyze.'
    };
  }

    // Filter out already analyzed messages
    const unanalyzedMessages = await filterUnanalyzedMessages(messages);

    if (unanalyzedMessages.length === 0) {
      logger.info('No unanalyzed messages found - all messages already processed');
      return {
        success: false,
        error: 'No unanalyzed messages found. All messages have already been processed.'
      };
    }

    // Initialize progress
    const progress: BatchAnalysisProgress = {
      status: 'running',
      total: unanalyzedMessages.length,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now()
    };
    await updateBatchProgress(progress);

    logger.info(`Starting batch analysis: ${unanalyzedMessages.length} messages to process`);

    // Run analysis in background without waiting
    const analysisTask = (async (): Promise<BatchStatistics> => {
      let processedCount = 0;
      let successfulCount = 0;
      let failedCount = 0;

      // Process messages in batches
      for (let i = 0; i < unanalyzedMessages.length; i += MAX_BATCH_SIZE) {
        // Check for cancellation before each batch
        if (signal.aborted) {
          throw new DOMException('Batch analysis cancelled', 'AbortError');
        }

        const batchMessages = unanalyzedMessages.slice(i, i + MAX_BATCH_SIZE);
        const batchStart = i + 1;
        const batchEnd = Math.min(i + MAX_BATCH_SIZE, unanalyzedMessages.length);

        logger.info(`Processing batch ${batchStart}-${batchEnd} of ${unanalyzedMessages.length}`);

        // Load full messages in parallel
        const fullMessagesResults = await Promise.allSettled(
          batchMessages.map(async (message) => {
            return {
              messageId: message.id,
              fullMessage: await messenger.messages.getFull(message.id)
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
            logger.error('Failed to load message', {
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        }

        // Analyze messages in parallel
        logger.info(`Starting analysis for ${successfullyLoaded.length} messages`);
        const analysisResults = await Promise.allSettled(
          successfullyLoaded.map(async ({ messageId, fullMessage }) => {
            const { body, attachments } = findEmailParts(fullMessage.parts);

            const structuredData: AnalysisData = {
              headers: fullMessage.headers,
              body: body,
              attachments: attachments
            };

            const priority = calculatePriority(fullMessage.headers);
            const analysis = await analyzeEmail(structuredData, priority);

            return {
              messageId,
              fullMessage,
              analysisResult: analysis
            } as ProcessedMessage;
          })
        );

        // Separate successful analyses
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
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        }

        // Apply tags in parallel
        const taggingResults = await Promise.allSettled(
          successfullyAnalyzed.map(async (processed: ProcessedMessage) => {
            const analysis = processed.analysisResult;

            if (!isExtendedAnalysisResult(analysis)) {
              throw new Error('Analysis result has unexpected structure');
            }

            const storageResult = await messenger.storage.local.get({ customTags: DEFAULTS.customTags }) as { customTags: CustomTags };
            const customTags = storageResult.customTags ?? DEFAULTS.customTags;
            const messageDetails: MessageDetails = await messenger.messages.get(processed.messageId);
            const tagSet: Set<string> = new Set(messageDetails.tags ?? []);

            // Handle hardcoded tags
            if (analysis.is_scam === true || analysis.spf_pass === false || analysis.dkim_pass === false) {
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

            await messenger.messages.update(processed.messageId, { tags: Array.from(tagSet) });
            logger.info('Message tagged successfully', {
              messageId: processed.messageId,
              tagSet: Array.from(tagSet)
            });

            return processed.messageId;
          })
        );

        // Track tagging failures
        for (const result of taggingResults) {
          if (result.status === 'rejected') {
            failedCount++;
            successfulCount--;
            logger.error('Failed to apply tags', {
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        }

        // Update progress after batch
        processedCount += batchMessages.length;
        const updatedProgress: BatchAnalysisProgress = {
          status: 'running',
          total: unanalyzedMessages.length,
          processed: processedCount,
          successful: successfulCount,
          failed: failedCount,
          startTime: progress.startTime
        };
        await updateBatchProgress(updatedProgress);

        logger.info(`Batch progress: ${processedCount}/${unanalyzedMessages.length}`, {
          successful: successfulCount,
          failed: failedCount
        });
      }

      return {
        total: unanalyzedMessages.length,
        successful: successfulCount,
        failed: failedCount
      };
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
          endTime: Date.now()
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
            endTime: Date.now()
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
            errorMessage: error instanceof Error ? error.message : String(error)
          };
          await updateBatchProgress(errorProgress);
          logger.error('Batch analysis failed', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
      .finally(() => {
        currentAbortController = null;
      });

    return {
      success: true,
      messageCount: unanalyzedMessages.length
    };
  } catch (error) {
    logger.error('Failed to start batch analysis', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      success: false,
      error: `Failed to start batch analysis: ${error instanceof Error ? error.message : String(error)}`
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
        message: 'No batch analysis is currently running.'
      };
    }

    if (currentAbortController === null) {
      return {
        success: false,
        message: 'Batch analysis controller not available.'
      };
    }

    // Abort the current analysis
    currentAbortController.abort();

    logger.info('Batch analysis cancellation requested');

    return {
      success: true,
      message: 'Batch analysis cancellation requested. The current batch will be cancelled.'
    };
  } catch (error) {
    logger.error('Failed to cancel batch analysis', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      message: `Failed to cancel batch analysis: ${error instanceof Error ? error.message : String(error)}`
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
    logAndDisplayError(error, ErrorType.SYSTEM, {
      message,
      action: 'handle_runtime_message',
    }, 'Internal error processing message');
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
