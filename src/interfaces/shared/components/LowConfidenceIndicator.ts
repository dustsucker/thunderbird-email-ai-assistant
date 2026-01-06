/**
 * Low-Confidence Indicator Component
 *
 * Reusable UI component for displaying low-confidence indicators in Thunderbird's
 * email list and view. Provides icons, badges, and notification banners for emails
 * that have been flagged due to low-confidence AI classifications.
 *
 * @module interfaces/shared/components/LowConfidenceIndicator
 */

import {
  confidenceToPercentage,
  getConfidenceLevel,
  ConfidenceLevel,
} from '@/shared/utils/confidenceUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Indicator display type
 */
export type IndicatorType = 'icon' | 'badge' | 'both';

/**
 * Indicator placement location
 */
export type IndicatorPlacement = 'list' | 'view' | 'header';

/**
 * Low-confidence indicator configuration options
 */
export interface LowConfidenceIndicatorOptions {
  /** Confidence value in 0-1 range */
  confidence: number;
  /** Display type for the indicator */
  type?: IndicatorType;
  /** Placement location for the indicator */
  placement?: IndicatorPlacement;
  /** Additional CSS classes to apply */
  cssClass?: string;
  /** Optional tooltip text */
  tooltip?: string;
  /** Whether to show animation for new indicators */
  animate?: boolean;
  /** Whether this is a flagged email (requires review) */
  isFlagged?: boolean;
}

/**
 * Notification banner options
 */
export interface NotificationBannerOptions {
  /** Number of low-confidence emails detected */
  count: number;
  /** Optional message override */
  message?: string;
  /** Optional action button text */
  actionText?: string;
  /** Optional action callback */
  onAction?: () => void;
  /** Auto-dismiss timeout in milliseconds (0 for no auto-dismiss) */
  autoDismiss?: number;
}

/**
 * Visibility configuration for indicators
 */
export interface IndicatorVisibilityConfig {
  /** Whether to show indicators at all */
  showIndicators: boolean;
  /** Whether to show icons */
  showIcons: boolean;
  /** Whether to show badges */
  showBadges: boolean;
  /** Whether to show notifications */
  showNotifications: boolean;
}

// ============================================================================
// Low-Confidence Indicator Component
// ============================================================================

/**
 * Low-Confidence Indicator Component Class
 *
 * Creates and manages HTML elements for displaying low-confidence indicators
 * in Thunderbird's email interface. Supports icons, badges, and notifications.
 *
 * @example
 * ```typescript
 * const indicator = new LowConfidenceIndicator();
 * const element = indicator.create({ confidence: 0.65, type: 'icon' });
 * document.body.appendChild(element);
 * ```
 */
export class LowConfidenceIndicator {
  // ========================================================================
  // Private Fields
  // ========================================================================

  private readonly BASE_CLASS = 'low-confidence-indicator';
  private readonly LEVEL_CLASSES: Record<string, string> = {
    'very-low': 'confidence-very-low',
    'low': 'confidence-low',
    'medium': 'confidence-medium',
  };

  private visibilityConfig: IndicatorVisibilityConfig = {
    showIndicators: true,
    showIcons: true,
    showBadges: true,
    showNotifications: true,
  };

  // ========================================================================
  // Public Methods
  // ========================================================================

  /**
   * Creates a low-confidence indicator HTML element
   *
   * @param options - Indicator configuration options
   * @returns HTMLElement configured as a low-confidence indicator
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const element = indicator.create({
   *   confidence: 0.65,
   *   type: 'badge',
   *   placement: 'list',
   *   tooltip: 'Low confidence - requires review'
   * });
   * ```
   */
  create(options: LowConfidenceIndicatorOptions): HTMLElement {
    const {
      confidence,
      type = 'icon',
      placement = 'list',
      cssClass = '',
      tooltip,
      animate = false,
      isFlagged = true,
    } = options;

    // Check visibility
    if (!this.visibilityConfig.showIndicators) {
      return document.createElement('span'); // Return empty element
    }

    // Validate confidence
    if (confidence < 0 || confidence > 1) {
      throw new Error(`Confidence must be between 0 and 1, got: ${confidence}`);
    }

    // Get confidence properties
    const level = this.getDetailedConfidenceLevel(confidence);
    const percentage = confidenceToPercentage(confidence);

    // Create indicator based on type
    let element: HTMLElement;

    if (type === 'icon' || type === 'both') {
      element = this.createIconElement(level, placement, cssClass, animate);
    } else {
      element = this.createBadgeElement(level, percentage, placement, cssClass, animate);
    }

    // Set ARIA attributes for accessibility
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', this.getAriaLabel(level, percentage, isFlagged));

    // Add tooltip if provided
    if (tooltip) {
      element.setAttribute('title', tooltip);
    }

    return element;
  }

  /**
   * Creates an icon-only indicator
   *
   * @param confidence - Confidence value in 0-1 range
   * @param placement - Placement location
   * @param cssClass - Additional CSS classes
   * @returns HTMLElement
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const element = indicator.createIcon(0.65, 'list', '');
   * ```
   */
  createIcon(confidence: number, placement: IndicatorPlacement = 'list', cssClass = ''): HTMLElement {
    if (!this.visibilityConfig.showIcons) {
      return document.createElement('span');
    }

    const level = this.getDetailedConfidenceLevel(confidence);
    return this.createIconElement(level, placement, cssClass, false);
  }

  /**
   * Creates a badge indicator with confidence percentage
   *
   * @param confidence - Confidence value in 0-1 range
   * @param placement - Placement location
   * @param cssClass - Additional CSS classes
   * @returns HTMLElement
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const element = indicator.createBadge(0.65, 'view', '');
   * ```
   */
  createBadge(confidence: number, placement: IndicatorPlacement = 'list', cssClass = ''): HTMLElement {
    if (!this.visibilityConfig.showBadges) {
      return document.createElement('span');
    }

    const level = this.getDetailedConfidenceLevel(confidence);
    const percentage = confidenceToPercentage(confidence);
    return this.createBadgeElement(level, percentage, placement, cssClass, false);
  }

  /**
   * Creates a notification banner for low-confidence emails
   *
   * @param options - Notification banner options
   * @returns HTMLElement configured as a notification banner
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const banner = indicator.createNotificationBanner({
   *   count: 3,
   *   message: '3 emails require review',
   *   actionText: 'Review Now',
   *   onAction: () => console.log('Review clicked')
   * });
   * document.body.appendChild(banner);
   * ```
   */
  createNotificationBanner(options: NotificationBannerOptions): HTMLElement {
    const {
      count,
      message,
      actionText = 'Review',
      onAction,
      autoDismiss = 0,
    } = options;

    // Check visibility
    if (!this.visibilityConfig.showNotifications) {
      return document.createElement('div');
    }

    // Create banner element
    const banner = document.createElement('div');
    banner.className = 'low-confidence-notification notification-new';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');

    // Create content container
    const content = document.createElement('div');
    content.className = 'notification-content';

    // Create warning icon
    const icon = document.createElement('div');
    icon.className = 'notification-icon';
    icon.innerHTML = this.getWarningIconSvg();
    icon.setAttribute('aria-hidden', 'true');

    // Create message
    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = message || `${count} email${count > 1 ? 's' : ''} flagged for manual review due to low confidence`;

    // Create actions container
    const actions = document.createElement('div');
    actions.className = 'notification-actions';

    // Add action button if callback provided
    if (onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'notification-action';
      actionBtn.textContent = actionText;
      actionBtn.type = 'button';
      actionBtn.addEventListener('click', () => {
        onAction();
        this.dismissNotification(banner);
      });
      actions.appendChild(actionBtn);
    }

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = this.getCloseIconSvg();
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.addEventListener('click', () => this.dismissNotification(banner));
    actions.appendChild(closeBtn);

    // Assemble banner
    content.appendChild(icon);
    content.appendChild(messageEl);
    banner.appendChild(content);
    banner.appendChild(actions);

    // Auto-dismiss if configured
    if (autoDismiss > 0) {
      setTimeout(() => this.dismissNotification(banner), autoDismiss);
    }

    return banner;
  }

  /**
   * Marks an email element as flagged
   *
   * @param emailElement - Email row or container element
   * @param isFlagged - Whether the email is flagged
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const emailRow = document.querySelector('.email-row');
   * indicator.markEmailAsFlagged(emailRow, true);
   * ```
   */
  markEmailAsFlagged(emailElement: HTMLElement, isFlagged: boolean): void {
    if (isFlagged) {
      emailElement.classList.add('email-flagged');
      emailElement.setAttribute('data-flagged', 'true');
    } else {
      emailElement.classList.remove('email-flagged');
      emailElement.removeAttribute('data-flagged');
    }
  }

  /**
   * Marks an email element as auto-tagged
   *
   * @param emailElement - Email row or container element
   * @param isAutoTagged - Whether the email was auto-tagged
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * const emailRow = document.querySelector('.email-row');
   * indicator.markEmailAsAutoTagged(emailRow, true);
   * ```
   */
  markEmailAsAutoTagged(emailElement: HTMLElement, isAutoTagged: boolean): void {
    if (isAutoTagged) {
      emailElement.classList.add('email-auto-tagged');
      emailElement.setAttribute('data-auto-tagged', 'true');
    } else {
      emailElement.classList.remove('email-auto-tagged');
      emailElement.removeAttribute('data-auto-tagged');
    }
  }

  /**
   * Updates visibility configuration
   *
   * @param config - New visibility configuration
   *
   * @example
   * ```typescript
   * const indicator = new LowConfidenceIndicator();
   * indicator.setVisibilityConfig({
   *   showIndicators: true,
   *   showIcons: true,
   *   showBadges: false,
   *   showNotifications: true
   * });
   * ```
   */
  setVisibilityConfig(config: Partial<IndicatorVisibilityConfig>): void {
    this.visibilityConfig = { ...this.visibilityConfig, ...config };
    this.applyVisibilityConfig();
  }

  /**
   * Gets current visibility configuration
   *
   * @returns Current visibility configuration
   */
  getVisibilityConfig(): IndicatorVisibilityConfig {
    return { ...this.visibilityConfig };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Creates an icon indicator element
   *
   * @param level - Confidence level
   * @param placement - Placement location
   * @param cssClass - Additional CSS classes
   * @param animate - Whether to add animation
   * @returns HTMLElement
   */
  private createIconElement(
    level: 'very-low' | 'low' | 'medium',
    placement: IndicatorPlacement,
    cssClass: string,
    animate: boolean
  ): HTMLElement {
    const icon = document.createElement('span');
    const classes = [
      this.BASE_CLASS,
      'indicator-icon',
      this.LEVEL_CLASSES[level],
      `indicator-in-${placement}`,
    ];

    if (cssClass) {
      classes.push(cssClass);
    }

    if (animate) {
      classes.push('pulse');
    }

    icon.className = classes.join(' ');
    icon.innerHTML = this.getIconSvg(level);

    return icon;
  }

  /**
   * Creates a badge indicator element
   *
   * @param level - Confidence level
   * @param percentage - Confidence percentage
   * @param placement - Placement location
   * @param cssClass - Additional CSS classes
   * @param animate - Whether to add animation
   * @returns HTMLElement
   */
  private createBadgeElement(
    level: 'very-low' | 'low' | 'medium',
    percentage: number,
    placement: IndicatorPlacement,
    cssClass: string,
    animate: boolean
  ): HTMLElement {
    const badge = document.createElement('span');
    const classes = [
      this.BASE_CLASS,
      'indicator-badge',
      this.LEVEL_CLASSES[level],
      `indicator-in-${placement}`,
    ];

    if (cssClass) {
      classes.push(cssClass);
    }

    if (animate) {
      classes.push('fade-in');
    }

    badge.className = classes.join(' ');

    // Create badge content
    const text = document.createElement('span');
    text.className = 'badge-text';
    text.textContent = this.getBadgeLabel(level);

    const score = document.createElement('span');
    score.className = 'badge-score';
    score.textContent = `${percentage}%`;

    badge.appendChild(text);
    badge.appendChild(score);

    return badge;
  }

  /**
   * Gets detailed confidence level
   *
   * @param confidence - Confidence value in 0-1 range
   * @returns Detailed confidence level
   */
  private getDetailedConfidenceLevel(confidence: number): 'very-low' | 'low' | 'medium' {
    const percentage = confidenceToPercentage(confidence);
    if (percentage < 50) {
      return 'very-low';
    } else if (percentage < 70) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  /**
   * Gets SVG icon for confidence level
   *
   * @param level - Confidence level
   * @returns SVG string
   */
  private getIconSvg(level: 'very-low' | 'low' | 'medium'): string {
    const icons = {
      'very-low': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"/></svg>',
      'low': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
      'medium': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z"/></svg>',
    };

    return icons[level] || icons['low'];
  }

  /**
   * Gets warning icon SVG for notifications
   *
   * @returns SVG string
   */
  private getWarningIconSvg(): string {
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>';
  }

  /**
   * Gets close icon SVG for notifications
   *
   * @returns SVG string
   */
  private getCloseIconSvg(): string {
    return '<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>';
  }

  /**
   * Gets badge label for confidence level
   *
   * @param level - Confidence level
   * @returns Label string
   */
  private getBadgeLabel(level: 'very-low' | 'low' | 'medium'): string {
    const labels = {
      'very-low': 'Very Low',
      'low': 'Low',
      'medium': 'Medium',
    };

    return labels[level] || 'Low';
  }

  /**
   * Gets ARIA label for accessibility
   *
   * @param level - Confidence level
   * @param percentage - Confidence percentage
   * @param isFlagged - Whether email is flagged
   * @returns ARIA label string
   */
  private getAriaLabel(level: 'very-low' | 'low' | 'medium', percentage: number, isFlagged: boolean): string {
    const label = this.getBadgeLabel(level);
    const status = isFlagged ? 'flagged for review' : 'auto-tagged';
    return `${label} confidence ${percentage}%, ${status}`;
  }

  /**
   * Dismisses a notification banner
   *
   * @param banner - Notification banner element
   */
  private dismissNotification(banner: HTMLElement): void {
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';

    setTimeout(() => {
      banner.remove();
    }, 300); // Wait for transition
  }

  /**
   * Applies visibility configuration to document body
   */
  private applyVisibilityConfig(): void {
    const body = document.body;

    // Remove all visibility classes
    body.classList.remove(
      'indicators-hidden',
      'indicators-icons-only',
      'indicators-badges-only',
      'indicators-no-notifications'
    );

    // Apply new configuration
    if (!this.visibilityConfig.showIndicators) {
      body.classList.add('indicators-hidden');
    } else if (!this.visibilityConfig.showIcons && this.visibilityConfig.showBadges) {
      body.classList.add('indicators-badges-only');
    } else if (this.visibilityConfig.showIcons && !this.visibilityConfig.showBadges) {
      body.classList.add('indicators-icons-only');
    }

    if (!this.visibilityConfig.showNotifications) {
      body.classList.add('indicators-no-notifications');
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Creates a low-confidence indicator with default settings
 *
 * @param confidence - Confidence value in 0-1 range
 * @param type - Indicator type
 * @returns HTMLElement
 *
 * @example
 * ```typescript
 * const indicator = createLowConfidenceIndicator(0.65, 'icon');
 * document.body.appendChild(indicator);
 * ```
 */
export function createLowConfidenceIndicator(
  confidence: number,
  type: IndicatorType = 'icon'
): HTMLElement {
  const indicatorComponent = new LowConfidenceIndicator();
  return indicatorComponent.create({ confidence, type });
}

/**
 * Creates a notification banner with default settings
 *
 * @param count - Number of low-confidence emails
 * @returns HTMLElement
 *
 * @example
 * ```typescript
 * const banner = createNotificationBanner(3);
 * document.body.appendChild(banner);
 * ```
 */
export function createNotificationBanner(count: number): HTMLElement {
  const indicatorComponent = new LowConfidenceIndicator();
  return indicatorComponent.createNotificationBanner({ count });
}
