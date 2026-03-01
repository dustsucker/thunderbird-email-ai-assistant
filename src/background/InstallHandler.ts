/**
 * Install Handler
 *
 * Handles extension install/update events.
 *
 * @module background/InstallHandler
 */

import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';

// ============================================================================
// Install Handler
// ============================================================================

/**
 * Handles Thunderbird extension install and update events.
 *
 * Initializes default configuration on first install.
 *
 * @example
 * ```typescript
 * const handler = container.resolve<InstallHandler>(InstallHandler);
 * handler.register();
 * ```
 */
@injectable()
export class InstallHandler {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new InstallHandler instance.
   *
   * @param logger - Logger instance for logging operations
   */
  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Registers onInstalled handler for extension install/update.
   */
  register(): void {
    this.logger.info('Registering onInstalled handler...');

    if (messenger.runtime && messenger.runtime.onInstalled) {
      messenger.runtime.onInstalled.addListener(this.handleInstall.bind(this));
      this.logger.info('Install handler registered');
    } else {
      this.logger.warn('Runtime onInstalled handler not available');
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handles extension install event.
   */
  private async handleInstall(details: { reason: string }): Promise<void> {
    if (details.reason === 'install') {
      this.logger.info('Extension installed, initializing default settings...');

      try {
        const configRepository = container.resolve<IConfigRepository>('IConfigRepository');

        // Initialize app config if not exists
        try {
          await configRepository.getAppConfig();
          this.logger.info('App config already exists, skipping defaults');
        } catch {
          this.logger.info('Setting default app config');
          await configRepository.setAppConfig({
            defaultProvider: 'ollama',
            enableNotifications: true,
            enableLogging: false,
            modelConcurrencyLimits: undefined,
          });
        }

        // Initialize ollama provider settings if not exists
        try {
          await configRepository.getProviderSettings('ollama');
          this.logger.info('Ollama provider settings already exist, skipping defaults');
        } catch {
          this.logger.info('Setting default ollama provider settings');
          await configRepository.setProviderSettings('ollama', {
            apiKey: '',
            model: 'gemma3:27b',
            apiUrl: 'http://localhost:11434/api/generate',
          });
        }

        this.logger.info('Default configuration initialized successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to initialize default configuration', {
          error: errorMessage,
        });
      }
    }
  }
}
