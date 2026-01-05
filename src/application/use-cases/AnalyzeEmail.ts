/**
 * AnalyzeEmail Use Case
 *
 * Orchestrates email analysis by coordinating email retrieval, content extraction,
 * AI provider analysis, caching, and tag application.
 *
 * This use case implements the complete email analysis workflow:
 * 1. Retrieves email from Thunderbird via IMailReader
 * 2. Extracts structured content via EmailContentExtractor
 * 3. Checks cache for cached analysis results
 * 4. Performs AI analysis via Provider (if cache miss)
 * 5. Caches the analysis result
 * 6. Applies tags to the message via ITagManager
 *
 * @module application/use-cases/AnalyzeEmail
 */

import { injectable, inject } from 'tsyringe';
import type { IMailReader } from '@/infrastructure/interfaces/IMailReader';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { IProvider } from '@/infrastructure/interfaces/IProvider';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type {
  ITagResponse,
  IProviderSettings,
  IStructuredEmailData,
} from '@/infrastructure/interfaces/IProvider';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EventBus } from '@/domain/events/EventBus';
import { createEmailAnalyzedEvent } from '@/domain/events/EmailAnalyzedEvent';
import { createProviderErrorEvent } from '@/domain/events/ProviderErrorEvent';
import { meetsTagThreshold, getEffectiveThreshold } from '@/shared/utils/confidenceUtils';
import type { Tag } from '@/shared/types/ProviderTypes';

// ============================================================================
// Browser-compatible Crypto Utilities
// ============================================================================

/**
 * SHA-256 hash function using Web Crypto API (browser-compatible).
 *
 * @param message - String to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 * @throws {Error} If Web Crypto API is not available
 */
async function sha256(message: string): Promise<string> {
  // Get crypto.subtle from global window or self (for Web Workers)
  const subtleCrypto =
    (typeof window !== 'undefined' && window.crypto?.subtle) ||
    (typeof self !== 'undefined' && self.crypto?.subtle);

  if (!subtleCrypto) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this environment');
  }

  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await subtleCrypto.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
 * Orchestrates the complete email analysis workflow.
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
  // Constructor
  // ==========================================================================

  constructor(
    @inject('IMailReader') private readonly mailReader: IMailReader,
    @inject('ITagManager') private readonly tagManager: ITagManager,
    @inject('ProviderFactory') private readonly providerFactory: ProviderFactory,
    @inject('ICache') private readonly cache: ICache,
    @inject('ILogger') private readonly logger: ILogger,
    @inject(EmailContentExtractor) private readonly contentExtractor: EmailContentExtractor,
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository,
    @inject('IQueue') private readonly queue: IQueue
  ) {
    this.logger.debug('✅ AnalyzeEmail use case initialized');
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
   *
   * @example
   * ```typescript
   * const result = await analyzeEmail.execute('12345', {
   *   provider: 'openai',
   *   apiKey: 'sk-...',
   *   model: 'gpt-4'
   * }, { applyTags: true });
   * ```
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

    this.logger.debug('📋 Analysis configuration', {
      cacheTtl: `${cacheTtl / 1000 / 60 / 60}h`,
      forceReanalyze,
      applyTags,
      hasCustomTags: customTags !== undefined,
      customTagsCount: customTags?.length ?? 0,
    });

    try {
      // Step 1: Retrieve email from Thunderbird
      this.logger.debug('➡️  Step 1: Retrieving email from Thunderbird');
      const email = await this.retrieveEmail(messageId);
      this.logger.debug('✅ Step 1 complete: Email retrieved');

      // Step 2: Extract structured content
      this.logger.debug('➡️  Step 2: Extracting structured content');
      const structuredData = this.extractEmailContent(email);
      this.logger.debug('✅ Step 2 complete: Content extracted', {
        bodyLength: structuredData.body.length,
        attachmentCount: structuredData.attachments.length,
      });

      // Step 3: Load custom tags from ConfigRepository if not provided
      this.logger.debug('➡️  Step 3: Loading custom tags', {
        hasCustomTags: customTags !== undefined,
      });
      const tagsToUse = customTags ?? (await this.loadCustomTags());
      this.logger.debug('✅ Step 3 complete: Tags loaded', { tagCount: tagsToUse.length });

      // Step 4: Generate cache key
      this.logger.debug('➡️  Step 4: Generating cache key');
      const cacheKey = await this.generateCacheKey(email, providerSettings);
      this.logger.debug('✅ Step 4 complete: Cache key generated', {
        cacheKey: cacheKey.substring(0, 16) + '...',
      });

      // Step 5: Check cache (unless force re-analysis)
      if (!forceReanalyze) {
        this.logger.debug('➡️  Step 5: Checking cache');
        const cachedResult = await this.checkCache(cacheKey);
        if (cachedResult) {
          this.logger.info('✅ Cache HIT - Retrieved analysis from cache', { cacheKey });

          if (applyTags) {
            this.logger.debug('➡️  Applying cached tags to email');
            await this.applyTagsToEmail(messageId, cachedResult.tags, cachedResult.confidence);
            this.logger.debug('✅ Cached tags applied');
          }

          // Publish EmailAnalyzedEvent (from cache)
          this.logger.debug('➡️  Publishing EmailAnalyzedEvent (from cache)');
          await this.eventBus.publish(
            createEmailAnalyzedEvent(
              messageId,
              providerSettings.provider as string,
              providerSettings.model as string,
              cachedResult,
              {
                fromCache: true,
                cacheKey,
                duration: Date.now() - startTime,
              }
            )
          );

          this.logger.info('✅ Analysis completed from cache', {
            duration: `${Date.now() - startTime}ms`,
            tagsFound: cachedResult.tags.length,
          });
          return cachedResult;
        }
        this.logger.debug('⚠️  Cache MISS - No cached result found');
      } else {
        this.logger.debug('⏭️  Skipping cache check (forceReanalyze=true)');
      }

      // Step 6: Get provider from factory (if providerId is specified)
      this.logger.debug('➡️  Step 6: Getting provider from factory');
      const provider = this.getProvider(providerSettings);
      this.logger.debug('✅ Step 6 complete: Provider retrieved');

      // Step 7: Perform AI analysis
      this.logger.debug('➡️  Step 7: Performing AI analysis');
      const analysisResult = await this.analyzeWithProvider(
        structuredData,
        providerSettings,
        tagsToUse,
        provider
      );
      this.logger.debug('✅ Step 7 complete: AI analysis finished', {
        tagsFound: analysisResult.tags.length,
        confidence: analysisResult.confidence,
      });

      // Step 8: Cache the result
      this.logger.debug('➡️  Step 8: Caching result');
      await this.cacheResult(cacheKey, analysisResult, cacheTtl);
      this.logger.debug('✅ Step 8 complete: Result cached');

      // Step 9: Apply tags to the message
      if (applyTags) {
        this.logger.debug('➡️  Step 9: Applying tags to message');
        await this.applyTagsToEmail(messageId, analysisResult.tags, analysisResult.confidence);
        this.logger.debug('✅ Step 9 complete: Tags applied');
      } else {
        this.logger.debug('⏭️  Skipping tag application (applyTags=false)');
      }

      // Publish EmailAnalyzedEvent
      this.logger.debug('➡️  Publishing EmailAnalyzedEvent (new analysis)');
      await this.eventBus.publish(
        createEmailAnalyzedEvent(
          messageId,
          providerSettings.provider as string,
          providerSettings.model as string,
          analysisResult,
          {
            fromCache: false,
            cacheKey,
            duration: Date.now() - startTime,
          }
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

      // Publish ProviderErrorEvent
      await this.eventBus.publish(
        createProviderErrorEvent(
          providerSettings.provider as string,
          providerSettings.model as string,
          errorMessage,
          {
            messageId,
            error: error instanceof Error ? error : undefined,
            errorType: 'api_error',
          }
        )
      );

      throw new Error(`Failed to analyze email ${messageId}: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Loads custom tags from ConfigRepository.
   *
   * @returns Array of custom tags for analysis
   */
  private async loadCustomTags(): Promise<
    Array<{ key: string; name: string; description: string }>
  > {
    this.logger.debug('🔍 Loading custom tags from ConfigRepository');
    try {
      const customTags = await this.configRepository.getCustomTags();
      const mappedTags = customTags.map((tag) => ({
        key: tag.key,
        name: tag.name,
        description: tag.prompt ?? '',
      }));
      this.logger.debug('✅ Custom tags loaded from ConfigRepository', {
        count: mappedTags.length,
      });
      return mappedTags;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to load custom tags from ConfigRepository, using empty array', {
        error: errorMessage,
      });
      return [];
    }
  }

  /**
   * Retrieves email from Thunderbird.
   *
   * @param messageId - Message ID to retrieve
   * @returns Complete email message
   * @throws {Error} If message cannot be retrieved
   */
  private async retrieveEmail(messageId: string): Promise<IEmailMessage> {
    this.logger.debug('📬 Retrieving email from Thunderbird', { messageId });

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      const email = await this.mailReader.getFullMessage(messageIdNum);

      if (!email) {
        throw new Error(`Email not found: ${messageId}`);
      }

      this.logger.debug('✅ Email retrieved successfully', {
        messageId,
        subject: email.subject,
        from: email.from,
      });

      return email;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to retrieve email', { messageId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Extracts structured content from email.
   *
   * @param email - Email message to extract from
   * @returns Structured email data for AI analysis
   * @throws {Error} If content extraction fails
   */
  private extractEmailContent(email: IEmailMessage): IStructuredEmailData {
    this.logger.debug('📄 Extracting email content', { messageId: email.id });

    try {
      // Parse email parts if available
      let body = email.body || '';
      const attachments: IAttachment[] = [];

      if (email.parts && email.parts.length > 0) {
        this.logger.debug('📎 Processing email parts', { partCount: email.parts.length });
        const parsed = this.contentExtractor.findEmailParts(email.parts);
        body = parsed.body;
        parsed.attachments.forEach((att) => {
          attachments.push({
            name: att.name,
            mimeType: att.mimeType,
            size: att.size,
          });
        });
        this.logger.debug('✅ Email parts processed', {
          bodyLength: body.length,
          attachmentCount: attachments.length,
        });
      }

      // Also check direct attachments
      if (email.attachments && email.attachments.length > 0) {
        this.logger.debug('📎 Processing direct attachments', {
          attachmentCount: email.attachments.length,
        });
        email.attachments.forEach((att) => {
          if (!attachments.some((a) => a.name === att.name)) {
            attachments.push({
              name: att.name,
              mimeType: att.mimeType,
              size: att.size,
            });
          }
        });
      }

      const structuredData: IStructuredEmailData = {
        headers: email.headers || {},
        body,
        attachments,
      };

      this.logger.debug('✅ Email content extracted', {
        bodyLength: body.length,
        attachmentsCount: attachments.length,
      });

      return structuredData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to extract email content', {
        messageId: email.id,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Generates cache key from email content and provider settings.
   *
   * Uses SHA-256 hash of email headers + body + provider ID + model.
   *
   * @param email - Email message
   * @param providerSettings - Provider settings
   * @returns Promise resolving to SHA-256 hash as cache key
   */
  private async generateCacheKey(
    email: IEmailMessage,
    providerSettings: IProviderSettings
  ): Promise<string> {
    const keyData = JSON.stringify({
      subject: email.subject,
      from: email.from,
      to: email.to,
      body: email.body,
      providerId: providerSettings.provider,
      model: providerSettings.model,
    });

    const hash = await sha256(keyData);
    this.logger.debug('🔐 Generated cache key', { hash: hash.substring(0, 16) + '...' });

    return hash;
  }

  /**
   * Checks cache for existing analysis result.
   *
   * @param cacheKey - Cache key to check
   * @returns Cached result or null if not found
   */
  private async checkCache(cacheKey: string): Promise<ITagResponse | null> {
    this.logger.debug('💾 Checking cache', { cacheKey: cacheKey.substring(0, 16) + '...' });

    try {
      const cached = await this.cache.get<ITagResponse>(cacheKey);
      if (cached) {
        this.logger.debug('✅ Cache HIT', { cacheKey: cacheKey.substring(0, 16) + '...' });
        return cached;
      }

      this.logger.debug('⚠️  Cache MISS', { cacheKey: cacheKey.substring(0, 16) + '...' });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to check cache', {
        cacheKey: cacheKey.substring(0, 16) + '...',
        error: errorMessage,
      });
      return null;
    }
  }

  /**
   * Gets provider instance from factory.
   *
   * @param providerSettings - Provider settings with providerId
   * @returns Provider instance
   * @throws {Error} If provider cannot be resolved
   */
  private getProvider(providerSettings: IProviderSettings): IProvider {
    const providerId = providerSettings.provider as string;
    if (!providerId) {
      throw new Error('Provider ID not specified in provider settings');
    }

    this.logger.debug('🏭 Getting provider from factory', { providerId });

    try {
      return this.providerFactory.getProvider(providerId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get provider', { providerId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Performs AI analysis with provider.
   *
   * @param structuredData - Structured email data
   * @param providerSettings - Provider settings
   * @param customTags - Custom tag definitions
   * @param provider - Provider instance
   * @returns Analysis result with tags
   * @throws {Error} If analysis fails
   */
  private async analyzeWithProvider(
    structuredData: IStructuredEmailData,
    providerSettings: IProviderSettings,
    customTags: Array<{ key: string; name: string; description: string }>,
    provider: IProvider
  ): Promise<ITagResponse> {
    this.logger.debug('🤖 Starting provider analysis', {
      providerId: provider.providerId,
      tagCount: customTags.length,
    });

    try {
      // Validate provider settings
      const isValid = await provider.validateSettings(providerSettings);
      if (!isValid) {
        throw new Error(`Invalid provider settings for ${provider.providerId}`);
      }
      this.logger.debug('✅ Provider settings validated');

      // Build analysis input
      const analysisInput = {
        settings: providerSettings,
        data: structuredData,
        tags: customTags.map((tag) => ({
          key: tag.key,
          name: tag.name,
          description: tag.description,
        })),
      };

      this.logger.debug('➡️  Calling provider.analyze() with input', {
        bodyLength: structuredData.body.length,
        tags: customTags.map((t) => t.key),
      });

      // Perform analysis
      const result = await provider.analyze(analysisInput);

      this.logger.debug('✅ Provider analysis completed', {
        providerId: provider.providerId,
        tags: result.tags,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Provider analysis failed', {
        providerId: provider.providerId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Caches analysis result.
   *
   * @param cacheKey - Cache key
   * @param result - Analysis result to cache
   * @param ttl - Time-to-live in milliseconds
   */
  private async cacheResult(cacheKey: string, result: ITagResponse, ttl: number): Promise<void> {
    this.logger.debug('💾 Caching analysis result', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      ttl: `${ttl / 1000 / 60}min`,
    });

    try {
      await this.cache.set(cacheKey, result, ttl);
      this.logger.debug('✅ Analysis result cached', {
        cacheKey: cacheKey.substring(0, 16) + '...',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to cache result', {
        cacheKey: cacheKey.substring(0, 16) + '...',
        error: errorMessage,
      });
      // Non-fatal error, continue execution
    }
  }

  /**
   * Applies tags to email message, filtering by confidence thresholds.
   *
   * Tags are only applied if their confidence meets the configured threshold.
   * Per-tag threshold overrides take precedence over the global threshold.
   *
   * @param messageId - Message ID to apply tags to
   * @param tagKeys - Tag keys to apply
   * @param confidence - Overall confidence score (0-1 range)
   * @throws {Error} If tag application fails
   */
  private async applyTagsToEmail(
    messageId: string,
    tagKeys: string[],
    confidence: number
  ): Promise<void> {
    this.logger.debug('🏷️  Applying tags to email with confidence filtering', {
      messageId,
      tagKeys,
      confidence,
    });

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      // Load app config to get global confidence threshold
      this.logger.debug('➡️  Loading app config for confidence threshold');
      const appConfig = await this.configRepository.getAppConfig();
      const globalThreshold = appConfig.minConfidenceThreshold ?? 70;
      this.logger.debug('✅ Global threshold loaded', { globalThreshold });

      // Load custom tags to get per-tag threshold overrides
      this.logger.debug('➡️  Loading custom tags for threshold overrides');
      const customTags = await this.configRepository.getCustomTags();
      this.logger.debug('✅ Custom tags loaded', { count: customTags.length });

      // Build tag lookup map for threshold overrides
      const tagMap = new Map<string, Tag>();
      customTags.forEach((tag) => tagMap.set(tag.key, tag));

      // Filter tags based on confidence thresholds
      const tagsToApply: string[] = [];
      const skippedTags: Array<{ tag: string; threshold: number; reason: string }> = [];

      for (const tagKey of tagKeys) {
        const tag = tagMap.get(tagKey);
        const effectiveThreshold = getEffectiveThreshold(tag ?? {}, globalThreshold);

        if (meetsTagThreshold(confidence, tag ?? {}, globalThreshold)) {
          tagsToApply.push(tagKey);
          this.logger.debug('✅ Tag meets threshold', {
            tag: tagKey,
            confidence: `${(confidence * 100).toFixed(1)}%`,
            threshold: effectiveThreshold,
            thresholdType: tag?.minConfidenceThreshold !== undefined ? 'custom' : 'global',
          });
        } else {
          skippedTags.push({
            tag: tagKey,
            threshold: effectiveThreshold,
            reason: `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${effectiveThreshold}%`,
          });
          this.logger.debug('⏭️  Tag below threshold, skipping', {
            tag: tagKey,
            confidence: `${(confidence * 100).toFixed(1)}%`,
            threshold: effectiveThreshold,
            thresholdType: tag?.minConfidenceThreshold !== undefined ? 'custom' : 'global',
          });
        }
      }

      // Apply only tags that meet thresholds
      if (tagsToApply.length > 0) {
        await this.tagManager.setTagsOnMessage(messageIdNum, tagsToApply);
        this.logger.info('✅ Tags applied successfully', {
          messageId,
          applied: tagsToApply.length,
          total: tagKeys.length,
        });
      } else {
        this.logger.warn('⚠️  No tags met confidence threshold', {
          messageId,
          total: tagKeys.length,
          confidence: `${(confidence * 100).toFixed(1)}%`,
          globalThreshold,
        });
      }

      // Log skipped tags for debugging
      if (skippedTags.length > 0) {
        this.logger.info('📋 Tags skipped due to low confidence', {
          messageId,
          skippedCount: skippedTags.length,
          skipped: skippedTags.map((s) => `${s.tag} (${s.reason})`),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to apply tags', {
        messageId,
        tagKeys,
        confidence,
        error: errorMessage,
      });
      throw error;
    }
  }
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Attachment interface for AI analysis.
 */
interface IAttachment {
  name: string;
  mimeType: string;
  size: number;
}
