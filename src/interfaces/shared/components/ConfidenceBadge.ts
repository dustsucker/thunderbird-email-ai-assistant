/**
 * Confidence Badge Component
 *
 * Reusable UI component for displaying confidence scores with color coding.
 * Supports multiple display modes and includes accessibility features.
 *
 * @module interfaces/shared/components/ConfidenceBadge
 */

import {
  confidenceToPercentage,
  formatConfidence,
  getConfidenceLevel,
  getConfidenceColor,
  ConfidenceLevel,
} from '@/shared/utils/confidenceUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Confidence badge display modes
 */
export type ConfidenceBadgeDisplayMode = 'compact' | 'detailed' | 'minimal';

/**
 * Confidence badge configuration options
 */
export interface ConfidenceBadgeOptions {
  /** Confidence value in 0-1 range */
  confidence: number;
  /** Display mode for the badge */
  mode?: ConfidenceBadgeDisplayMode;
  /** Additional CSS classes to apply */
  cssClass?: string;
  /** Custom threshold for comparison (optional) */
  threshold?: number;
  /** Whether to show percentage symbol */
  showPercentage?: boolean;
  /** Optional tooltip text */
  tooltip?: string;
}

// ============================================================================
// Confidence Badge Component
// ============================================================================

/**
 * Confidence Badge Component Class
 *
 * Creates and manages HTML elements for displaying confidence scores
 * with appropriate color coding and accessibility features.
 *
 * @example
 * ```typescript
 * const badge = new ConfidenceBadge();
 * const element = badge.create({ confidence: 0.85, mode: 'compact' });
 * document.body.appendChild(element);
 * ```
 */
export class ConfidenceBadge {
  // ==========================================================================
  // Private Constants
  // ==========================================================================

  private readonly BASE_CLASS = 'confidence-badge';
  private readonly LEVEL_CLASSES = {
    high: 'confidence-high',
    medium: 'confidence-medium',
    low: 'confidence-low',
  };

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Creates a confidence badge HTML element
   *
   * @param options - Badge configuration options
   * @returns HTMLSpanElement configured as a confidence badge
   *
   * @example
   * ```typescript
   * const badge = new ConfidenceBadge();
   * const element = badge.create({
   *   confidence: 0.85,
   *   mode: 'compact',
   *   tooltip: 'AI confidence score'
   * });
   * ```
   */
  create(options: ConfidenceBadgeOptions): HTMLSpanElement {
    const {
      confidence,
      mode = 'compact',
      cssClass = '',
      threshold,
      showPercentage = true,
      tooltip,
    } = options;

    // Validate confidence
    if (confidence < 0 || confidence > 1) {
      throw new Error(`Confidence must be between 0 and 1, got: ${confidence}`);
    }

    // Get confidence properties
    const percentage = confidenceToPercentage(confidence);
    const level = getConfidenceLevel(confidence);
    const color = getConfidenceColor(confidence);

    // Create badge element
    const badge = document.createElement('span');
    badge.className = this.buildClassList(level, mode, cssClass);

    // Set ARIA attributes for accessibility
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-label', `Confidence: ${percentage}%`);
    if (threshold) {
      badge.setAttribute(
        'aria-describedby',
        `Threshold: ${threshold}%${percentage >= threshold ? ' - meets threshold' : ' - below threshold'}`
      );
    }

    // Set styling
    badge.style.backgroundColor = color;

    // Set content based on mode
    const content = this.buildContent(confidence, mode, showPercentage, threshold);
    badge.innerHTML = content;

    // Add tooltip if provided
    if (tooltip) {
      badge.setAttribute('title', tooltip);
    }

    return badge;
  }

  /**
   * Creates a compact confidence badge (just the percentage)
   *
   * @param confidence - Confidence value in 0-1 range
   * @param cssClass - Additional CSS classes
   * @returns HTMLSpanElement
   *
   * @example
   * ```typescript
   * const badge = new ConfidenceBadge();
   * const element = badge.createCompact(0.75);
   * // Returns: <span class="confidence-badge confidence-medium">75%</span>
   * ```
   */
  createCompact(confidence: number, cssClass = ''): HTMLSpanElement {
    return this.create({
      confidence,
      mode: 'compact',
      cssClass,
    });
  }

  /**
   * Creates a detailed confidence badge with label
   *
   * @param confidence - Confidence value in 0-1 range
   * @param cssClass - Additional CSS classes
   * @returns HTMLSpanElement
   *
   * @example
   * ```typescript
   * const badge = new ConfidenceBadge();
   * const element = badge.createDetailed(0.85);
   * // Returns: <span class="confidence-badge confidence-high detailed">85% High</span>
   * ```
   */
  createDetailed(confidence: number, cssClass = ''): HTMLSpanElement {
    return this.create({
      confidence,
      mode: 'detailed',
      cssClass,
    });
  }

  /**
   * Creates a minimal confidence badge (colored dot indicator)
   *
   * @param confidence - Confidence value in 0-1 range
   * @param cssClass - Additional CSS classes
   * @returns HTMLSpanElement
   *
   * @example
   * ```typescript
   * const badge = new ConfidenceBadge();
   * const element = badge.createMinimal(0.65);
   * // Returns: <span class="confidence-badge confidence-low minimal"></span>
   * ```
   */
  createMinimal(confidence: number, cssClass = ''): HTMLSpanElement {
    return this.create({
      confidence,
      mode: 'minimal',
      cssClass,
    });
  }

  /**
   * Updates an existing confidence badge element
   *
   * @param element - Existing badge element to update
   * @param confidence - New confidence value
   * @param mode - Display mode (optional, keeps current if not provided)
   * @returns void
   *
   * @example
   * ```typescript
   * const badge = new ConfidenceBadge();
   * const element = badge.createCompact(0.75);
   * badge.update(element, 0.90); // Updates badge to show 90%
   * ```
   */
  update(element: HTMLSpanElement, confidence: number, mode?: ConfidenceBadgeDisplayMode): void {
    const currentMode = mode || this.inferModeFromElement(element);
    const newBadge = this.create({
      confidence,
      mode: currentMode,
      cssClass: element.className.replace(this.BASE_CLASS, '').trim(),
    });

    // Replace element content and attributes
    element.className = newBadge.className;
    element.setAttribute('aria-label', newBadge.getAttribute('aria-label') || '');
    const ariaDescribedBy = newBadge.getAttribute('aria-describedby');
    if (ariaDescribedBy) {
      element.setAttribute('aria-describedby', ariaDescribedBy);
    } else {
      element.removeAttribute('aria-describedby');
    }
    element.style.backgroundColor = newBadge.style.backgroundColor;
    element.innerHTML = newBadge.innerHTML;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Builds the CSS class list for the badge
   *
   * @param level - Confidence level
   * @param mode - Display mode
   * @param customClass - Additional custom CSS classes
   * @returns Complete class string
   */
  private buildClassList(
    level: ConfidenceLevel,
    mode: ConfidenceBadgeDisplayMode,
    customClass: string
  ): string {
    const classes = [this.BASE_CLASS, this.LEVEL_CLASSES[level], mode];

    if (customClass) {
      classes.push(customClass);
    }

    return classes.join(' ').trim();
  }

  /**
   * Builds the inner HTML content for the badge
   *
   * @param confidence - Confidence value in 0-1 range
   * @param mode - Display mode
   * @param showPercentage - Whether to show percentage symbol
   * @param threshold - Optional threshold for comparison
   * @returns HTML content string
   */
  private buildContent(
    confidence: number,
    mode: ConfidenceBadgeDisplayMode,
    showPercentage: boolean,
    threshold?: number
  ): string {
    const percentage = confidenceToPercentage(confidence);
    const level = getConfidenceLevel(confidence);

    switch (mode) {
      case 'compact':
        return showPercentage ? `${percentage}%` : `${percentage}`;

      case 'detailed':
        const label = level.charAt(0).toUpperCase() + level.slice(1);
        return showPercentage ? `${percentage}% ${label}` : `${percentage} ${label}`;

      case 'minimal':
        return ''; // Minimal mode shows just the colored dot

      default:
        return showPercentage ? `${percentage}%` : `${percentage}`;
    }
  }

  /**
   * Infers the display mode from an existing badge element
   *
   * @param element - Badge element to analyze
   * @returns Inferred display mode
   */
  private inferModeFromElement(element: HTMLSpanElement): ConfidenceBadgeDisplayMode {
    if (element.classList.contains('minimal')) {
      return 'minimal';
    }
    if (element.classList.contains('detailed')) {
      return 'detailed';
    }
    return 'compact';
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Creates a confidence badge element with default settings
 *
 * @param confidence - Confidence value in 0-1 range
 * @param mode - Display mode (defaults to 'compact')
 * @returns HTMLSpanElement
 *
 * @example
 * ```typescript
 * const badge = createConfidenceBadge(0.85, 'compact');
 * document.body.appendChild(badge);
 * ```
 */
export function createConfidenceBadge(
  confidence: number,
  mode: ConfidenceBadgeDisplayMode = 'compact'
): HTMLSpanElement {
  const badgeComponent = new ConfidenceBadge();
  return badgeComponent.create({ confidence, mode });
}

/**
 * Creates multiple confidence badges for a collection of confidence values
 *
 * @param confidences - Array of confidence values in 0-1 range
 * @param mode - Display mode for all badges
 * @returns Array of HTMLSpanElement
 *
 * @example
 * ```typescript
 * const badges = createConfidenceBadges([0.85, 0.75, 0.65], 'compact');
 * badges.forEach(badge => document.body.appendChild(badge));
 * ```
 */
export function createConfidenceBadges(
  confidences: number[],
  mode: ConfidenceBadgeDisplayMode = 'compact'
): HTMLSpanElement[] {
  const badgeComponent = new ConfidenceBadge();
  return confidences.map((confidence) => badgeComponent.create({ confidence, mode }));
}
