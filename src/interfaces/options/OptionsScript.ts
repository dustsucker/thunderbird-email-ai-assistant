/**
 * Options Script - DI Container Setup for Options Page
 *
 * Main entry point for options.ts. Sets up dependency injection,
 * initializes UI components, and manages tab navigation.
 *
 * @module interfaces/options/OptionsScript
 */

import 'reflect-metadata';
import { container, injectable } from 'tsyringe';

// ============================================================================
// Core Interfaces
// ============================================================================

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { ICache } from '@/infrastructure/interfaces/ICache';

// ============================================================================
// Core Implementations
// ============================================================================

import { ConsoleLogger } from '@/infrastructure/logger/ConsoleLogger';
import { IndexedDBConfigRepository } from '@/infrastructure/repositories/IndexedDBConfigRepository';
import { MemoryCache } from '@/infrastructure/cache/MemoryCache';
import { ThunderbirdTagManager } from '@/interfaces/adapters/ThunderbirdTagManager';

// ============================================================================
// Services
// ============================================================================

import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { TagService } from '@/domain/services/TagService';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { RateLimiterService } from '@/application/services/RateLimiterService';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';

// ============================================================================
// Use Cases
// ============================================================================

import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';

// ============================================================================
// Domain Events
// ============================================================================

import { EventBus } from '@/domain/events/EventBus';

// ============================================================================
// UI Components
// ============================================================================

import { SettingsForm } from './SettingsForm';
import { TagManagementUI } from './TagManagementUI';
import { BatchAnalysisUI } from './BatchAnalysisUI';
import { AnalysisResultsUI } from './AnalysisResultsUI';
import { ManualReviewPanel } from './ManualReviewPanel';

// ============================================================================
// DOM Element Interfaces
// ============================================================================

// ============================================================================
// Browser API Declarations
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
};

interface CacheStatsResponse {
  success: boolean;
  totalEntries?: number;
  hitRate?: number;
  message?: string;
}

interface CacheClearResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Logger Wrapper (for startup before DI container)
// ============================================================================

/**
 * Simple console logger for startup before DI container is ready.
 */
const startupLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[Options Startup] ${message}`, meta ?? '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[Options Startup] ${message}`, meta ?? '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`[Options Startup] ${message}`, error ?? '');
  },
};

// ============================================================================
// Options Script Main Class
// ============================================================================

/**
 * Options Script Main Class
 *
 * Orchestrates the options page initialization by setting up DI container,
 * registering services, and initializing UI components.
 *
 * @class OptionsScript
 */
@injectable()
class OptionsScript {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private settingsForm: SettingsForm | null = null;
  private tagManagementUI: TagManagementUI | null = null;
  private batchAnalysisUI: BatchAnalysisUI | null = null;
  private analysisResultsUI: AnalysisResultsUI | null = null;
  private manualReviewPanel: ManualReviewPanel | null = null;
  private logger: ILogger | null = null;
  private eventBus: EventBus | null = null;
  private isInitialized = false;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor() {
    startupLogger.info('OptionsScript class instantiated');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Initializes the options page.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      startupLogger.warn('Options page already initialized');
      return;
    }

    startupLogger.info('Initializing options page...');

    try {
      // Step 1: Setup DI container
      this.setupDIContainer();

      // Step 2: Resolve logger
      this.logger = container.resolve<ILogger>('ILogger');
      this.logger.info('Options page initialization started');

      // Step 3: Resolve event bus
      this.eventBus = container.resolve<EventBus>(EventBus);

      // Step 4: Resolve UI components
      this.settingsForm = container.resolve<SettingsForm>(SettingsForm);
      this.tagManagementUI = container.resolve<TagManagementUI>(TagManagementUI);
      this.batchAnalysisUI = container.resolve<BatchAnalysisUI>(BatchAnalysisUI);
      this.analysisResultsUI = container.resolve<AnalysisResultsUI>(AnalysisResultsUI);
      this.manualReviewPanel = container.resolve<ManualReviewPanel>(ManualReviewPanel);

      // Step 5: Initialize UI components
      this.initializeTabs();
      await this.initializeSettingsForm();
      await this.initializeTagManagement();
      await this.initializeBatchAnalysis();
      await this.initializeAnalysisResults();
      await this.initializeManualReview();
      await this.initializeCacheManagement();

      // Step 6: Setup runtime message listeners
      this.setupRuntimeMessageListener();

      this.isInitialized = true;
      this.logger.info('Options page initialization completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startupLogger.error('Failed to initialize options page', error);
      throw new Error(`Options page initialization failed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods - DI Container Setup
  // ==========================================================================

  /**
   * Sets up TSyringe DI container.
   */
  private setupDIContainer(): void {
    startupLogger.info('Setting up DI container...');

    // ------------------------------------------------------------------------
    // Register Core Interfaces
    // ------------------------------------------------------------------------

    container.registerSingleton<ILogger>('ILogger', ConsoleLogger);
    container.registerSingleton<IConfigRepository>('IConfigRepository', IndexedDBConfigRepository);
    container.registerSingleton<ICache>('ICache', MemoryCache);
    container.registerSingleton<ITagManager>('ITagManager', ThunderbirdTagManager);

    startupLogger.info('Core interfaces registered');

    // ------------------------------------------------------------------------
    // Register Services
    // ------------------------------------------------------------------------

    container.registerSingleton('ProviderFactory', ProviderFactory);
    container.registerSingleton('EmailContentExtractor', EmailContentExtractor);
    container.registerSingleton('TagService', TagService);
    container.registerSingleton('AppConfigService', AppConfigService);
    container.registerSingleton('RateLimiterService', RateLimiterService);
    container.registerSingleton('EmailAnalysisTracker', EmailAnalysisTracker);

    startupLogger.info('Services registered');

    // ------------------------------------------------------------------------
    // Register Use Cases
    // ------------------------------------------------------------------------

    container.registerSingleton('AnalyzeEmail', AnalyzeEmail);
    container.registerSingleton('ApplyTagsToEmail', ApplyTagsToEmail);
    container.registerSingleton('AnalyzeBatchEmails', AnalyzeBatchEmails);

    startupLogger.info('Use cases registered');

    // ------------------------------------------------------------------------
    // Register Domain Events
    // ------------------------------------------------------------------------

    container.registerSingleton('EventBus', EventBus);

    startupLogger.info('Event bus registered');

    // ------------------------------------------------------------------------
    // Register UI Components
    // ------------------------------------------------------------------------

    container.registerSingleton('SettingsForm', SettingsForm);
    container.registerSingleton('TagManagementUI', TagManagementUI);
    container.registerSingleton('BatchAnalysisUI', BatchAnalysisUI);
    container.registerSingleton('AnalysisResultsUI', AnalysisResultsUI);
    container.registerSingleton('ManualReviewPanel', ManualReviewPanel);

    startupLogger.info('UI components registered');
    startupLogger.info('DI container setup completed');
  }

  // ==========================================================================
  // Private Methods - UI Initialization
  // ==========================================================================

  /**
   * Initializes tab navigation.
   */
  private initializeTabs(): void {
    this.logger?.debug('Initializing tabs');

    const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-button');
    const tabContents = document.querySelectorAll<HTMLDivElement>('.tab-content');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTabId = tab.dataset.tab;

        if (!targetTabId) {
          this.logger?.warn('Tab does not have data-tab attribute', { tab: tab.textContent });
          return;
        }

        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        tabContents.forEach((content) => content.classList.remove('active'));

        const targetContent = document.getElementById(targetTabId);
        if (targetContent) {
          targetContent.classList.add('active');
        } else {
          this.logger?.warn('Target tab content not found', { tabId: targetTabId });
        }
      });
    });

    this.logger?.debug('Tabs initialized');
  }

  /**
   * Initializes settings form.
   */
  private async initializeSettingsForm(): Promise<void> {
    this.logger?.debug('Initializing settings form');

    if (!this.settingsForm) {
      throw new Error('Settings form not resolved from DI container');
    }

    this.settingsForm.render();
    await this.settingsForm.loadSettings();

    this.logger?.debug('Settings form initialized');
  }

  /**
   * Initializes tag management UI.
   */
  private async initializeTagManagement(): Promise<void> {
    this.logger?.debug('Initializing tag management UI');

    if (!this.tagManagementUI) {
      throw new Error('Tag management UI not resolved from DI container');
    }

    this.tagManagementUI.render();
    await this.tagManagementUI.loadTags();

    this.logger?.debug('Tag management UI initialized');
  }

  /**
   * Initializes batch analysis UI.
   */
  private async initializeBatchAnalysis(): Promise<void> {
    this.logger?.debug('Initializing batch analysis UI');

    if (!this.batchAnalysisUI) {
      throw new Error('Batch analysis UI not resolved from DI container');
    }

    this.batchAnalysisUI.render();

    this.logger?.debug('Batch analysis UI initialized');
  }

  /**
   * Initializes analysis results UI.
   */
  private async initializeAnalysisResults(): Promise<void> {
    this.logger?.debug('Initializing analysis results UI');

    if (!this.analysisResultsUI) {
      throw new Error('Analysis results UI not resolved from DI container');
    }

    this.analysisResultsUI.render();

    // Setup refresh button
    const refreshBtn = document.getElementById('refresh-results-btn') as HTMLButtonElement;
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try {
          refreshBtn.disabled = true;
          refreshBtn.textContent = 'Wird geladen...';
          await this.analysisResultsUI!.refresh();
        } catch (error) {
          this.logger?.error('Failed to refresh analysis results', { error });
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Aktualisieren';
        }
      });
    }

    this.logger?.debug('Analysis results UI initialized');
  }

  /**
   * Initializes manual review panel UI.
   */
  private async initializeManualReview(): Promise<void> {
    this.logger?.debug('Initializing manual review panel UI');

    if (!this.manualReviewPanel) {
      throw new Error('Manual review panel not resolved from DI container');
    }

    this.manualReviewPanel.render();

    // Setup refresh button
    const refreshBtn = document.getElementById('refresh-review-btn') as HTMLButtonElement;
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try {
          refreshBtn.disabled = true;
          refreshBtn.textContent = 'Wird geladen...';
          await this.manualReviewPanel!.refresh();
        } catch (error) {
          this.logger?.error('Failed to refresh manual review panel', { error });
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Aktualisieren';
        }
      });
    }

    this.logger?.debug('Manual review panel UI initialized');
  }

  /**
   * Initializes cache management.
   */
  private async initializeCacheManagement(): Promise<void> {
    this.logger?.debug('Initializing cache management');

    // Setup clear cache button
    const clearCacheBtn = document.getElementById('clear-cache-btn') as HTMLButtonElement;
    const cacheStatusMessage = document.getElementById('cache-status-message') as HTMLSpanElement;

    if (clearCacheBtn && cacheStatusMessage) {
      clearCacheBtn.addEventListener('click', async () => {
        try {
          clearCacheBtn.disabled = true;
          cacheStatusMessage.textContent = 'Cache wird geleert...';

          const response = await this.sendMessage<CacheClearResponse>({ action: 'clearCache' });

          cacheStatusMessage.textContent = response.message;

          // Refresh cache stats after clearing
          await this.updateCacheStats();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger?.error('Failed to clear cache', { error: errorMessage });
          cacheStatusMessage.textContent = `Fehler beim Leeren des Cache: ${errorMessage}`;
        } finally {
          clearCacheBtn.disabled = false;
        }
      });
    }

    // Load cache stats
    await this.updateCacheStats();

    this.logger?.debug('Cache management initialized');
  }

  /**
   * Updates cache statistics display.
   */
  private async updateCacheStats(): Promise<void> {
    const cacheStats = document.getElementById('cache-stats') as HTMLSpanElement;

    if (!cacheStats) {
      return;
    }

    try {
      const response = await this.sendMessage<CacheStatsResponse>({ action: 'getCacheStats' });

      if (
        response.success &&
        response.totalEntries !== undefined &&
        response.hitRate !== undefined
      ) {
        cacheStats.textContent = `Cache-Einträge: ${response.totalEntries} | Hit-Rate: ${response.hitRate}%`;
      } else {
        cacheStats.textContent = response.message ?? 'Cache-Statistiken nicht verfügbar';
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error('Failed to get cache stats', { error: errorMessage });
      cacheStats.textContent = 'Fehler beim Laden der Statistiken';
    }
  }

  // ==========================================================================
  // Private Methods - Event Bus Integration
  // ==========================================================================

  /**
   * Sets up runtime message listeners.
   *
   * Listens for messages from background script and responds accordingly.
   */
  private setupRuntimeMessageListener(): void {
    this.logger?.debug('Setting up runtime message listeners');

    if (typeof window !== 'undefined' && 'browser' in window) {
      const browser = (window as any).browser;
      if (browser?.runtime?.onMessage) {
        browser.runtime.onMessage.addListener(
          (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
            // Type guard for message with action
            if (typeof message === 'object' && message !== null && 'action' in message) {
              const typedMessage = message as Record<string, unknown>;

              // Handle different actions
              switch (typedMessage.action) {
                case 'showError':
                  this.logger?.warn('Error message received', { error: typedMessage });
                  break;
                case 'batchProgress':
                  // Update batch progress UI if needed
                  if (this.batchAnalysisUI) {
                    this.batchAnalysisUI.updateProgress().catch((error) => {
                      this.logger?.error('Failed to update batch progress', { error });
                    });
                  }
                  break;
                default:
                  // Log unknown actions
                  this.logger?.debug('Unknown message action', { action: typedMessage.action });
              }

              sendResponse({ success: true });
              return false;
            }

            return false; // Let other handlers process the message
          }
        );
      }
    }
  }

  // ==========================================================================
  // Private Methods - Utilities
  // ==========================================================================

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

// ============================================================================
// Extension Entry Point
// ============================================================================

/**
 * Main extension entry point.
 */
(async function main(): Promise<void> {
  startupLogger.info('Thunderbird Email AI Assistant - Options Script Loading');

  try {
    const optionsScript = new OptionsScript();
    await optionsScript.initialize();

    startupLogger.info('Thunderbird Email AI Assistant - Options Page Ready');
  } catch (error) {
    startupLogger.error('Failed to initialize options page', error);
    document.body.innerHTML = `
      <div style="color: red; padding: 20px;">
        <h2>Error initializing options page</h2>
        <p>${error instanceof Error ? error.message : String(error)}</p>
        <p>Please check the browser console for more details.</p>
      </div>
    `;
  }
})();

// ============================================================================
// Export for Testing
// ============================================================================

export { OptionsScript };
