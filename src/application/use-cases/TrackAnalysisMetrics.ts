// ============================================================================
// TrackAnalysisMetrics Use Case
// ============================================================================
// Use case for tracking analysis performance metrics.

import { injectable, inject } from 'tsyringe';

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IClock } from '@/domain/interfaces/IClock';
import type { AggregatedMetrics } from '@/shared/types/Metrics';
import { MetricsRepository } from '@/infrastructure/storage/MetricsRepository';

/**
 * Use case for tracking and retrieving analysis performance metrics.
 *
 * Provides a fluent API for tracking analysis operations with automatic
 * timing and cost calculation. Use `startTracking()` to begin tracking
 * an analysis, and call the returned function when complete.
 *
 * @example
 * ```typescript
 * const tracker = container.resolve(TrackAnalysisMetrics);
 *
 * // Start tracking
 * const complete = tracker.startTracking('msg-123', 'openai', 'gpt-4');
 *
 * // ... perform analysis ...
 *
 * // Complete tracking with results
 * await complete(true, { input: 100, output: 50 });
 *
 * // Get aggregated metrics
 * const metrics = await tracker.getMetrics('day');
 * console.log(`Total cost: $${metrics.totalEstimatedCost.toFixed(4)}`);
 * ```
 */
@injectable()
export class TrackAnalysisMetrics {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IClock') private readonly clock: IClock,
    private readonly metricsRepository: MetricsRepository
  ) {}

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Starts tracking an analysis operation.
   *
   * Returns a completion function that should be called when the analysis
   * is complete. The completion function automatically calculates duration
   * and estimated cost.
   *
   * @param messageId - The email message ID being analyzed
   * @param provider - The AI provider being used
   * @param model - The model being used
   * @returns Completion function to call when analysis is done
   *
   * @example
   * ```typescript
   * const complete = tracker.startTracking('msg-123', 'openai', 'gpt-4');
   *
   * try {
   *   const result = await analyzeEmail();
   *   await complete(true, { input: result.usage.input, output: result.usage.output });
   * } catch (error) {
   *   await complete(false, undefined, error.message);
   * }
   * ```
   */
  startTracking(
    messageId: string,
    provider: string,
    model: string
  ): (
    success: boolean,
    tokens?: { input: number; output: number },
    error?: string
  ) => Promise<void> {
    const startTime = this.clock.now();

    this.logger.debug('Started tracking analysis', { messageId, provider, model });

    return async (
      success: boolean,
      tokens?: { input: number; output: number },
      error?: string
    ): Promise<void> => {
      const endTime = this.clock.now();
      const duration = endTime - startTime;

      let estimatedCost: number | undefined;
      if (tokens) {
        estimatedCost = this.metricsRepository.calculateCost(
          provider,
          model,
          tokens.input,
          tokens.output
        );
      }

      try {
        await this.metricsRepository.recordMetric({
          messageId,
          provider,
          model,
          startTime,
          endTime,
          duration,
          success,
          errorMessage: error,
          inputTokens: tokens?.input,
          outputTokens: tokens?.output,
          estimatedCost,
        });

        this.logger.debug('Analysis metric recorded', {
          messageId,
          provider,
          duration,
          success,
          estimatedCost,
        });
      } catch (recordError) {
        // Don't let metric recording failures affect the main flow
        const errorMessage =
          recordError instanceof Error ? recordError.message : String(recordError);
        this.logger.warn('Failed to record analysis metric', {
          messageId,
          error: errorMessage,
        });
      }
    };
  }

  /**
   * Gets aggregated metrics for a time period.
   *
   * @param period - The time period to aggregate (default: 'day')
   * @returns Aggregated metrics for the period
   *
   * @example
   * ```typescript
   * const metrics = await tracker.getMetrics('week');
   * console.log(`Analyses: ${metrics.totalAnalyses}`);
   * console.log(`Success rate: ${metrics.successfulAnalyses / metrics.totalAnalyses}`);
   * console.log(`Avg duration: ${metrics.averageDuration}ms`);
   * ```
   */
  async getMetrics(period: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<AggregatedMetrics> {
    return this.metricsRepository.getAggregatedMetrics(period);
  }

  /**
   * Clears all stored metrics.
   *
   * @example
   * ```typescript
   * await tracker.clearMetrics();
   * ```
   */
  async clearMetrics(): Promise<void> {
    await this.metricsRepository.clearMetrics();
  }
}
