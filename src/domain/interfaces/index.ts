// ============================================================================
// Domain Interfaces - Barrel Export
// ============================================================================
// This is the central export for all Domain layer interfaces.
// Import from here: import type { ILogger, ITagManager } from '@/domain/interfaces';
// ============================================================================

export type { ILogger } from './ILogger';
export type { ITagManager, TagUpdateOptions } from './ITagManager';
export type { IClock } from './IClock';
export type { IRandom } from './IRandom';

// Re-export types used by ITagManager from shared types
export type { ThunderbirdTag, StorageCustomTags, CustomTags } from './ITagManager';
