/**
 * Analysis Results UI Component
 *
 * Displays cached email analysis results with confidence scores and reasoning.
 * Shows applied tags with confidence badges and visual indicators for low-confidence tags.
 *
 * @module interfaces/options/AnalysisResultsUI
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { ConfidenceBadge, createConfidenceBadge } from '@/interfaces/shared/components/ConfidenceBadge';
import {
  confidenceToPercentage,
  getConfidenceLevel,
  meetsThreshold,
  type ConfidenceLevel,
} from '@/shared/utils/confidenceUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Analysis result for display
 */
interface AnalysisResultDisplay {
  cacheKey: string;
  timestamp: number;
  tags: string[];
  confidence: number;
  tagConfidence?: Record<string, number>;
  reasoning: string;
  threshold?: number;
}

/**
 * Analysis results response from background script
 */
interface AnalysisResultsResponse {
  success: boolean;
  results?: AnalysisResultDisplay[];
  error?: string;
  message?: string;
}

// ============================================================================
// Browser API Declarations
// ============================================================================

declare const messenger: {
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    sendMessage(message: unknown, callback?: (response: unknown) => void): void;
    lastError?: { message: string };
  };
};

// ============================================================================
// Analysis Results UI Implementation
// ============================================================================

/**
 * Analysis Results UI Component
 *
 * Displays recent email analysis results with confidence scores.
 * Provides visual feedback for tag confidence and threshold comparison.
 *
 * @example
 * ```typescript
 * const resultsUI = container.resolve<AnalysisResultsUI>(AnalysisResultsUI);
 * await resultsUI.loadResults();
 * ```
 */
@injectable()
export class AnalysisResultsUI {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;
  private resultsContainer: HTMLElement | null = null;
  private globalThreshold: number = 70; // Default threshold

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
    this.logger.debug('AnalysisResultsUI initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Renders analysis results UI to DOM.
   */
  render(): void {
    this.logger.debug('Rendering analysis results UI');

    // Find or create container
    this.resultsContainer = document.getElementById('analysis-results-container');

    if (!this.resultsContainer) {
      this.logger.warn('Analysis results container not found');
      return;
    }

    // Load results on render
    this.loadResults().catch((error) => {
      this.logger.error('Failed to load analysis results', { error });
    });

    this.logger.debug('Analysis results UI rendered');
  }

  /**
   * Loads analysis results from cache and displays them.
   */
  async loadResults(): Promise<void> {
    this.logger.debug('Loading analysis results');

    if (!this.resultsContainer) {
      throw new Error('Analysis results UI not initialized. Call render() first.');
    }

    try {
      // Load global threshold
      await this.loadGlobalThreshold();

      // Request analysis results from background script
      const response = await this.sendMessage<AnalysisResultsResponse>({
        action: 'getAnalysisResults',
        limit: 20,
      });

      if (!response.success || !response.results || response.results.length === 0) {
        this.renderEmptyState();
        return;
      }

      // Sort by timestamp (newest first) - just in case
      const results = response.results
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20); // Show max 20 recent results

      this.renderResults(results);
      this.logger.info('Analysis results loaded', { count: results.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load analysis results', { error: errorMessage });
      this.renderError(errorMessage);
    }
  }

  /**
   * Refreshes the displayed results.
   */
  async refresh(): Promise<void> {
    this.logger.debug('Refreshing analysis results');
    await this.loadResults();
  }

  // ==========================================================================
  // Private Methods - Rendering
  // ==========================================================================

  /**
   * Renders analysis results to DOM.
   */
  private renderResults(results: AnalysisResultDisplay[]): void {
    if (!this.resultsContainer) {
      return;
    }

    this.resultsContainer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'results-header';
    header.innerHTML = `
      <h3>Letzte Analyseergebnisse</h3>
      <p class="help-text">Zeigt die letzten 20 analysierten E-Mails mit ihren Tags und Konfidenz-Werten.</p>
    `;
    this.resultsContainer.appendChild(header);

    const resultsList = document.createElement('div');
    resultsList.className = 'analysis-results-list';

    results.forEach((result) => {
      const resultItem = this.renderResultItem(result);
      resultsList.appendChild(resultItem);
    });

    this.resultsContainer.appendChild(resultsList);
  }

  /**
   * Renders a single analysis result item.
   */
  private renderResultItem(result: AnalysisResultDisplay): HTMLElement {
    const item = document.createElement('div');
    item.className = 'analysis-result-item';

    // Header with timestamp and overall confidence
    const header = document.createElement('div');
    header.className = 'result-header';

    const date = new Date(result.timestamp);
    const dateStr = date.toLocaleString('de-DE');

    // Overall confidence badge
    const overallBadge = createConfidenceBadge(result.confidence, 'compact');
    overallBadge.className = 'confidence-badge-overall';

    header.innerHTML = `
      <span class="result-date">${escapeHtml(dateStr)}</span>
    `;
    header.appendChild(overallBadge);

    item.appendChild(header);

    // Tags container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'result-tags';

    if (result.tags.length === 0) {
      const noTags = document.createElement('div');
      noTags.className = 'no-tags';
      noTags.textContent = 'Keine Tags zugewiesen';
      tagsContainer.appendChild(noTags);
    } else {
      result.tags.forEach((tag) => {
        const tagElement = this.renderTag(tag, result);
        tagsContainer.appendChild(tagElement);
      });
    }

    item.appendChild(tagsContainer);

    // Reasoning (expandable)
    const reasoningSection = this.renderReasoningSection(result);
    item.appendChild(reasoningSection);

    return item;
  }

  /**
   * Renders a single tag with confidence badge.
   */
  private renderTag(tag: string, result: AnalysisResultDisplay): HTMLElement {
    const tagElement = document.createElement('div');
    tagElement.className = 'result-tag';

    // Get per-tag confidence if available, otherwise use overall confidence
    const tagConfidence = result.tagConfidence?.[tag] ?? result.confidence;
    const percentage = confidenceToPercentage(tagConfidence);
    const level = getConfidenceLevel(tagConfidence);
    const meetsThresh = meetsThreshold(tagConfidence, this.globalThreshold);

    // Add class for low confidence
    if (!meetsThresh) {
      tagElement.classList.add('tag-below-threshold');
    }

    // Confidence badge
    const badge = createConfidenceBadge(tagConfidence, 'compact');
    badge.className = `tag-confidence-badge confidence-${level}`;

    // Tag name
    const tagName = document.createElement('span');
    tagName.className = 'tag-name';
    tagName.textContent = tag;

    // Tooltip with reasoning and threshold info
    const tooltip = document.createElement('span');
    tooltip.className = 'tag-tooltip';
    tooltip.innerHTML = `
      <strong>${escapeHtml(tag)}</strong><br>
      Konfidenz: ${percentage}%<br>
      Schwelle: ${this.globalThreshold}%<br>
      ${!meetsThresh ? '<em>Unterhalb des Schwellenwerts</em><br>' : ''}
      <br>
      <strong>Begründung:</strong><br>
      ${escapeHtml(result.reasoning)}
    `;

    tagElement.appendChild(badge);
    tagElement.appendChild(tagName);
    tagElement.appendChild(tooltip);

    return tagElement;
  }

  /**
   * Renders reasoning section (expandable).
   */
  private renderReasoningSection(result: AnalysisResultDisplay): HTMLElement {
    const section = document.createElement('div');
    section.className = 'result-reasoning';

    const toggle = document.createElement('button');
    toggle.className = 'reasoning-toggle';
    toggle.textContent = 'Begründung anzeigen';
    toggle.type = 'button';

    const content = document.createElement('div');
    content.className = 'reasoning-content';
    content.style.display = 'none';
    content.innerHTML = `
      <pre>${escapeHtml(result.reasoning)}</pre>
    `;

    toggle.addEventListener('click', () => {
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      toggle.textContent = isVisible ? 'Begründung anzeigen' : 'Begründung ausblenden';
    });

    section.appendChild(toggle);
    section.appendChild(content);

    return section;
  }

  /**
   * Renders empty state when no results available.
   */
  private renderEmptyState(): void {
    if (!this.resultsContainer) {
      return;
    }

    this.resultsContainer.innerHTML = `
      <div class="analysis-results-empty">
        <h3>Keine Analyseergebnisse</h3>
        <p>Noch wurden keine E-Mails analysiert. Die Ergebnisse werden hier angezeigt, sobald E-Mails analysiert wurden.</p>
      </div>
    `;
  }

  /**
   * Renders error state.
   */
  private renderError(errorMessage: string): void {
    if (!this.resultsContainer) {
      return;
    }

    this.resultsContainer.innerHTML = `
      <div class="analysis-results-error">
        <h3>Fehler beim Laden</h3>
        <p>${escapeHtml(errorMessage)}</p>
      </div>
    `;
  }

  /**
   * Loads global confidence threshold from storage.
   */
  private async loadGlobalThreshold(): Promise<void> {
    try {
      const data = await messenger.storage.local.get({
        appConfig: { minConfidenceThreshold: 70 },
      });
      const appConfig = data.appConfig as { minConfidenceThreshold?: number };
      this.globalThreshold = appConfig.minConfidenceThreshold ?? 70;
    } catch (error) {
      this.logger.warn('Failed to load global threshold, using default', { error });
      this.globalThreshold = 70;
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
