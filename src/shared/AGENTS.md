# Shared Module - Agent Guidelines

## Purpose

Cross-cutting utilities, types, constants, and errors used across all layers.
Contains no business logic - only pure utilities and shared definitions.

## Directory Structure

### types/

- `EmailPart.ts` - Email content types (EmailPart, Attachment, ParsedEmail, AnalysisData)
- `ProviderTypes.ts` - AI provider config types (Provider enum, ProviderConfig, AppConfig, DEFAULTS)
- `TagTypes.ts` - Tag-related types (Tag, ThunderbirdTag, CustomTags)

### utils/

- `emailPartUtils.ts` - Email part type guards and HTML-to-text conversion
- `confidenceUtils.ts` - Confidence score calculations (0-1 ↔ 0-100), threshold comparisons
- `QueueLogger.ts` - Shared queue status logging utility

### constants/

- `ProviderConstants.ts` - Analysis system prompts for AI providers

### errors/

- `EmailAnalysisError.ts` - Custom error hierarchy (EmailAnalysisError, ProviderError, etc.)
- `index.ts` - Barrel export for all errors

## Rules

1. **No Side Effects** - All utilities must be pure functions
2. **No Layer Dependencies** - Cannot import from core/, providers/, or infrastructure/
3. **Importable by All** - Any layer can import from shared/
4. **Type-First** - Define interfaces before implementations in consuming layers
5. **Barrel Exports** - Re-export through index files for clean imports

## Patterns

### Type Definitions

```typescript
// Use interfaces for data shapes
export interface EmailPart {
  contentType: string;
  body: string;
  isAttachment: boolean;
}

// Use const assertions for readonly config
export const DEFAULTS = { ... } as const;
```

### Type Guards

```typescript
export function hasNestedParts(part: EmailPart): part is EmailPart & { parts: EmailPart[] } {
  return part.parts !== undefined && part.parts.length > 0;
}
```

### Utility Functions

```typescript
// Pure functions with clear input/output
export function confidenceToPercentage(confidence: number): number {
  if (confidence < 0 || confidence > 1) {
    throw new Error(`Invalid confidence: ${confidence}`);
  }
  return Math.round(confidence * 100);
}
```

### Error Classes

```typescript
export class EmailAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
  }
}
```

## Import Examples

```typescript
import type { EmailPart, AnalysisData } from '@/shared/types/EmailPart';
import { DEFAULTS, Provider } from '@/shared/types/ProviderTypes';
import { hasNestedParts, convertHtmlToText } from '@/shared/utils/emailPartUtils';
import { confidenceToPercentage, meetsThreshold } from '@/shared/utils/confidenceUtils';
import { EmailAnalysisError, ProviderError } from '@/shared/errors';
```
