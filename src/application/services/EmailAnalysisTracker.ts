/**
 * EmailAnalysisTracker Service
 *
 * Tracks which emails have been analyzed by the AI to prevent duplicate analysis
 * during development. Uses custom email headers (X-AI-Analyzed: true) to persist
 * analysis status across extension reinstallations.
 *
 * This service:
 * - Reads the X-AI-Analyzed header to check if an email was analyzed
 * - Writes the X-AI-Analyzed header after successful analysis
 * - Falls back to storage.local if header operations fail (experimental API)
 * - Provides dependency injection support for testability
 *
 * @module application/services/EmailAnalysisTracker
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for tracker operations.
 */
export interface TrackerConfig {
  /** Whether to use fallback storage if header operations fail */
  useFallback?: boolean;
}

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

/**
 * Type guard to check if messenger.messages has modifyPermanent API.
 */
interface MessengerMessagesModifyPermanent {
  modifyPermanent(messageId: number, newProperties: {
    headers?: Record<string, string>;
  }): Promise<void>;
}

interface MessengerMessages {
  getFull(messageId: number): Promise<ThunderbirdFullMessage>;
}

interface ThunderbirdFullMessage {
  id: number;
  headers: Record<string, string[]>;
  parts: unknown[];
}

interface MessengerWithModify {
  messages: MessengerMessages & Partial<MessengerMessagesModifyPermanent>;
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

interface BrowserApi {
  messenger?: MessengerWithModify;
}

interface ChromeApi {
  messenger?: MessengerWithModify;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * The custom header name used to track analyzed emails.
 */
const ANALYSIS_HEADER_NAME = 'X-AI-Analyzed';

/**
 * The header value that indicates an email has been analyzed.
 */
const ANALYSIS_HEADER_VALUE = 'true';

/**
 * Storage key prefix for fallback tracking mechanism.
 */
const STORAGE_KEY_PREFIX = 'processed_';

// ============================================================================
// EmailAnalysisTracker Implementation
// ============================================================================

/**
 * EmailAnalysisTracker Service
 *
 * Tracks email analysis status using custom headers with fallback to storage.local.
 * Uses dependency injection for testability and follows established patterns.
 *
 * @example
 * ```typescript
 * const tracker = container.resolve(EmailAnalysisTracker);
 * const wasAnalyzed = await tracker.wasAnalyzed(12345);
 * if (!wasAnalyzed) {
 *   await tracker.markAnalyzed(12345);
 * }
 * ```
 */
@injectable()
export class EmailAnalysisTracker {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.logger.debug('✅ EmailAnalysisTracker service initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Checks if an email has been analyzed by reading the X-AI-Analyzed header.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to true if the email has been analyzed
   *
   * @throws {Error} If messenger API is not available
   *
   * @example
   * ```typescript
   * const isAnalyzed = await tracker.wasAnalyzed(12345);
   * if (isAnalyzed) {
   *   console.log('Email was already analyzed');
   * }
   * ```
   */
  async wasAnalyzed(messageId: number): Promise<boolean> {
    this.logger.debug('🔍 Checking if email was analyzed', { messageId });

    try {
      // Check messenger API availability
      const messenger = this.getMessengerApi();
      if (!messenger) {
        throw new Error('messenger API not available');
      }

      // TODO: Implementation will be added in subtask-2-2
      // For now, return false as stub
      this.logger.debug('wasAnalyzed() not yet implemented', { messageId });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to check analysis status', {
        messageId,
        error: errorMessage,
      });
      throw new Error(`Failed to check analysis status for message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Marks an email as analyzed by writing the X-AI-Analyzed header.
   *
   * Attempts to write the header via messagesModifyPermanent API.
   * Falls back to storage.local with key pattern `processed_<messageId>` if header write fails.
   *
   * @param messageId - Thunderbird message ID
   * @param config - Optional configuration
   * @returns Promise that resolves when the email is marked
   *
   * @example
   * ```typescript
   * await tracker.markAnalyzed(12345);
   * console.log('Email marked as analyzed');
   * ```
   */
  async markAnalyzed(messageId: number, config: TrackerConfig = {}): Promise<void> {
    this.logger.debug('🏷️  Marking email as analyzed', { messageId, config });

    try {
      // Check messenger API availability
      const messenger = this.getMessengerApi();
      if (!messenger) {
        throw new Error('messenger API not available');
      }

      // TODO: Implementation will be added in subtask-2-3
      // For now, log as stub
      this.logger.debug('markAnalyzed() not yet implemented', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to mark email as analyzed', {
        messageId,
        error: errorMessage,
      });
      throw new Error(`Failed to mark email ${messageId} as analyzed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Gets the messenger API from global scope.
   *
   * Checks both browser.messenger and chrome.messenger for compatibility.
   *
   * @returns Messenger API or undefined if not available
   */
  private getMessengerApi(): MessengerWithModify | undefined {
    const browserApi = (globalThis as unknown as BrowserApi).browser;
    const chromeApi = (globalThis as unknown as ChromeApi).chrome;

    return browserApi?.messenger || chromeApi?.messenger;
  }

  /**
   * Gets the storage key for fallback tracking.
   *
   * @param messageId - Thunderbird message ID
   * @returns Storage key for the message
   */
  private getStorageKey(messageId: number): string {
    return `${STORAGE_KEY_PREFIX}${messageId}`;
  }
}
