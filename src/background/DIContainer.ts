/**
 * Dependency Injection Container Setup
 *
 * Configures TSyringe DI container with all application services.
 *
 * @module background/DIContainer
 */

import { container } from 'tsyringe';

// ============================================================================
// Core Interfaces
// ============================================================================

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { IMailReader } from '@/infrastructure/interfaces/IMailReader';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IClock } from '@/domain/interfaces/IClock';
import type { IRandom } from '@/domain/interfaces/IRandom';

// ============================================================================
// Core Implementations
// ============================================================================

import { ConsoleLogger } from '@/infrastructure/logger/ConsoleLogger';
import { MemoryCache } from '@/infrastructure/cache/MemoryCache';
import { PriorityQueue } from '@/application/services/PriorityQueue';
import { ThunderbirdMailReader } from '@/interfaces/adapters/ThunderbirdMailReader';
import { ThunderbirdTagManager } from '@/interfaces/adapters/ThunderbirdTagManager';
import { StorageLocalConfigRepository } from '@/infrastructure/repositories/StorageLocalConfigRepository';
import { SystemClock, CryptoRandom } from '@/infrastructure/system';

// ============================================================================
// Services
// ============================================================================

import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { TagService } from '@/domain/services/TagService';
import { debugLogBuffer } from '@/infrastructure/logger/DebugLogBuffer';
import { ContextMenuHandler } from '@/background/ContextMenuHandler';
import { ToolbarHandler } from '@/background/ToolbarHandler';
import { InstallHandler } from '@/background/InstallHandler';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';

// ============================================================================
// Use Cases
// ============================================================================

import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { RetrieveEmailUseCase } from '@/application/use-cases/RetrieveEmailUseCase';
import { ExtractEmailContentUseCase } from '@/application/use-cases/ExtractEmailContentUseCase';
import { CacheAnalysisUseCase } from '@/application/use-cases/CacheAnalysisUseCase';
import { ApplyTagsWithConfidenceUseCase } from '@/application/use-cases/ApplyTagsWithConfidenceUseCase';
import { UndoTagChanges } from '@/application/use-cases/UndoTagChanges';
import { TrackAnalysisMetrics } from '@/application/use-cases/TrackAnalysisMetrics';

// ============================================================================
// Background Services
// ============================================================================

import { EmailEventListener } from '@/interfaces/background/EmailEventListener';
import { MessageHandler } from '@/interfaces/background/MessageHandler';

// ============================================================================
// Storage
// ============================================================================

import { TagHistoryRepository } from '@/infrastructure/storage/TagHistoryRepository';
import { MetricsRepository } from '@/infrastructure/storage/MetricsRepository';

// ============================================================================
// Startup Logger
// ============================================================================

/**
 * Startup logging before the DI container is ready (issue #3).
 * Goes through the standard ConsoleLogger path — gated, sanitized and written
 * to the shared debug buffer — instead of raw console output. Safe pre-DI:
 * ConsoleLogger instances share module-level gate state.
 */
const startupConsole = new ConsoleLogger();

export const startupLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    startupConsole.info(`[Background Startup] ${message}`, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    startupConsole.warn(`[Background Startup] ${message}`, meta);
  },
  error: (message: string, error?: unknown) => {
    startupConsole.error(`[Background Startup] ${message}`, {
      error: error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
  },
};

// ============================================================================
// DI Container Setup
// ============================================================================

/**
 * Sets up TSyringe DI container with all application services.
 *
 * Registers:
 * - Core interfaces (ILogger, ICache, IQueue, etc.)
 * - Domain services (EmailContentExtractor, TagService)
 * - Infrastructure services (AppConfigService, RateLimiterService)
 * - Use cases (AnalyzeEmail, ApplyTagsToEmail, etc.)
 * - Background services (EmailEventListener, MessageHandler)
 */
export function setupDIContainer(): void {
  startupLogger.info('Setting up DI container...');

  // ------------------------------------------------------------------------
  // Register Core Interfaces
  // ------------------------------------------------------------------------

  container.registerSingleton<ILogger>('ILogger', ConsoleLogger);
  container.registerSingleton<ICache>('ICache', MemoryCache);
  container.registerSingleton<IQueue>('IQueue', PriorityQueue);
  container.registerSingleton<IMailReader>('IMailReader', ThunderbirdMailReader);
  container.registerSingleton<ITagManager>('ITagManager', ThunderbirdTagManager);
  container.registerSingleton<IConfigRepository>('IConfigRepository', StorageLocalConfigRepository);
  container.registerSingleton<IClock>('IClock', SystemClock);
  container.registerSingleton<IRandom>('IRandom', CryptoRandom);

  startupLogger.info('Core interfaces registered');

  // ------------------------------------------------------------------------
  // Register Services
  // ------------------------------------------------------------------------
  // String tokens are kept ONLY where consumers actually inject/resolve by
  // string ('ProviderFactory' is injected by AnalyzeEmail; 'TagService' is
  // resolved by BackgroundScript). Everything else uses class tokens.

  // 'ICache' is registered once with the core interfaces above.
  container.registerSingleton('ProviderFactory', ProviderFactory);
  container.registerSingleton('TagService', TagService);
  container.registerSingleton(EmailContentExtractor, EmailContentExtractor);
  // AppConfigService self-registers via @singleton() — no explicit registration.
  container.registerSingleton(EmailAnalysisTracker, EmailAnalysisTracker);

  // Debug log buffer: a single instance shared by ConsoleLogger, ProviderUtils
  // and MessageHandler. MessageHandler injects it by the 'DebugLogBuffer' token.
  container.registerInstance('DebugLogBuffer', debugLogBuffer);

  // Background handlers (registered here, not in background.ts)
  container.registerSingleton(ContextMenuHandler, ContextMenuHandler);
  container.registerSingleton(ToolbarHandler, ToolbarHandler);
  container.registerSingleton(InstallHandler, InstallHandler);

  // Toolbar badge: AnalyzeBatchEmails notifies this listener on batch progress
  container.register('BatchProgressListener', {
    useFactory: (c) => c.resolve(ToolbarHandler),
  });

  startupLogger.info('Services registered');

  // ------------------------------------------------------------------------
  // Register Storage
  // ------------------------------------------------------------------------

  container.registerSingleton(TagHistoryRepository, TagHistoryRepository);
  container.registerSingleton(MetricsRepository, MetricsRepository);

  startupLogger.info('Storage registered');

  // ------------------------------------------------------------------------
  // Register Use Cases
  // ------------------------------------------------------------------------

  // Sub-use-cases for AnalyzeEmail
  container.registerSingleton(RetrieveEmailUseCase, RetrieveEmailUseCase);
  container.registerSingleton(ExtractEmailContentUseCase, ExtractEmailContentUseCase);
  container.registerSingleton(CacheAnalysisUseCase, CacheAnalysisUseCase);
  container.registerSingleton(ApplyTagsWithConfidenceUseCase, ApplyTagsWithConfidenceUseCase);

  // Main use cases (class tokens - consumers inject via class)
  container.registerSingleton(AnalyzeEmail, AnalyzeEmail);
  container.registerSingleton(ApplyTagsToEmail, ApplyTagsToEmail);
  container.registerSingleton(AnalyzeBatchEmails, AnalyzeBatchEmails);
  container.registerSingleton(UndoTagChanges, UndoTagChanges);
  container.registerSingleton(TrackAnalysisMetrics, TrackAnalysisMetrics);

  startupLogger.info('Use cases registered');

  // ------------------------------------------------------------------------
  // Register Background Services
  // ------------------------------------------------------------------------

  container.registerSingleton(EmailEventListener, EmailEventListener);
  container.registerSingleton(MessageHandler, MessageHandler);

  startupLogger.info('Background services registered');
  startupLogger.info('DI container setup completed');
}
