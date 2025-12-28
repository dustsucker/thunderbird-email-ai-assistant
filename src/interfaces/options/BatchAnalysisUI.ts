/**
 * Batch Analysis UI Component
 *
 * Manages batch email analysis with progress tracking and cancellation.
 * Uses dependency injection for loose coupling with batch analysis use case.
 *
 * @module interfaces/options/BatchAnalysisUI
 */

import { injectable, inject } from 'tsyringe';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// DOM Element Interfaces
// ============================================================================

/**
 * Batch Analysis DOM Elements
 */
interface BatchAnalysisElements {
  analyzeAllBtn: HTMLButtonElement;
  cancelAnalysisBtn: HTMLButtonElement;
  killQueueBtn: HTMLButtonElement;
  analyzeProgress: HTMLProgressElement;
  analyzeProgressText: HTMLSpanElement;
  analyzeStatusMessage: HTMLSpanElement;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Batch analysis status
 */
type BatchStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

/**
 * Batch analysis progress data
 */
interface BatchProgress {
  status: BatchStatus;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

/**
 * Batch analysis response
 */
interface BatchAnalysisResponse {
  success: boolean;
  statistics?: BatchStatistics;
  error?: string;
  message?: string;
}

/**
 * Batch statistics
 */
interface BatchStatistics {
  total: number;
  successful: number;
  failed: number;
}

/**
 * Batch cancel response
 */
interface BatchCancelResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Browser API Declarations
// ============================================================================

declare const messenger: {
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
    };
  };
};

// ============================================================================
// Batch Analysis UI Implementation
// ============================================================================

/**
 * Batch Analysis UI Component
 *
 * Manages batch email analysis operations with real-time progress tracking.
 * Provides controls for starting, canceling, and monitoring batch operations.
 *
 * @example
 * ```typescript
 * const batchUI = container.resolve<BatchAnalysisUI>(BatchAnalysisUI);
 * await batchUI.startBatch(['12345', '12346']);
 * await batchUI.updateProgress();
 * ```
 */
@injectable()
export class BatchAnalysisUI {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly analyzeBatch: AnalyzeBatchEmails;
  private readonly logger: ILogger;
  private elements: BatchAnalysisElements | null = null;
  private progressPollingInterval: number | null = null;
  private currentProgress: BatchProgress = {
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    startTime: 0,
  };

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject(AnalyzeBatchEmails) analyzeBatch: AnalyzeBatchEmails,
    @inject('ILogger') logger: ILogger
  ) {
    this.analyzeBatch = analyzeBatch;
    this.logger = logger;
    this.logger.debug('BatchAnalysisUI initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Renders batch analysis UI to DOM.
   *
   * Sets up event listeners for batch control buttons.
   * Initializes progress tracking display.
   */
  render(): void {
    this.logger.debug('Rendering batch analysis UI');

    this.elements = this.getDOMElements();

    // Setup analyze all button
    this.elements.analyzeAllBtn.addEventListener('click', async () => {
      await this.handleAnalyzeAllClick();
    });

    // Setup cancel analysis button
    this.elements.cancelAnalysisBtn.addEventListener('click', async () => {
      await this.cancelBatch();
    });

    // Setup kill queue button
    this.elements.killQueueBtn.addEventListener('click', async () => {
      await this.handleKillQueue();
    });

    this.logger.debug('Batch analysis UI rendered');
  }

  /**
   * Starts batch analysis for specified message IDs.
   *
   * @param messageIds - Array of message IDs to analyze
   * @throws Error if provider is not configured or analysis fails
   */
  async startBatch(messageIds: string[]): Promise<void> {
    this.logger.debug('Starting batch analysis', { count: messageIds.length });

    if (!this.elements) {
      throw new Error('Batch analysis UI not initialized. Call render() first.');
    }

    // Check if provider is configured
    const isConfigured = await this.checkProviderConfigured();

    if (!isConfigured) {
      this.elements.analyzeStatusMessage.textContent =
        'Bitte konfigurieren Sie zuerst einen LLM-Provider.';
      return;
    }

    try {
      this.elements.analyzeAllBtn.disabled = true;
      this.elements.analyzeAllBtn.textContent = 'Analysiere...';
      this.elements.analyzeStatusMessage.textContent = 'Starte Batch-Analyse...';

      const response = await this.sendMessage<BatchAnalysisResponse>({
        action: 'startBatchAnalysis',
      });

      if (!response.success) {
        this.handleBatchError(response.error ?? 'Unbekannter Fehler');
        return;
      }

      // Start progress polling
      this.startProgressPolling();

      this.logger.info('Batch analysis started', { count: messageIds.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start batch analysis', { error: errorMessage });
      this.handleBatchError(errorMessage);
    }
  }

  /**
   * Updates progress display for batch analysis.
   *
   * Polls for current progress and updates UI accordingly.
   * Stops polling when batch is complete.
   */
  async updateProgress(): Promise<void> {
    try {
      const progress = await this.sendMessage<BatchProgress>({ action: 'getBatchProgress' });
      this.currentProgress = progress;

      if (!this.elements) {
        return;
      }

      this.updateBatchUI(progress);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update batch progress', { error: errorMessage });
    }
  }

  /**
   * Cancels the current batch analysis.
   *
   * Stops processing and clears remaining queue items.
   */
  async cancelBatch(): Promise<void> {
    this.logger.debug('Cancelling batch analysis');

    if (!this.elements) {
      return;
    }

    try {
      const response = await this.sendMessage<BatchCancelResponse>({
        action: 'cancelBatchAnalysis',
      });

      if (this.elements) {
        this.elements.analyzeStatusMessage.textContent = response.message;
      }

      this.logger.info('Batch analysis cancelled');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to cancel batch analysis', { error: errorMessage });
      if (this.elements) {
        this.elements.analyzeStatusMessage.textContent = `Fehler beim Abbrechen: ${errorMessage}`;
      }
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Retrieves all DOM elements for batch analysis.
   *
   * @returns DOM elements object
   * @throws Error if required elements are not found
   */
  private getDOMElements(): BatchAnalysisElements {
    const analyzeAllBtn = document.getElementById('analyze-all-btn') as HTMLButtonElement;
    const cancelAnalysisBtn = document.getElementById('cancel-analysis-btn') as HTMLButtonElement;
    const killQueueBtn = document.getElementById('kill-queue-btn') as HTMLButtonElement;
    const analyzeProgress = document.getElementById('analyze-progress') as HTMLProgressElement;
    const analyzeProgressText = document.getElementById('analyze-progress-text') as HTMLSpanElement;
    const analyzeStatusMessage = document.getElementById(
      'analyze-status-message'
    ) as HTMLSpanElement;

    if (
      !analyzeAllBtn ||
      !cancelAnalysisBtn ||
      !killQueueBtn ||
      !analyzeProgress ||
      !analyzeProgressText ||
      !analyzeStatusMessage
    ) {
      throw new Error('Required batch analysis elements not found');
    }

    return {
      analyzeAllBtn,
      cancelAnalysisBtn,
      killQueueBtn,
      analyzeProgress,
      analyzeProgressText,
      analyzeStatusMessage,
    };
  }

  /**
   * Updates batch analysis UI based on progress.
   *
   * @param progress - Current batch progress
   */
  private updateBatchUI(progress: BatchProgress): void {
    if (!this.elements) {
      return;
    }

    const isConfigured =
      this.currentProgress.status === 'idle' || this.currentProgress.status === 'completed';

    // Update button states
    if (progress.status === 'running') {
      this.elements.analyzeAllBtn.disabled = true;
      this.elements.analyzeAllBtn.textContent = 'Analysiere...';
      this.elements.cancelAnalysisBtn.style.display = 'inline-block';
      this.elements.cancelAnalysisBtn.disabled = false;
    } else {
      this.elements.analyzeAllBtn.disabled = !isConfigured;
      this.elements.analyzeAllBtn.textContent =
        progress.status === 'cancelled' ? 'Analysiere alle E-Mails' : 'Analysiere alle E-Mails';
      this.elements.cancelAnalysisBtn.style.display = 'none';
      this.elements.cancelAnalysisBtn.disabled = true;
    }

    // Update progress bar
    if (progress.total > 0) {
      this.elements.analyzeProgress.style.display = 'block';
      const percentage = Math.min(100, Math.round((progress.processed / progress.total) * 100));
      this.elements.analyzeProgress.value = percentage;
      this.elements.analyzeProgressText.textContent = `${progress.processed}/${progress.total} (${percentage}%)`;
    } else {
      this.elements.analyzeProgress.style.display = 'none';
      this.elements.analyzeProgressText.textContent = '';
    }

    // Update status message
    let statusMessage = '';
    switch (progress.status) {
      case 'idle':
        statusMessage = isConfigured
          ? 'Bereit zur Analyse aller E-Mails'
          : 'Bitte konfigurieren Sie zuerst einen LLM-Provider';
        break;
      case 'running':
        statusMessage = `Analysiere E-Mails... (${progress.processed}/${progress.total})`;
        break;
      case 'completed':
        statusMessage = `Analyse abgeschlossen: ${progress.successful}/${progress.total} erfolgreich, ${progress.failed} fehlgeschlagen`;
        break;
      case 'cancelled':
        statusMessage = `Analyse abgebrochen: ${progress.processed}/${progress.total} E-Mails verarbeitet`;
        break;
      case 'error':
        statusMessage = `Fehler: ${progress.errorMessage ?? 'Unbekannter Fehler'}`;
        break;
    }
    this.elements.analyzeStatusMessage.textContent = statusMessage;
  }

  /**
   * Starts polling for batch analysis progress updates.
   *
   * Polls every 500ms until batch is complete.
   */
  private startProgressPolling(): void {
    // Clear any existing interval
    this.stopProgressPolling();

    // Poll every 500ms
    this.progressPollingInterval = window.setInterval(async () => {
      try {
        await this.updateProgress();

        // Stop polling when not running
        if (this.currentProgress.status !== 'running') {
          this.stopProgressPolling();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to get batch progress', { error: errorMessage });
        this.stopProgressPolling();
      }
    }, 500);
  }

  /**
   * Stops polling for batch analysis progress updates.
   */
  private stopProgressPolling(): void {
    if (this.progressPollingInterval !== null) {
      clearInterval(this.progressPollingInterval);
      this.progressPollingInterval = null;
    }
  }

  /**
   * Handles analyze all button click.
   */
  private async handleAnalyzeAllClick(): Promise<void> {
    await this.startBatch([]); // Empty array - background will determine which messages to analyze
  }

  /**
   * Handles kill queue button click.
   */
  private async handleKillQueue(): Promise<void> {
    this.logger.debug('Killing queue');

    if (!this.elements) {
      return;
    }

    try {
      const response = await this.sendMessage<{ success: boolean; message: string }>({
        action: 'clearQueue',
        cancelRunning: true,
      });

      if (this.elements) {
        this.elements.analyzeStatusMessage.textContent = response.message;
      }

      this.logger.info('Queue cleared');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear queue', { error: errorMessage });
      if (this.elements) {
        this.elements.analyzeStatusMessage.textContent = `Fehler beim Leeren der Queue: ${errorMessage}`;
      }
    }
  }

  /**
   * Handles batch error.
   *
   * @param error - Error message
   */
  private handleBatchError(error: string): void {
    if (!this.elements) {
      return;
    }

    const progress: BatchProgress = {
      status: 'error',
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
      endTime: Date.now(),
      errorMessage: error,
    };
    this.updateBatchUI(progress);
  }

  /**
   * Checks if provider is configured.
   *
   * @returns Promise resolving to true if configured
   */
  private async checkProviderConfigured(): Promise<boolean> {
    try {
      const settings = await messenger.storage.local.get({ provider: 'openai' });
      const provider = settings.provider as string;

      if (!provider) {
        return false;
      }

      // Check provider-specific settings
      switch (provider) {
        case 'ollama':
          return !!(settings.ollamaApiUrl && settings.ollamaModel);
        case 'openai':
          return !!settings.openaiApiKey;
        case 'gemini':
          return !!settings.geminiApiKey;
        case 'claude':
          return !!settings.claudeApiKey;
        case 'mistral':
          return !!settings.mistralApiKey;
        case 'deepseek':
          return !!settings.deepseekApiKey;
        case 'zai-paas':
          return !!settings.zaiPaasApiKey;
        case 'zai-coding':
          return !!settings.zaiCodingApiKey;
        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Failed to check provider configuration', { error });
      return false;
    }
  }

  /**
   * Sends a message to the background script.
   *
   * @param message - Message to send
   * @returns Promise resolving to response
   */
  private sendMessage<T = unknown>(message: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (typeof window !== 'undefined' && 'browser' in window) {
        const browser = (window as any).browser;
        if (browser?.runtime) {
          browser.runtime.sendMessage(message, (response: unknown) => {
            const lastError = browser.runtime?.lastError;
            if (lastError) {
              reject(new Error(lastError.message));
            } else {
              resolve(response as T);
            }
          });
        } else {
          reject(new Error('Browser runtime not available'));
        }
      } else {
        reject(new Error('Browser runtime not available'));
      }
    });
  }
}
