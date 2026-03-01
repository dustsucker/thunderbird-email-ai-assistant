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
import { IndexedDBConfigRepository } from '@/infrastructure/repositories/IndexedDBConfigRepository';
import { SystemClock, CryptoRandom } from '@/infrastructure/system';

// ============================================================================
// Services
// ============================================================================

import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { TagService } from '@/domain/services/TagService';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { RateLimiterService } from '@/application/services/RateLimiterService';
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
 * Simple console logger for startup before DI container is ready.
 */
export const startupLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[Background Startup] ${message}`, meta || '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[Background Startup] ${message}`, meta || '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`[Background Startup] ${message}`, error || '');
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
  container.registerSingleton<IConfigRepository>('IConfigRepository', IndexedDBConfigRepository);
  container.registerSingleton<IClock>('IClock', SystemClock);
  container.registerSingleton<IRandom>('IRandom', CryptoRandom);

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

  // Main use cases
  container.registerSingleton('AnalyzeEmail', AnalyzeEmail);
  container.registerSingleton('ApplyTagsToEmail', ApplyTagsToEmail);
  container.registerSingleton('AnalyzeBatchEmails', AnalyzeBatchEmails);
  container.registerSingleton(UndoTagChanges, UndoTagChanges);
  container.registerSingleton(TrackAnalysisMetrics, TrackAnalysisMetrics);

  startupLogger.info('Use cases registered');

  // ------------------------------------------------------------------------
  // Register Background Services
  // ------------------------------------------------------------------------

  container.registerSingleton('EmailEventListener', EmailEventListener);
  container.registerSingleton('MessageHandler', MessageHandler);

  startupLogger.info('Background services registered');
  startupLogger.info('DI container setup completed');
}
