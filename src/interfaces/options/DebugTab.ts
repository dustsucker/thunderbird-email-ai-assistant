/**
 * Debug Tab UI Component
 *
 * Live view of the processing queue and debug log viewer with download.
 * Polls queue stats and debug logs every second while the Debug tab is
 * visible; polling stops when the tab is switched away or the page unloads.
 *
 * @module interfaces/options/DebugTab
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces';

// ============================================================================
// Type Definitions (Backend Message Contract)
// ============================================================================

type BatchStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface QueueStatsResponse {
  success: boolean;
  queue: {
    size: number;
    waiting: number;
    processing: number;
    avgWaitTime: number;
  };
  batch: {
    status: BatchStatus;
    total: number;
    processed: number;
    failed: number;
    successful: number;
    percentage: number;
    isRunning: boolean;
    startTime: number;
    endTime?: number;
    errorMessage?: string;
  };
}

interface DebugLogEntry {
  ts: number;
  level: DebugLogLevel;
  msg: string;
  ctx?: string;
}

interface DebugLogsResponse {
  success: boolean;
  entries: DebugLogEntry[];
  droppedCount: number;
}

interface CancelBatchResponse {
  success: boolean;
  message?: string;
}

/** Filter value: 'all' or a minimum level (entries at or above are shown). */
type LevelFilter = 'all' | DebugLogLevel;

// ============================================================================
// Constants
// ============================================================================

const POLL_INTERVAL_MS = 1000;

/** Severity order for the minimum-level filter. Index 0 = lowest. */
const LEVEL_ORDER: Record<DebugLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  idle: 'Inaktiv',
  running: 'Läuft',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
  error: 'Fehler',
};

const LEVEL_LABELS: Record<DebugLogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

// ============================================================================
// Debug Tab Implementation
// ============================================================================

/** No-op fallback so DebugTab can be instantiated without a DI container. */
const noopLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  maskApiKey: (key: string) => key,
};

/**
 * Debug Tab Component
 *
 * Renders the live processing queue panel and the log viewer.
 * The filter is a minimum-level filter ('Fehler' shows warn-free errors only,
 * etc.); the default 'Info' hides debug entries.
 *
 * @example
 * ```typescript
 * const debugTab = container.resolve<DebugTab>(DebugTab);
 * debugTab.render();
 * debugTab.onTabVisibilityChanged(true); // start polling
 * ```
 */
@injectable()
export class DebugTab {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;
  private pollInterval: number | null = null;
  private logEntries: DebugLogEntry[] = [];
  private droppedCount = 0;
  private connectionLost = false;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') logger?: ILogger) {
    this.logger = logger ?? noopLogger;
    this.logger.debug('DebugTab initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Wires up DOM elements and event listeners.
   * Call once after the DOM is ready.
   */
  render(): void {
    const filter = document.getElementById('debug-log-filter') as HTMLSelectElement | null;
    filter?.addEventListener('change', () => this.renderLogList());

    const downloadBtn = document.getElementById('debug-download-log-btn');
    downloadBtn?.addEventListener('click', () => this.downloadLog());

    const clearBtn = document.getElementById('debug-clear-log-btn');
    clearBtn?.addEventListener('click', () => this.clearLog());

    const cancelBtn = document.getElementById('debug-cancel-batch-btn');
    cancelBtn?.addEventListener('click', () => this.cancelBatch());

    // Stop polling when the options page is closed
    window.addEventListener('beforeunload', () => this.onTabVisibilityChanged(false));

    this.logger.debug('DebugTab rendered');
  }

  /**
   * Starts or stops polling based on Debug tab visibility.
   *
   * @param isVisible - true if the Debug tab is the active tab
   */
  onTabVisibilityChanged(isVisible: boolean): void {
    if (isVisible) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  // ==========================================================================
  // Private Methods - Polling
  // ==========================================================================

  private startPolling(): void {
    if (this.pollInterval !== null) {
      return; // already running
    }

    void this.pollTick(); // immediate first update
    this.pollInterval = window.setInterval(() => void this.pollTick(), POLL_INTERVAL_MS);
    this.logger.debug('Debug polling started');
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.debug('Debug polling stopped');
    }
  }

  /**
   * Fetches queue stats and log entries. Transport errors switch the panel
   * into a 'Verbindung...' state and are retried on the next tick.
   */
  private async pollTick(): Promise<void> {
    try {
      const [statsResult, logsResult] = await Promise.all([
        this.sendMessage<QueueStatsResponse>({ action: 'getQueueStats' }),
        this.sendMessage<DebugLogsResponse>({ action: 'getDebugLogs' }),
      ]);

      if (this.connectionLost) {
        this.connectionLost = false;
        this.setConnectionStatus('');
      }

      if (statsResult?.success && statsResult.queue && statsResult.batch) {
        this.renderQueueStats(statsResult);
      }

      if (logsResult?.success && Array.isArray(logsResult.entries)) {
        this.logEntries = logsResult.entries; // backend delivers newest-first
        this.droppedCount = logsResult.droppedCount ?? 0;
        this.renderLogList();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Debug poll failed', { error: errorMessage });
      this.connectionLost = true;
      this.setConnectionStatus('Verbindung...');
      // retry on next tick - keep the interval running
    }
  }

  // ==========================================================================
  // Private Methods - Queue Panel
  // ==========================================================================

  private renderQueueStats(stats: QueueStatsResponse): void {
    const { queue, batch } = stats;

    // Status badge
    const badge = document.getElementById('debug-batch-status-badge');
    if (badge) {
      badge.textContent = BATCH_STATUS_LABELS[batch.status] ?? batch.status;
      badge.className = `status-badge debug-batch-${batch.status}`;
    }

    // Cancel button: only active while a batch is running
    const cancelBtn = document.getElementById('debug-cancel-batch-btn') as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.disabled = !batch.isRunning;
    }

    // Empty state
    const emptyNote = document.getElementById('debug-queue-empty');
    if (emptyNote) {
      emptyNote.style.display = batch.status === 'idle' ? '' : 'none';
    }

    // Progress bar
    const progress = document.getElementById('debug-batch-progress') as HTMLProgressElement | null;
    const progressText = document.getElementById('debug-batch-progress-text');
    const percentage = Math.max(0, Math.min(100, Math.round(batch.percentage)));
    if (progress) {
      progress.style.display = batch.total > 0 ? '' : 'none';
      progress.value = percentage;
    }
    if (progressText) {
      progressText.textContent = batch.total > 0 ? `${percentage}%` : '';
    }

    // Counters
    this.setText('debug-stat-processed', String(batch.processed));
    this.setText('debug-stat-failed', String(batch.failed));
    this.setText('debug-stat-total', String(batch.total));
    this.setText('debug-stat-waiting', String(queue.waiting));
    this.setText('debug-stat-processing', String(queue.processing));
    this.setText('debug-stat-avg-wait', `${Math.round(queue.avgWaitTime)} ms`);
  }

  private setConnectionStatus(text: string): void {
    this.setText('debug-connection-status', text);
  }

  private async cancelBatch(): Promise<void> {
    try {
      const response = await this.sendMessage<CancelBatchResponse>({
        action: 'cancelBatchAnalysis',
      });
      this.setText('debug-cancel-status', response?.message ?? '');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to cancel batch analysis', { error: errorMessage });
      this.setText('debug-cancel-status', `Fehler beim Abbrechen: ${errorMessage}`);
    }
    void this.pollTick(); // refresh immediately
  }

  // ==========================================================================
  // Private Methods - Log Panel
  // ==========================================================================

  private getLevelFilter(): LevelFilter {
    const filter = document.getElementById('debug-log-filter') as HTMLSelectElement | null;
    const value = filter?.value ?? 'info';
    return (['all', 'debug', 'info', 'warn', 'error'] as const).includes(
      value as LevelFilter
    )
      ? (value as LevelFilter)
      : 'info';
  }

  /**
   * Replaces the log DOM with entries matching the current filter.
   * Entries arrive newest-first from the backend and are rendered in order.
   */
  private renderLogList(): void {
    const list = document.getElementById('debug-log-list');
    if (!list) {
      return;
    }

    const filter = this.getLevelFilter();
    const visible =
      filter === 'all'
        ? this.logEntries
        : this.logEntries.filter((entry) => LEVEL_ORDER[entry.level] >= LEVEL_ORDER[filter]);

    list.replaceChildren(...visible.map((entry) => this.createLogRow(entry)));

    const emptyNote = document.getElementById('debug-log-empty');
    if (emptyNote) {
      emptyNote.style.display = this.logEntries.length === 0 ? '' : 'none';
    }

    const droppedNote = document.getElementById('debug-dropped-count');
    if (droppedNote) {
      droppedNote.textContent =
        this.droppedCount > 0 ? `${this.droppedCount} ältere Einträge verworfen` : '';
    }
  }

  private createLogRow(entry: DebugLogEntry): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'debug-log-row';

    const time = document.createElement('span');
    time.className = 'debug-log-time';
    time.textContent = formatTime(entry.ts);

    const level = document.createElement('span');
    level.className = `debug-log-level debug-level-${entry.level}`;
    level.textContent = LEVEL_LABELS[entry.level] ?? entry.level;

    const msg = document.createElement('span');
    msg.className = 'debug-log-msg';
    msg.textContent = entry.msg;
    msg.title = entry.msg;

    row.append(time, level, msg);

    if (entry.ctx) {
      const ctx = document.createElement('span');
      ctx.className = 'debug-log-ctx';
      ctx.textContent = entry.ctx;
      ctx.title = entry.ctx; // full text on hover despite truncation
      row.append(ctx);
    }

    return row;
  }

  /**
   * Downloads all entries (regardless of filter) as a .txt file.
   */
  private downloadLog(): void {
    const lines = this.logEntries.map((entry) => {
      const ts = new Date(entry.ts).toISOString();
      const ctx = entry.ctx ? ` ${entry.ctx}` : '';
      return `${ts} ${LEVEL_LABELS[entry.level] ?? entry.level.toUpperCase()} ${entry.msg}${ctx}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ai-assistant-log-${formatTimestampForFilename(new Date())}.txt`;
    anchor.click();

    URL.revokeObjectURL(url);
    this.logger.info('Debug log downloaded', { entries: this.logEntries.length });
  }

  private async clearLog(): Promise<void> {
    try {
      await this.sendMessage<{ success: boolean }>({ action: 'clearDebugLogs' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear debug logs', { error: errorMessage });
    }
    void this.pollTick(); // immediate refresh shows the emptied list
  }

  // ==========================================================================
  // Private Methods - Utilities
  // ==========================================================================

  private setText(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
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
        const browser = window.browser;
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

// ============================================================================
// Formatting Helpers
// ============================================================================

/** Formats an epoch timestamp as HH:MM:SS.mmm (local time). */
function formatTime(ts: number): string {
  const date = new Date(ts);
  const parts = [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((n) => String(n).padStart(2, '0'));
  return `${parts.join(':')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/** Formats a date as YYYYMMDD-HHmmss for download filenames. */
function formatTimestampForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
