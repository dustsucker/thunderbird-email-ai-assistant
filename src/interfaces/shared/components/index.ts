/**
 * Shared UI Components
 *
 * Exports reusable UI components for easy importing across the extension.
 *
 * @module interfaces/shared/components
 */

// Confidence Badge Component
export { ConfidenceBadge, createConfidenceBadge, createConfidenceBadges } from './ConfidenceBadge';
export type { ConfidenceBadgeOptions, ConfidenceBadgeDisplayMode } from './ConfidenceBadge';

// Low-Confidence Indicator Component
export {
  LowConfidenceIndicator,
  createLowConfidenceIndicator,
  createNotificationBanner,
} from './LowConfidenceIndicator';
export type {
  LowConfidenceIndicatorOptions,
  NotificationBannerOptions,
  IndicatorVisibilityConfig,
  IndicatorType,
  IndicatorPlacement,
} from './LowConfidenceIndicator';
