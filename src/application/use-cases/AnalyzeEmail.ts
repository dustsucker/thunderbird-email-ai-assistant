/**
 * AnalyzeEmail Use Case
 *
 * Orchestrates email analysis by coordinating specialized use cases:
 * - RetrieveEmailUseCase: Email retrieval from Thunderbird
 * - ExtractEmailContentUseCase: Content extraction for AI analysis
 * - CacheAnalysisUseCase: Caching operations
 * - ApplyTagsWithConfidenceUseCase: Tag application with confidence filtering
 *
 * This use case implements the complete email analysis workflow:
 * 1. Checks if email was already analyzed
 * 2. Retrieves email from Thunderbird
 * 3. Extracts structured content
 * 4. Loads custom tags from config
 * 5. Checks cache for cached analysis results
 * 6. Performs AI analysis via Provider (if cache miss)
 * 7. Caches the analysis result
 * 8. Applies tags to the message
 *
 * @module application/use-cases/AnalyzeEmail
 */

import { injectable, inject } from 'tsyringe';
import type { ITagResponse, IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import type { ILogger } from '@/domain/interfaces';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import { RetrieveEmailUseCase } from './RetrieveEmailUseCase';
import { ExtractEmailContentUseCase } from './ExtractEmailContentUseCase';
import { CacheAnalysisUseCase } from './CacheAnalysisUseCase';
import { ApplyTagsWithConfidenceUseCase } from './ApplyTagsWithConfidenceUseCase';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of email analysis including tags and metadata.
 */
export interface AnalyzeEmailResult extends ITagResponse {
  /** The message ID that was analyzed */
  messageId: string;
  /** Cache key for this analysis (SHA-256 hash) */
  cacheKey: string;
  /** Whether result was retrieved from cache */
  fromCache: boolean;
  /** Number of tags applied */
  tagsApplied: number;
}

/**
 * Configuration for email analysis.
 */
export interface AnalyzeEmailConfig {
  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtl?: number;
  /** Whether to force re-analysis (bypass cache) */
  forceReanalyze?: boolean;
  /** Whether to apply tags after analysis (default: true) */
  applyTags?: boolean;
  /** Custom tags to use for analysis (optional) */
  customTags?: Array<{ key: string; name: string; description: string }>;
  /** AbortSignal for cancelling the analysis */
  signal?: AbortSignal;
}

// ============================================================================
// Constants
// ============================================================================

/** Index key tracking stored low-confidence flag entries and their timestamps. */
export const LOW_CONFIDENCE_INDEX_KEY = 'lowConfidenceIndex';
/** Low-confidence flag entries older than this are pruned. */
const LOW_CONFIDENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Detects a fetch/provider AbortError across engines (DOMException extends Error
 * in modern runtimes, but duck-typing the `name` is the portable check).
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * AnalyzeEmail Use Case
 *
 * Orchestrates the complete email analysis workflow using specialized sub-use-cases.
 * Uses dependency injection for all dependencies.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<AnalyzeEmail>(AnalyzeEmail);
 * const result = await useCase.execute('12345', {
 *   apiKey: 'sk-...',
 *   provider: 'openai',
 *   model: 'gpt-4'
 * });
 * console.log(`Analyzed email, tags: ${result.tags.join(', ')}`);
 * ```
 */
@injectable()
export class AnalyzeEmail {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  /**
   * In-flight analyses keyed by message ID. Concurrent triggers (new mail,
   * context menu, toolbar) join the existing promise instead of re-analyzing.
   * // ponytail: single-instance guard; multi-process coordination needs a lock key in storage.
   */
  private readonly inFlight = new Map<string, Promise<ITagResponse>>();

  // ==========================================================================
  // Constructor (6 dependencies, down from 10)
  // ==========================================================================

  constructor(
    @inject('ProviderFactory') private readonly providerFactory: ProviderFactory,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository,
    @inject(EmailAnalysisTracker) private readonly analysisTracker: EmailAnalysisTracker,
    @inject('ILogger') private readonly logger: ILogger,
    // Sub-use-cases
    @inject(RetrieveEmailUseCase) private readonly retrieveEmail: RetrieveEmailUseCase,
    @inject(ExtractEmailContentUseCase) private readonly extractContent: ExtractEmailContentUseCase,
    @inject(CacheAnalysisUseCase) private readonly cacheAnalysis: CacheAnalysisUseCase,
    @inject(ApplyTagsWithConfidenceUseCase)
    private readonly applyTagsWithConfidence: ApplyTagsWithConfidenceUseCase
  ) {
    this.logger.debug('[DEBUG] AnalyzeEmail use case initialized (refactored)');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Executes email analysis for a single message.
   *
   * Concurrent invocations for the same message ID share one in-flight analysis,
   * closing the TOCTOU gap between the `wasAnalyzed()` check and `markAnalyzed()`.
   *
   * @param messageId - Thunderbird message ID (as string for flexibility)
   * @param providerSettings - Provider configuration (including providerId)
   * @param config - Optional analysis configuration
   * @returns Promise resolving to analysis result with tags
   *
   * @throws {Error} If message cannot be retrieved
   * @throws {Error} If content extraction fails
   * @throws {Error} If provider analysis fails
   * @throws {Error} If tag application fails
   */
  async execute(
    messageId: string,
    providerSettings: IProviderSettings,
    config: AnalyzeEmailConfig = {}
  ): Promise<ITagResponse> {
    const existing = this.inFlight.get(messageId);
    if (existing) {
      this.logger.debug('[DEBUG] Joining in-flight analysis', { messageId });
      return existing;
    }

    const promise = this.executeInternal(messageId, providerSettings, config);
    this.inFlight.set(messageId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(messageId);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Performs the actual analysis workflow (guarded by {@link execute}).
   */
  private async executeInternal(
    messageId: string,
    providerSettings: IProviderSettings,
    config: AnalyzeEmailConfig
  ): Promise<ITagResponse> {
    const {
      cacheTtl = 24 * 60 * 60 * 1000, // 24 hours default
      forceReanalyze = false,
      applyTags = true,
      customTags,
      signal,
    } = config;

    const providerId = (providerSettings.provider as string) ?? 'unknown';
    this.logger.info('[INFO] Starting email analysis', {
      messageId,
      providerId,
      config: { forceReanalyze, applyTags },
    });

    const startTime = Date.now();

    try {
      // Check if email was already analyzed
      this.logger.debug('[DEBUG] Checking if email was already analyzed');
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      const wasAnalyzed = await this.analysisTracker.wasAnalyzed(messageIdNum);
      if (wasAnalyzed) {
        this.logger.info('[INFO] Skipping already-analyzed email', { messageId });
        return { tags: [], confidence: 0, reasoning: '' };
      }

      // Step 1: Retrieve email
      this.logger.debug('[DEBUG] Step 1: Retrieving email');
      const { email } = await this.retrieveEmail.execute(messageId);
      this.logger.debug('[DEBUG] Step 1 complete: Email retrieved');

      // Step 2: Extract content
      this.logger.debug('[DEBUG] Step 2: Extracting content');
      const structuredData = await this.extractContent.execute(email);
      this.logger.debug('[DEBUG] Step 2 complete', { bodyLength: structuredData.body.length });

      // Step 3: Load custom tags
      this.logger.debug('[DEBUG] Step 3: Loading custom tags');
      const tagsToUse = customTags ?? (await this.loadCustomTags());
      this.logger.debug('[DEBUG] Step 3 complete', { tagCount: tagsToUse.length });

      // Step 4: Generate cache key
      this.logger.debug('[DEBUG] Step 4: Generating cache key');
      const { cacheKey } = await this.cacheAnalysis.generateKey(email, providerSettings);
      this.logger.debug('[DEBUG] Step 4 complete', { cacheKey: cacheKey.substring(0, 16) + '...' });

      // Step 5: Check cache
      if (!forceReanalyze) {
        this.logger.debug('[DEBUG] Step 5: Checking cache');
        const cachedResult = await this.cacheAnalysis.get(cacheKey);
        if (cachedResult) {
          this.logger.info('[INFO] Cache HIT', { cacheKey });
          await this.handleCachedResult(
            messageId,
            messageIdNum,
            cachedResult,
            cacheKey,
            providerSettings,
            startTime,
            applyTags
          );
          return cachedResult;
        }
        this.logger.debug('[DEBUG] Cache MISS');
      } else {
        this.logger.debug('[DEBUG] Skipping cache (forceReanalyze)');
      }

      // Step 6: Get provider and analyze
      this.logger.debug('[DEBUG] Step 6: Getting provider');
      const provider = await this.getProvider(providerSettings);
      this.logger.debug('[DEBUG] Step 6 complete');

      this.logger.debug('[DEBUG] Step 7: Performing AI analysis');
      const analysisResult = await this.analyzeWithProvider(
        structuredData,
        providerSettings,
        tagsToUse,
        provider,
        signal
      );
      this.logger.debug('[DEBUG] Step 7 complete', {
        tagsFound: analysisResult.tags.length,
        confidence: analysisResult.confidence,
      });

      // Step 8: Cache result
      this.logger.debug('[DEBUG] Step 8: Caching result');
      await this.cacheAnalysis.set(cacheKey, analysisResult, cacheTtl);
      this.logger.debug('[DEBUG] Step 8 complete');

      // Step 9: Apply tags
      let lowConfidenceFlags: Array<{
        tagKey: string;
        confidence: number;
        threshold: number;
        thresholdType: 'custom' | 'global';
        reasoning: string;
      }> = [];

      if (applyTags) {
        this.logger.debug('[DEBUG] Step 9: Applying tags');
        const tagResult = await this.applyTagsWithConfidence.execute(
          messageId,
          analysisResult.tags,
          analysisResult.confidence,
          analysisResult.reasoning
        );
        lowConfidenceFlags = tagResult.lowConfidenceFlags;
        this.logger.debug('[DEBUG] Step 9 complete', { flags: lowConfidenceFlags.length });

        // Mark as analyzed
        await this.markAnalyzed(messageIdNum, messageId);
      } else {
        this.logger.debug('[DEBUG] Skipping tag application (applyTags=false)');
      }

      // Store low-confidence flags
      if (lowConfidenceFlags.length > 0) {
        await this.storeLowConfidenceFlags(cacheKey, lowConfidenceFlags);
      }

      this.logger.info('[INFO] Email analysis completed successfully', {
        messageId,
        tags: analysisResult.tags,
        confidence: analysisResult.confidence,
        duration: `${Date.now() - startTime}ms`,
      });

      return analysisResult;
    } catch (error) {
      // Cancellation is not a failure: preserve the AbortError so the batch
      // layer can mark the item as cancelled instead of failed/retried.
      if (isAbortError(error)) {
        this.logger.debug('[DEBUG] Email analysis cancelled', { messageId });
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      // Single error log for the whole analysis chain (#5): provider + message
      // context lives here, lower layers log pass-through details at debug.
      this.logger.error('[ERROR] Email analysis failed', {
        messageId,
        providerId,
        error: errorMessage,
      });

      throw new Error(`Failed to analyze email ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Handles a cached analysis result.
   */
  private async handleCachedResult(
    messageId: string,
    messageIdNum: number,
    cachedResult: ITagResponse,
    cacheKey: string,
    providerSettings: IProviderSettings,
    startTime: number,
    applyTags: boolean
  ): Promise<void> {
    if (applyTags) {
      this.logger.debug('[DEBUG] Applying cached tags');
      const tagResult = await this.applyTagsWithConfidence.execute(
        messageId,
        cachedResult.tags,
        cachedResult.confidence,
        cachedResult.reasoning
      );
      await this.markAnalyzed(messageIdNum, messageId);

      // Store low-confidence flags from cache result
      if (tagResult.lowConfidenceFlags.length > 0) {
        await this.storeLowConfidenceFlags(cacheKey, tagResult.lowConfidenceFlags);
      }
    }

    this.logger.info('[INFO] Analysis completed from cache', {
      duration: `${Date.now() - startTime}ms`,
      tagsFound: cachedResult.tags.length,
    });
  }

  /**
   * Marks email as analyzed, handling errors gracefully.
   */
  private async markAnalyzed(messageIdNum: number, messageId: string): Promise<void> {
    try {
      await this.analysisTracker.markAnalyzed(messageIdNum);
      this.logger.debug('[DEBUG] Email marked as analyzed', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[WARN] Failed to mark email as analyzed', {
        messageId,
        error: errorMessage,
      });
    }
  }

  /**
   * Loads custom tags from ConfigRepository.
   */
  private async loadCustomTags(): Promise<
    Array<{ key: string; name: string; description: string }>
  > {
    try {
      const customTags = await this.configRepository.getCustomTags();
      return customTags.map((tag) => ({
        key: tag.key,
        name: tag.name,
        description: tag.prompt ?? '',
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[WARN] Failed to load custom tags', { error: errorMessage });
      return [];
    }
  }

  /**
   * Gets provider instance from factory.
   */
  private async getProvider(providerSettings: IProviderSettings) {
    const providerId = providerSettings.provider as string;
    if (!providerId) {
      throw new Error('Provider ID not specified');
    }
    return this.providerFactory.getProvider(providerId);
  }

  /**
   * Performs AI analysis with provider.
   */
  private async analyzeWithProvider(
    structuredData: ReturnType<ExtractEmailContentUseCase['execute']> extends Promise<infer T>
      ? T
      : never,
    providerSettings: IProviderSettings,
    customTags: Array<{ key: string; name: string; description: string }>,
    provider: Awaited<ReturnType<typeof this.getProvider>>,
    signal?: AbortSignal
  ): Promise<ITagResponse> {
    this.logger.debug('[DEBUG] Starting provider analysis', {
      providerId: provider.providerId,
      tagCount: customTags.length,
    });

    const isValid = await provider.validateSettings(providerSettings);
    if (!isValid) {
      throw new Error(`Invalid provider settings for ${provider.providerId}`);
    }

    const analysisInput = {
      settings: providerSettings,
      data: structuredData,
      tags: customTags,
      signal,
    };

    return provider.analyze(analysisInput);
  }

  /**
   * Stores low-confidence flags for manual review and prunes entries older
   * than {@link LOW_CONFIDENCE_TTL_MS}. Growth is bounded via an index key so
   * no full `storage.local` scan is needed.
   */
  private async storeLowConfidenceFlags(
    cacheKey: string,
    flags: Array<{
      tagKey: string;
      confidence: number;
      threshold: number;
      thresholdType: 'custom' | 'global';
      reasoning: string;
    }>
  ): Promise<void> {
    try {
      if (typeof messenger === 'undefined' || !messenger.storage) {
        return;
      }

      const now = Date.now();
      const storageKey = `lowConfidence_${cacheKey}`;
      const flagData = { cacheKey, flags, timestamp: now };
      await messenger.storage.local.set({ [storageKey]: flagData });

      // Update the timestamp index, then prune expired entries.
      const indexResult = await messenger.storage.local.get(LOW_CONFIDENCE_INDEX_KEY);
      const rawIndex = indexResult[LOW_CONFIDENCE_INDEX_KEY];
      const index =
        typeof rawIndex === 'object' && rawIndex !== null
          ? (rawIndex as Record<string, number>)
          : {};

      index[cacheKey] = now;
      const cutoff = now - LOW_CONFIDENCE_TTL_MS;
      const removalKeys: string[] = [];
      for (const key of Object.keys(index)) {
        if (typeof index[key] !== 'number' || index[key] < cutoff) {
          delete index[key];
          removalKeys.push(`lowConfidence_${key}`);
        }
      }

      // Bump the index first, then delete expired entries via the storage
      // deletion API. `storage.local.remove` is the only API that removes keys;
      // `set` with null values does NOT delete on Gecko/Thunderbird.
      await messenger.storage.local.set({ [LOW_CONFIDENCE_INDEX_KEY]: index });
      if (removalKeys.length > 0) {
        await messenger.storage.local.remove(removalKeys);
      }

      this.logger.debug('[DEBUG] Low-confidence flags stored', {
        count: flags.length,
        pruned: removalKeys.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[WARN] Failed to store low-confidence flags', { error: errorMessage });
    }
  }
}
