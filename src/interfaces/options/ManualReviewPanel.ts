/**
 * Manual Review Panel Component
 *
 * Displays emails flagged for manual review due to low confidence classifications.
 * Allows users to review, approve, or reject tag suggestions.
 *
 * @module interfaces/options/ManualReviewPanel
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { ConfidenceBadge, createConfidenceBadge } from '@/interfaces/shared/components/ConfidenceBadge';
import {
  confidenceToPercentage,
  getConfidenceLevel,
  ConfidenceLevel,
} from '@/shared/utils/confidenceUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Low confidence flag from storage
 */
interface LowConfidenceFlag {
  tagKey: string;
  confidence: number;
  threshold: number;
  thresholdType: 'custom' | 'global';
  reasoning: string;
}

/**
 * Low confidence email data from storage
 */
interface LowConfidenceEmail {
  cacheKey: string;
  flags: LowConfidenceFlag[];
  timestamp: number;
  reviewed?: boolean;
}

/**
 * Flagged email for display
 */
interface FlaggedEmailDisplay {
  cacheKey: string;
  timestamp: number;
  flags: LowConfidenceFlag[];
  reviewed: boolean;
}

/**
 * Manual review response from background script
 */
interface ManualReviewResponse {
  success: boolean;
  emails?: FlaggedEmailDisplay[];
  error?: string;
  message?: string;
}

/**
 * Tag action response
 */
interface TagActionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// Browser API Declarations
// ============================================================================

declare const messenger: {
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
  };
  runtime: {
    sendMessage(message: unknown, callback?: (response: unknown) => void): void;
    lastError?: { message: string };
  };
};

// ============================================================================
// Manual Review Panel Implementation
// ============================================================================

/**
 * Manual Review Panel Component
 *
 * Displays and manages emails flagged for manual review due to low confidence.
 * Provides filtering, sorting, and tag management capabilities.
 *
 * @example
 * ```typescript
 * const reviewPanel = container.resolve<ManualReviewPanel>(ManualReviewPanel);
 * await reviewPanel.loadFlaggedEmails();
 * ```
 */
@injectable()
export class ManualReviewPanel {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;
  private container: HTMLElement | null = null;
  private flaggedEmails: FlaggedEmailDisplay[] = [];
  private currentFilter: 'all' | 'very-low' | 'low' | 'medium' = 'all';
  private currentSort: 'timestamp-desc' | 'timestamp-asc' | 'confidence-desc' | 'confidence-asc' = 'timestamp-desc';
  private currentStatusFilter: 'all' | 'pending' | 'reviewed' = 'all';

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
    this.logger.debug('ManualReviewPanel initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Renders manual review panel to DOM.
   */
  render(): void {
    this.logger.debug('Rendering manual review panel');

    // Find container
    this.container = document.getElementById('manual-review-container');

    if (!this.container) {
      this.logger.warn('Manual review container not found');
      return;
    }

    // Set up filter event listeners
    this.setupEventListeners();

    // Load flagged emails on render
    this.loadFlaggedEmails().catch((error) => {
      this.logger.error('Failed to load flagged emails', { error });
    });

    this.logger.debug('Manual review panel rendered');
  }

  /**
   * Loads flagged emails from storage and displays them.
   */
  async loadFlaggedEmails(): Promise<void> {
    this.logger.debug('Loading flagged emails');

    if (!this.container) {
      throw new Error('Manual review panel not initialized. Call render() first.');
    }

    try {
      // Get all low confidence flags from storage
      const allData = await messenger.storage.local.get();
      const flaggedEmails: FlaggedEmailDisplay[] = [];

      // Filter and transform data
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('lowConfidence_')) {
          const data = value as LowConfidenceEmail;
          if (data.cacheKey && data.flags && Array.isArray(data.flags)) {
            flaggedEmails.push({
              cacheKey: data.cacheKey,
              timestamp: data.timestamp || Date.now(),
              flags: data.flags,
              reviewed: data.reviewed || false,
            });
          }
        }
      }

      this.flaggedEmails = flaggedEmails;
      this.logger.info('Flagged emails loaded', { count: flaggedEmails.length });

      // Apply filters and render
      this.renderFilteredEmails();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load flagged emails', { error: errorMessage });
      this.renderError(errorMessage);
    }
  }

  /**
   * Refreshes the displayed flagged emails.
   */
  async refresh(): Promise<void> {
    this.logger.debug('Refreshing flagged emails');
    await this.loadFlaggedEmails();
  }

  // ==========================================================================
  // Private Methods - Event Listeners
  // ==========================================================================

  /**
   * Sets up event listeners for filters and actions.
   */
  private setupEventListeners(): void {
    // Sort by filter
    const sortSelect = document.getElementById('review-sort-by') as HTMLSelectElement;
    sortSelect?.addEventListener('change', (e) => {
      this.currentSort = (e.target as HTMLSelectElement).value as typeof this.currentSort;
      this.renderFilteredEmails();
    });

    // Confidence filter
    const confidenceFilter = document.getElementById('review-filter-confidence') as HTMLSelectElement;
    confidenceFilter?.addEventListener('change', (e) => {
      this.currentFilter = (e.target as HTMLSelectElement).value as typeof this.currentFilter;
      this.renderFilteredEmails();
    });

    // Status filter
    const statusFilter = document.getElementById('review-status-filter') as HTMLSelectElement;
    statusFilter?.addEventListener('change', (e) => {
      this.currentStatusFilter = (e.target as HTMLSelectElement).value as typeof this.currentStatusFilter;
      this.renderFilteredEmails();
    });
  }

  // ==========================================================================
  // Private Methods - Filtering and Sorting
  // ==========================================================================

  /**
   * Filters and sorts emails, then renders them.
   */
  private renderFilteredEmails(): void {
    if (!this.container) {
      return;
    }

    let filtered = [...this.flaggedEmails];

    // Apply status filter
    if (this.currentStatusFilter === 'pending') {
      filtered = filtered.filter((email) => !email.reviewed);
    } else if (this.currentStatusFilter === 'reviewed') {
      filtered = filtered.filter((email) => email.reviewed);
    }

    // Apply confidence filter
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter((email) => {
        const avgConfidence = this.getAverageConfidence(email);
        if (this.currentFilter === 'very-low') {
          return avgConfidence < 50;
        } else if (this.currentFilter === 'low') {
          return avgConfidence >= 50 && avgConfidence < 70;
        } else if (this.currentFilter === 'medium') {
          return avgConfidence >= 70 && avgConfidence < 80;
        }
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (this.currentSort === 'timestamp-desc') {
        return b.timestamp - a.timestamp;
      } else if (this.currentSort === 'timestamp-asc') {
        return a.timestamp - b.timestamp;
      } else if (this.currentSort === 'confidence-desc') {
        return this.getAverageConfidence(a) - this.getAverageConfidence(b);
      } else if (this.currentSort === 'confidence-asc') {
        return this.getAverageConfidence(b) - this.getAverageConfidence(a);
      }
      return 0;
    });

    this.renderEmails(filtered);
  }

  /**
   * Calculates average confidence for an email.
   */
  private getAverageConfidence(email: FlaggedEmailDisplay): number {
    if (email.flags.length === 0) return 0;
    const sum = email.flags.reduce((acc, flag) => acc + confidenceToPercentage(flag.confidence), 0);
    return sum / email.flags.length;
  }

  // ==========================================================================
  // Private Methods - Rendering
  // ==========================================================================

  /**
   * Renders list of flagged emails.
   */
  private renderEmails(emails: FlaggedEmailDisplay[]): void {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = '';

    if (emails.length === 0) {
      this.renderEmptyState();
      return;
    }

    const emailList = document.createElement('div');
    emailList.className = 'manual-review-list';

    emails.forEach((email) => {
      const emailItem = this.renderEmailItem(email);
      emailList.appendChild(emailItem);
    });

    this.container.appendChild(emailList);
  }

  /**
   * Renders a single flagged email item.
   */
  private renderEmailItem(email: FlaggedEmailDisplay): HTMLElement {
    const item = document.createElement('div');
    item.className = 'review-item';
    if (email.reviewed) {
      item.classList.add('reviewed');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'review-item-header';

    const date = new Date(email.timestamp);
    const dateStr = date.toLocaleString('de-DE');

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${email.reviewed ? 'status-reviewed' : 'status-pending'}`;
    statusBadge.textContent = email.reviewed ? 'Überprüft' : 'Ausstehend';

    header.innerHTML = `
      <span class="review-cache-key">${escapeHtml(email.cacheKey.substring(0, 16))}...</span>
      <span class="review-date">${escapeHtml(dateStr)}</span>
    `;
    header.appendChild(statusBadge);
    item.appendChild(header);

    // Flags container
    const flagsContainer = document.createElement('div');
    flagsContainer.className = 'review-flags';

    email.flags.forEach((flag) => {
      const flagElement = this.renderFlag(flag);
      flagsContainer.appendChild(flagElement);
    });

    item.appendChild(flagsContainer);

    // Actions
    const actions = this.renderActions(email);
    item.appendChild(actions);

    return item;
  }

  /**
   * Renders a single low confidence flag.
   */
  private renderFlag(flag: LowConfidenceFlag): HTMLElement {
    const flagElement = document.createElement('div');
    flagElement.className = 'review-flag';

    const percentage = confidenceToPercentage(flag.confidence);
    const level = getConfidenceLevel(flag.confidence);

    // Confidence badge
    const badge = createConfidenceBadge(flag.confidence, 'compact');
    badge.className = `flag-confidence-badge confidence-${level}`;

    // Tag info
    const tagInfo = document.createElement('div');
    tagInfo.className = 'flag-tag-info';
    tagInfo.innerHTML = `
      <span class="flag-tag-key">${escapeHtml(flag.tagKey)}</span>
      <span class="flag-threshold">
        Schwelle: ${flag.threshold}% (${flag.thresholdType === 'custom' ? 'benutzerdefiniert' : 'global'})
      </span>
    `;

    // Reasoning
    const reasoning = document.createElement('div');
    reasoning.className = 'flag-reasoning';
    reasoning.innerHTML = `<strong>Begründung:</strong> ${escapeHtml(flag.reasoning)}`;

    // Actions
    const actions = document.createElement('div');
    actions.className = 'flag-actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn-apply-tag btn-small';
    applyBtn.textContent = 'Tag anwenden';
    applyBtn.type = 'button';
    applyBtn.addEventListener('click', () => this.handleApplyTag(flag));

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-dismiss-tag btn-small btn-secondary';
    dismissBtn.textContent = 'Ablehnen';
    dismissBtn.type = 'button';
    dismissBtn.addEventListener('click', () => this.handleDismissTag(flag));

    actions.appendChild(applyBtn);
    actions.appendChild(dismissBtn);

    flagElement.appendChild(badge);
    flagElement.appendChild(tagInfo);
    flagElement.appendChild(reasoning);
    flagElement.appendChild(actions);

    return flagElement;
  }

  /**
   * Renders action buttons for an email.
   */
  private renderActions(email: FlaggedEmailDisplay): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'review-item-actions';

    const markReviewedBtn = document.createElement('button');
    markReviewedBtn.className = 'btn-mark-reviewed btn-small';
    markReviewedBtn.textContent = 'Als überprüft markieren';
    markReviewedBtn.type = 'button';
    markReviewedBtn.disabled = email.reviewed;
    markReviewedBtn.addEventListener('click', () => this.handleMarkReviewed(email));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-review btn-small btn-danger';
    deleteBtn.textContent = 'Löschen';
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', () => this.handleDelete(email));

    actions.appendChild(markReviewedBtn);
    actions.appendChild(deleteBtn);

    return actions;
  }

  /**
   * Renders empty state.
   */
  private renderEmptyState(): void {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = `
      <div class="manual-review-empty">
        <h3>Keine E-Mails zur Überprüfung</h3>
        <p>Keine E-Mails mit niedriger Konfidenz gefunden. E-Mails erscheinen hier, wenn Tags aufgrund niedriger Konfidenz nicht automatisch angewendet wurden.</p>
      </div>
    `;
  }

  /**
   * Renders error state.
   */
  private renderError(errorMessage: string): void {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = `
      <div class="manual-review-error">
        <h3>Fehler beim Laden</h3>
        <p>${escapeHtml(errorMessage)}</p>
      </div>
    `;
  }

  // ==========================================================================
  // Private Methods - Action Handlers
  // ==========================================================================

  /**
   * Handles applying a tag to an email.
   */
  private async handleApplyTag(flag: LowConfidenceFlag): Promise<void> {
    this.logger.debug('Applying tag manually', { tagKey: flag.tagKey });

    try {
      // Send message to background script to apply tag
      const response = await this.sendMessage<TagActionResponse>({
        action: 'applyTagManually',
        tagKey: flag.tagKey,
        confidence: flag.confidence,
      });

      if (response.success) {
        this.logger.info('Tag applied successfully', { tagKey: flag.tagKey });
        // Show success feedback (simplified for now)
        alert(`Tag "${flag.tagKey}" wurde angewendet.`);
      } else {
        throw new Error(response.error || 'Failed to apply tag');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to apply tag', { error: errorMessage });
      alert(`Fehler beim Anwenden des Tags: ${errorMessage}`);
    }
  }

  /**
   * Handles dismissing a tag suggestion.
   */
  private async handleDismissTag(flag: LowConfidenceFlag): Promise<void> {
    this.logger.debug('Dismissing tag', { tagKey: flag.tagKey });

    if (!confirm(`Möchten Sie den Tag "${flag.tagKey}" wirklich ablehnen?`)) {
      return;
    }

    try {
      // Send message to background script to dismiss tag
      const response = await this.sendMessage<TagActionResponse>({
        action: 'dismissTag',
        tagKey: flag.tagKey,
      });

      if (response.success) {
        this.logger.info('Tag dismissed successfully', { tagKey: flag.tagKey });
        alert(`Tag "${flag.tagKey}" wurde abgelehnt.`);
      } else {
        throw new Error(response.error || 'Failed to dismiss tag');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to dismiss tag', { error: errorMessage });
      alert(`Fehler beim Ablehnen des Tags: ${errorMessage}`);
    }
  }

  /**
   * Handles marking an email as reviewed.
   */
  private async handleMarkReviewed(email: FlaggedEmailDisplay): Promise<void> {
    this.logger.debug('Marking email as reviewed', { cacheKey: email.cacheKey });

    try {
      // Update in storage
      const storageKey = `lowConfidence_${email.cacheKey}`;
      await messenger.storage.local.set({
        [storageKey]: {
          ...email,
          reviewed: true,
        },
      });

      // Update local state
      email.reviewed = true;

      this.logger.info('Email marked as reviewed', { cacheKey: email.cacheKey });
      this.renderFilteredEmails();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to mark as reviewed', { error: errorMessage });
      alert(`Fehler beim Markieren als überprüft: ${errorMessage}`);
    }
  }

  /**
   * Handles deleting an email from review list.
   */
  private async handleDelete(email: FlaggedEmailDisplay): Promise<void> {
    this.logger.debug('Deleting email from review', { cacheKey: email.cacheKey });

    if (!confirm('Möchten Sie diese E-Mail wirklich aus der Bewertungsliste entfernen?')) {
      return;
    }

    try {
      const storageKey = `lowConfidence_${email.cacheKey}`;
      await messenger.storage.local.remove([storageKey]);

      // Remove from local state
      this.flaggedEmails = this.flaggedEmails.filter((e) => e.cacheKey !== email.cacheKey);

      this.logger.info('Email deleted from review', { cacheKey: email.cacheKey });
      this.renderFilteredEmails();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to delete from review', { error: errorMessage });
      alert(`Fehler beim Löschen: ${errorMessage}`);
    }
  }

  /**
   * Sends a message to the background script.
   */
  private sendMessage<T = unknown>(message: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (typeof messenger !== 'undefined' && messenger.runtime) {
        messenger.runtime.sendMessage(message, (response: unknown) => {
          const lastError = messenger.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
          } else {
            resolve(response as T);
          }
        });
      } else {
        reject(new Error('Browser runtime not available'));
      }
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
