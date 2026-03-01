// ============================================================================
// Validation Utilities - Type Guards and Validation Functions
// ============================================================================
// Migrated from core/config.ts - Central validation utilities
// ============================================================================

import type { Tag, CustomTags } from '../types/TagTypes';
import { Provider } from '../types/ProviderTypes';
import type { AppConfig, ModelConcurrencyConfig } from '../types/ProviderTypes';
import { HARDCODED_TAG_KEYS } from '../constants/TagConstants';

// ============================================================================
// Provider Validation
// ============================================================================

/**
 * Provider-specific default concurrency limits
 */
const PROVIDER_DEFAULT_CONCURRENCY: Record<Provider, number> = {
  [Provider.OLLAMA]: 5,
  [Provider.OPENAI]: 10,
  [Provider.GEMINI]: 5,
  [Provider.CLAUDE]: 5,
  [Provider.MISTRAL]: 10,
  [Provider.DEEPSEEK]: 10,
  [Provider.ZAI_PAAS]: 5,
  [Provider.ZAI_CODING]: 5,
} as const;

/**
 * Type guard to check if a provider value is valid
 */
export function isValidProvider(provider: string): provider is Provider {
  return Object.values(Provider).includes(provider as Provider);
}

// ============================================================================
// Tag Validation
// ============================================================================

/**
 * Type guard to check if a tag is a hardcoded tag
 */
export function isHardcodedTag(tag: Tag): tag is Tag & { key: keyof typeof HARDCODED_TAG_KEYS } {
  return HARDCODED_TAG_KEYS.includes(tag.key);
}

/**
 * Type guard to check if a value is a valid tag color (hex format)
 */
export function isValidColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

// ============================================================================
// Confidence Threshold Validation
// ============================================================================

/**
 * Type guard to check if a confidence threshold value is valid (0-100)
 */
export function isValidConfidenceThreshold(threshold: number): boolean {
  return Number.isInteger(threshold) && threshold >= 0 && threshold <= 100;
}

/**
 * Validates the confidence threshold configuration
 * @returns Array of error messages (empty if valid)
 */
export function validateConfidenceThreshold(threshold: number): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(threshold)) {
    errors.push(`Confidence threshold must be an integer, got: ${threshold}`);
  }

  if (threshold < 0 || threshold > 100) {
    errors.push(`Confidence threshold must be between 0 and 100, got: ${threshold}`);
  }

  return errors;
}

/**
 * Validates confidence thresholds for an array of custom tags
 *
 * @param customTags - Array of custom tag configurations to validate
 * @returns Array of error messages (empty if all valid)
 *
 * @example
 * const tags = [
 *   { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 75 },
 *   { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 101 },
 * ];
 * const errors = validateCustomTagsThresholds(tags);
 * // Returns ["Tag 'tag2' has invalid threshold: 101. Must be an integer between 0 and 100"]
 */
export function validateCustomTagsThresholds(customTags: CustomTags): string[] {
  const errors: string[] = [];

  for (const tag of customTags) {
    if (tag.minConfidenceThreshold === undefined) {
      continue; // Undefined threshold is valid (uses global setting)
    }

    const threshold = tag.minConfidenceThreshold;

    if (!Number.isInteger(threshold)) {
      errors.push(
        `Tag '${tag.key}' has invalid threshold: ${threshold}. Must be an integer between 0 and 100`
      );
      continue;
    }

    if (threshold < 0 || threshold > 100) {
      errors.push(
        `Tag '${tag.key}' has invalid threshold: ${threshold}. Must be an integer between 0 and 100`
      );
    }
  }

  return errors;
}

// ============================================================================
// Concurrency Configuration Validation
// ============================================================================

/**
 * Gets the concurrency limit for a provider/model combination
 *
 * @param config - Application configuration
 * @param provider - Provider identifier
 * @param model - Model identifier (optional)
 * @returns Concurrency limit for the given provider/model
 */
export function getConcurrencyLimit(config: AppConfig, provider: string, model: string): number {
  if (!config.modelConcurrencyLimits) {
    return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
  }

  const modelConfig = config.modelConcurrencyLimits.find(
    (c) => c.provider === provider && c.model === model
  );

  if (modelConfig && modelConfig.concurrency > 0) {
    return modelConfig.concurrency;
  }

  const providerConfig = config.modelConcurrencyLimits.find(
    (c) => c.provider === provider && !c.model
  );

  if (providerConfig && providerConfig.concurrency > 0) {
    return providerConfig.concurrency;
  }

  return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
}

/**
 * Validates model concurrency configuration
 *
 * @param config - Array of model concurrency configurations
 * @returns Array of error messages (empty if valid)
 */
export function validateConcurrencyConfig(config: ModelConcurrencyConfig[]): string[] {
  const errors: string[] = [];

  for (const entry of config) {
    if (!isValidProvider(entry.provider)) {
      errors.push(`Invalid provider: ${entry.provider}`);
    }

    if (!entry.model && !entry.provider) {
      errors.push('Either provider or model must be specified');
    }

    if (
      entry.concurrency !== undefined &&
      (entry.concurrency < 1 || !Number.isInteger(entry.concurrency))
    ) {
      errors.push(
        `Invalid concurrency value for ${entry.provider}/${entry.model}: ${entry.concurrency}. Must be a positive integer.`
      );
    }
  }

  return errors;
}
