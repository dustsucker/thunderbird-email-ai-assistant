// ============================================================================
// MetricsRepository
// ============================================================================
// Repository for storing and retrieving analysis metrics using messenger.storage.local.

import { injectable, inject } from 'tsyringe';

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IClock } from '@/domain/interfaces/IClock';
import type { IRandom } from '@/domain/interfaces/IRandom';
import type { AnalysisMetrics, AggregatedMetrics } from '@/shared/types/Metrics';
import {
  METRICS_STORAGE_KEY,
  MAX_METRICS_ITEMS,
  PROVIDER_COST_RATES,
} from '@/shared/types/Metrics';

/**
 * Repository for storing and retrieving analysis performance metrics.
 *
 * Uses messenger.storage.local for persistent storage with automatic
 * trimming of old entries to stay within MAX_METRICS_ITEMS limit.
 *
 * @example
 * const repo = container.resolve(MetricsRepository);
 * await repo.recordMetric({
 *   messageId: 'msg-123',
 *   provider: 'openai',
 *   model: 'gpt-4',
 *   startTime: Date.now() - 1000,
 *   endTime: Date.now(),
 *   duration: 1000,
 *   success: true,
 * });
 */
@injectable()
export class MetricsRepository {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IClock') private readonly clock: IClock,
    @inject('IRandom') private readonly random: IRandom
  ) {}

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Records a new analysis metric.
   *
   * Generates a unique ID for the metric and stores it at the beginning
   * of the metrics array. Automatically trims old entries if the limit
   * is exceeded.
   *
   * @param metric - The metric data (without id)
   * @returns The complete metric with generated id
   */
  async recordMetric(metric: Omit<AnalysisMetrics, 'id'>): Promise<AnalysisMetrics> {
    const fullMetric: AnalysisMetrics = {
      ...metric,
      id: this.random.uuid(),
    };

    const metrics = await this.getMetrics();
    metrics.unshift(fullMetric);

    // Trim old entries to stay within limit
    if (metrics.length > MAX_METRICS_ITEMS) {
      metrics.length = MAX_METRICS_ITEMS;
    }

    await this.saveMetrics(metrics);
    this.logger.debug('Metric recorded', { metricId: fullMetric.id });
    return fullMetric;
  }

  /**
   * Gets all stored metrics.
   *
   * @returns Array of all metrics, most recent first
   */
  async getMetrics(): Promise<AnalysisMetrics[]> {
    const result = await messenger.storage.local.get(METRICS_STORAGE_KEY);
    const metrics = result[METRICS_STORAGE_KEY];
    return Array.isArray(metrics) ? (metrics as AnalysisMetrics[]) : [];
  }

  /**
   * Gets metrics for a specific time range.
   *
   * @param startTime - Start of the time range (ms since epoch)
   * @param endTime - End of the time range (ms since epoch)
   * @returns Metrics within the specified time range
   */
  async getMetricsInRange(startTime: number, endTime: number): Promise<AnalysisMetrics[]> {
    const metrics = await this.getMetrics();
    return metrics.filter((m) => m.startTime >= startTime && m.startTime <= endTime);
  }

  /**
   * Aggregates metrics for a time period.
   *
   * Calculates totals, averages, and per-provider statistics for
   * the specified time period.
   *
   * @param period - The time period to aggregate
   * @returns Aggregated metrics for the period
   */
  async getAggregatedMetrics(
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<AggregatedMetrics> {
    const now = this.clock.now();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[period];
    const metrics = await this.getMetricsInRange(startTime, now);

    return this.aggregateMetrics(metrics, period, startTime, now);
  }

  /**
   * Calculates estimated cost for token usage.
   *
   * Uses the PROVIDER_COST_RATES to determine cost based on
   * provider, model, and token counts.
   *
   * @param provider - The AI provider
   * @param model - The model used
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @returns Estimated cost in USD
   */
  calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const providerRates = PROVIDER_COST_RATES[provider];
    if (!providerRates) return 0;

    // Find matching model (partial match for flexibility)
    const modelKey = Object.keys(providerRates).find((k) =>
      model.toLowerCase().includes(k.toLowerCase())
    );
    if (!modelKey) return 0;

    const rates = providerRates[modelKey];
    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;
    return inputCost + outputCost;
  }

  /**
   * Clears all stored metrics.
   */
  async clearMetrics(): Promise<void> {
    await messenger.storage.local.set({ [METRICS_STORAGE_KEY]: [] });
    this.logger.info('Metrics cleared');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Saves metrics to storage.
   */
  private async saveMetrics(metrics: AnalysisMetrics[]): Promise<void> {
    await messenger.storage.local.set({ [METRICS_STORAGE_KEY]: metrics });
  }

  /**
   * Aggregates raw metrics into summary statistics.
   */
  private aggregateMetrics(
    metrics: AnalysisMetrics[],
    period: 'hour' | 'day' | 'week' | 'month',
    startTime: number,
    endTime: number
  ): AggregatedMetrics {
    const successful = metrics.filter((m) => m.success);
    const failed = metrics.filter((m) => !m.success);

    // Initialize provider stats
    const byProvider: AggregatedMetrics['byProvider'] = {};

    for (const metric of metrics) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = {
          count: 0,
          successRate: 0,
          averageDuration: 0,
          totalCost: 0,
        };
      }
      byProvider[metric.provider].count++;
      byProvider[metric.provider].totalCost += metric.estimatedCost ?? 0;
    }

    // Calculate averages and rates for each provider
    for (const provider of Object.keys(byProvider)) {
      const providerMetrics = metrics.filter((m) => m.provider === provider);
      const providerSuccess = providerMetrics.filter((m) => m.success);

      byProvider[provider].successRate =
        providerMetrics.length > 0 ? providerSuccess.length / providerMetrics.length : 0;

      byProvider[provider].averageDuration =
        providerSuccess.length > 0
          ? providerSuccess.reduce((sum, m) => sum + m.duration, 0) / providerSuccess.length
          : 0;
    }

    return {
      period,
      startTime,
      endTime,
      totalAnalyses: metrics.length,
      successfulAnalyses: successful.length,
      failedAnalyses: failed.length,
      averageDuration:
        successful.length > 0
          ? successful.reduce((sum, m) => sum + m.duration, 0) / successful.length
          : 0,
      totalInputTokens: metrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
      totalOutputTokens: metrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
      totalEstimatedCost: metrics.reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0),
      byProvider,
    };
  }
}
