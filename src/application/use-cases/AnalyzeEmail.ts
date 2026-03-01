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
import { EventBus } from '@/domain/events/EventBus';
import { createEmailAnalyzedEvent } from '@/domain/events/EmailAnalyzedEvent';
import { createProviderErrorEvent } from '@/domain/events/ProviderErrorEvent';
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
  // Constructor (6 dependencies, down from 10)
  // ==========================================================================

  constructor(
    @inject('ProviderFactory') private readonly providerFactory: ProviderFactory,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository,
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(EmailAnalysisTracker) private readonly analysisTracker: EmailAnalysisTracker,
    @inject('ILogger') private readonly logger: ILogger,
    // Sub-use-cases
    @inject(RetrieveEmailUseCase) private readonly retrieveEmail: RetrieveEmailUseCase,
    @inject(ExtractEmailContentUseCase) private readonly extractContent: ExtractEmailContentUseCase,
    @inject(CacheAnalysisUseCase) private readonly cacheAnalysis: CacheAnalysisUseCase,
    @inject(ApplyTagsWithConfidenceUseCase)
    private readonly applyTagsWithConfidence: ApplyTagsWithConfidenceUseCase
  ) {
    this.logger.debug('✅ AnalyzeEmail use case initialized (refactored)');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Executes email analysis for a single message.
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
    const {
      cacheTtl = 24 * 60 * 60 * 1000, // 24 hours default
      forceReanalyze = false,
      applyTags = true,
      customTags,
    } = config;

    const providerId = (providerSettings.provider as string) ?? 'unknown';
    this.logger.info('🚀 Starting email analysis', {
      messageId,
      providerId,
      config: { forceReanalyze, applyTags },
    });

    const startTime = Date.now();

    try {
      // Check if email was already analyzed
      this.logger.debug('🔍 Checking if email was already analyzed');
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      const wasAnalyzed = await this.analysisTracker.wasAnalyzed(messageIdNum);
      if (wasAnalyzed) {
        this.logger.info('⏭️ Skipping already-analyzed email', { messageId });
        return { tags: [], confidence: 0, reasoning: '' };
      }

      // Step 1: Retrieve email
      this.logger.debug('➡️  Step 1: Retrieving email');
      const { email } = await this.retrieveEmail.execute(messageId);
      this.logger.debug('✅ Step 1 complete: Email retrieved');

      // Step 2: Extract content
      this.logger.debug('➡️  Step 2: Extracting content');
      const structuredData = await this.extractContent.execute(email);
      this.logger.debug('✅ Step 2 complete', { bodyLength: structuredData.body.length });

      // Step 3: Load custom tags
      this.logger.debug('➡️  Step 3: Loading custom tags');
      const tagsToUse = customTags ?? (await this.loadCustomTags());
      this.logger.debug('✅ Step 3 complete', { tagCount: tagsToUse.length });

      // Step 4: Generate cache key
      this.logger.debug('➡️  Step 4: Generating cache key');
      const { cacheKey } = await this.cacheAnalysis.generateKey(email, providerSettings);
      this.logger.debug('✅ Step 4 complete', { cacheKey: cacheKey.substring(0, 16) + '...' });

      // Step 5: Check cache
      if (!forceReanalyze) {
        this.logger.debug('➡️  Step 5: Checking cache');
        const cachedResult = await this.cacheAnalysis.get(cacheKey);
        if (cachedResult) {
          this.logger.info('✅ Cache HIT', { cacheKey });
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
        this.logger.debug('⚠️  Cache MISS');
      } else {
        this.logger.debug('⏭️  Skipping cache (forceReanalyze)');
      }

      // Step 6: Get provider and analyze
      this.logger.debug('➡️  Step 6: Getting provider');
      const provider = await this.getProvider(providerSettings);
      this.logger.debug('✅ Step 6 complete');

      this.logger.debug('➡️  Step 7: Performing AI analysis');
      const analysisResult = await this.analyzeWithProvider(
        structuredData,
        providerSettings,
        tagsToUse,
        provider
      );
      this.logger.debug('✅ Step 7 complete', {
        tagsFound: analysisResult.tags.length,
        confidence: analysisResult.confidence,
      });

      // Step 8: Cache result
      this.logger.debug('➡️  Step 8: Caching result');
      await this.cacheAnalysis.set(cacheKey, analysisResult, cacheTtl);
      this.logger.debug('✅ Step 8 complete');

      // Step 9: Apply tags
      let lowConfidenceFlags: Array<{
        tagKey: string;
        confidence: number;
        threshold: number;
        thresholdType: 'custom' | 'global';
        reasoning: string;
      }> = [];

      if (applyTags) {
        this.logger.debug('➡️  Step 9: Applying tags');
        const tagResult = await this.applyTagsWithConfidence.execute(
          messageId,
          analysisResult.tags,
          analysisResult.confidence,
          analysisResult.reasoning
        );
        lowConfidenceFlags = tagResult.lowConfidenceFlags;
        this.logger.debug('✅ Step 9 complete', { flags: lowConfidenceFlags.length });

        // Mark as analyzed
        await this.markAnalyzed(messageIdNum, messageId);
      } else {
        this.logger.debug('⏭️  Skipping tag application (applyTags=false)');
      }

      // Store low-confidence flags
      if (lowConfidenceFlags.length > 0) {
        await this.storeLowConfidenceFlags(cacheKey, lowConfidenceFlags);
      }

      // Publish event
      await this.eventBus.publish(
        createEmailAnalyzedEvent(
          messageId,
          providerSettings.provider as string,
          providerSettings.model as string,
          analysisResult,
          { fromCache: false, cacheKey, duration: Date.now() - startTime }
        )
      );

      this.logger.info('✅ Email analysis completed successfully', {
        messageId,
        tags: analysisResult.tags,
        confidence: analysisResult.confidence,
        duration: `${Date.now() - startTime}ms`,
      });

      return analysisResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Email analysis failed', { messageId, error: errorMessage });

      await this.eventBus.publish(
        createProviderErrorEvent(
          providerSettings.provider as string,
          providerSettings.model as string,
          errorMessage,
          { messageId, error: error instanceof Error ? error : undefined, errorType: 'api_error' }
        )
      );

      throw new Error(`Failed to analyze email ${messageId}: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

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
      this.logger.debug('➡️  Applying cached tags');
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

    await this.eventBus.publish(
      createEmailAnalyzedEvent(
        messageId,
        providerSettings.provider as string,
        providerSettings.model as string,
        cachedResult,
        { fromCache: true, cacheKey, duration: Date.now() - startTime }
      )
    );

    this.logger.info('✅ Analysis completed from cache', {
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
      this.logger.debug('✅ Email marked as analyzed', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to mark email as analyzed', {
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
      this.logger.warn('⚠️  Failed to load custom tags', { error: errorMessage });
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
    provider: Awaited<ReturnType<typeof this.getProvider>>
  ): Promise<ITagResponse> {
    this.logger.debug('🤖 Starting provider analysis', {
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
    };

    return provider.analyze(analysisInput);
  }

  /**
   * Stores low-confidence flags for manual review.
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
      const storageKey = `lowConfidence_${cacheKey}`;
      const flagData = { cacheKey, flags, timestamp: Date.now() };

      if (typeof messenger !== 'undefined' && messenger.storage) {
        await messenger.storage.local.set({ [storageKey]: flagData });
        this.logger.debug('✅ Low-confidence flags stored', { count: flags.length });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to store low-confidence flags', { error: errorMessage });
    }
  }
}

// TypeScript declare for Thunderbird messenger API
declare const messenger: {
  storage: {
    local: {
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
};
