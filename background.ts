/**
 * Thunderbird Email AI Assistant - Background Script
 *
 * Minimal entry point that bootstraps the application.
 * All logic is delegated to modular components in src/background/.
 *
 * @module background
 */

import 'reflect-metadata';
import { container } from 'tsyringe';

// ============================================================================
// Background Module
// ============================================================================

import { setupDIContainer, startupLogger, BackgroundScript } from './src/background';
import { ContextMenuHandler } from './src/background/ContextMenuHandler';
import { ToolbarHandler } from './src/background/ToolbarHandler';
import { InstallHandler } from './src/background/InstallHandler';

// ============================================================================
// Register Handlers in DI Container
// ============================================================================

container.registerSingleton('ContextMenuHandler', ContextMenuHandler);
container.registerSingleton('ToolbarHandler', ToolbarHandler);
container.registerSingleton('InstallHandler', InstallHandler);

// ============================================================================
// Extension Entry Point
// ============================================================================

/**
 * Main extension entry point.
 */
(async function main(): Promise<void> {
  startupLogger.info('Thunderbird Email AI Assistant - Background Script Loading');

  try {
    // Step 1: Setup DI container
    setupDIContainer();

    // Step 2: Create and initialize background script
    const backgroundScript = new BackgroundScript();
    await backgroundScript.initialize();

    startupLogger.info('Thunderbird Email AI Assistant - Ready');
  } catch (error) {
    startupLogger.error('Failed to start extension', error);

    try {
      if (typeof messenger !== 'undefined' && messenger.notifications) {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Fehler beim Starten',
          message:
            'Die Erweiterung konnte nicht gestartet werden. Bitte überprüfen Sie die Konsole.',
        });
      }
    } catch {
      // Ignore notification errors during startup
    }

    throw error;
  }
})();

// ============================================================================
// Export for Testing
// ============================================================================

export { BackgroundScript };
