/**
 * ApplyTagsWithConfidenceUseCase
 *
 * Applies tags to email messages with confidence threshold filtering.
 * Tags are only applied if their confidence meets the configured threshold.
 *
 * @module application/use-cases/ApplyTagsWithConfidenceUseCase
 */

import { injectable, inject } from 'tsyringe';
import type { ITagManager, ILogger } from '@/domain/interfaces';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { meetsTagThreshold, getEffectiveThreshold } from '@/shared/utils/confidenceUtils';
import type { Tag } from '@/shared/types/ProviderTypes';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for tag application with confidence filtering.
 */
export interface ApplyTagsWithConfidenceConfig {
  /** Whether to apply tags (default: true) */
  applyTags?: boolean;
}

/**
 * Low-confidence flag for tags that didn't meet threshold.
 */
export interface LowConfidenceFlag {
  /** Tag key */
  tagKey: string;
  /** Actual confidence score (0-1) */
  confidence: number;
  /** Threshold that was not met */
  threshold: number;
  /** Whether threshold was custom or global */
  thresholdType: 'custom' | 'global';
  /** Explanation for the flag */
  reasoning: string;
}

/**
 * Result of tag application with confidence filtering.
 */
export interface ApplyTagsWithConfidenceResult {
  /** Tags that were successfully applied */
  appliedTags: string[];
  /** Low-confidence flags for skipped tags */
  lowConfidenceFlags: LowConfidenceFlag[];
}

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * ApplyTagsWithConfidenceUseCase
 *
 * Applies tags to email messages with confidence threshold filtering.
 * Uses per-tag threshold overrides when available, falling back to global threshold.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<ApplyTagsWithConfidenceUseCase>(ApplyTagsWithConfidenceUseCase);
 * const result = await useCase.execute('12345', ['is_business'], 0.85, 'Business email');
 * console.log(`Applied: ${result.appliedTags.length}, Flags: ${result.lowConfidenceFlags.length}`);
 * ```
 */
@injectable()
export class ApplyTagsWithConfidenceUseCase {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ITagManager') private readonly tagManager: ITagManager,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository,
    @inject('ILogger') private readonly logger: ILogger
  ) {
    this.logger.debug('✅ ApplyTagsWithConfidenceUseCase initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Applies tags to an email message with confidence threshold filtering.
   *
   * Tags are only applied if their confidence meets the configured threshold.
   * Per-tag threshold overrides take precedence over the global threshold.
   *
   * @param messageId - Message ID (as string)
   * @param tagKeys - Tag keys to potentially apply
   * @param confidence - Overall confidence score (0-1 range)
   * @param reasoning - AI reasoning for the classification (optional)
   * @param config - Optional configuration
   * @returns Promise resolving to applied tags and low-confidence flags
   *
   * @throws {Error} If message ID is invalid
   * @throws {Error} If tag application fails
   *
   * @example
   * ```typescript
   * const result = await useCase.execute('12345', ['is_business'], 0.85);
   * console.log(`Applied ${result.appliedTags.length} tags`);
   * ```
   */
  async execute(
    messageId: string,
    tagKeys: string[],
    confidence: number,
    reasoning?: string,
    config: ApplyTagsWithConfidenceConfig = {}
  ): Promise<ApplyTagsWithConfidenceResult> {
    const { applyTags = true } = config;

    this.logger.debug('🏷️  Applying tags to email with confidence filtering', {
      messageId,
      tagKeys,
      confidence,
      applyTags,
    });

    if (!applyTags) {
      this.logger.debug('⏭️  Skipping tag application (applyTags=false)');
      return { appliedTags: [], lowConfidenceFlags: [] };
    }

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
      const lowConfidenceFlags: LowConfidenceFlag[] = [];

      for (const tagKey of tagKeys) {
        const tag = tagMap.get(tagKey);
        const effectiveThreshold = getEffectiveThreshold(tag ?? {}, globalThreshold);
        const thresholdType = tag?.minConfidenceThreshold !== undefined ? 'custom' : 'global';

        if (meetsTagThreshold(confidence, tag ?? {}, globalThreshold)) {
          tagsToApply.push(tagKey);
          this.logger.debug('✅ Tag meets threshold', {
            tag: tagKey,
            confidence: `${(confidence * 100).toFixed(1)}%`,
            threshold: effectiveThreshold,
            thresholdType,
          });
        } else {
          // Create low-confidence flag with reasoning
          const confidencePercent = Math.round(confidence * 100);
          const thresholdInfo = `Confidence ${confidencePercent}% below threshold ${effectiveThreshold}% (${thresholdType} threshold)`;
          lowConfidenceFlags.push({
            tagKey,
            confidence,
            threshold: effectiveThreshold,
            thresholdType,
            reasoning: reasoning ? `${reasoning} - ${thresholdInfo}` : thresholdInfo,
          });
          this.logger.debug('⏭️  Tag below threshold, skipping', {
            tag: tagKey,
            confidence: `${(confidence * 100).toFixed(1)}%`,
            threshold: effectiveThreshold,
            thresholdType,
          });
        }
      }

      // Apply tags (even if empty array - to clear any existing tags and for consistency)
      await this.tagManager.setTagsOnMessage(messageIdNum, tagsToApply);

      if (tagsToApply.length > 0) {
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

      // Log low-confidence flags
      if (lowConfidenceFlags.length > 0) {
        this.logger.info('📋 Low-confidence flags created', {
          messageId,
          flagCount: lowConfidenceFlags.length,
          flags: lowConfidenceFlags.map(
            (f) => `${f.tagKey}: ${f.confidence * 100}% < ${f.threshold}%`
          ),
        });
      }

      return { appliedTags: tagsToApply, lowConfidenceFlags };
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
