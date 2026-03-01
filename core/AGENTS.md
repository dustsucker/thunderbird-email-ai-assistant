# Agent Guidelines for Core Module

## Purpose

**DEPRECATED** - This module is now only re-exports from the new `src/` architecture.

All files in this directory are thin wrapper modules that re-export from their new locations.
They are kept for backward compatibility and will be removed in a future version.

## Files

| File          | Status     | New Location                                                                                                        |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `config.ts`   | Re-exports | `@/shared/types/ProviderTypes`, `@/shared/types/TagTypes`, `@/shared/constants/*`, `@/shared/utils/validationUtils` |
| `cache.ts`    | Re-exports | `@/infrastructure/cache/AnalysisCache`                                                                              |
| `tags.ts`     | Re-exports | `@/domain/services/TagService`, `@/shared/types/TagTypes`, `@/shared/constants/TagConstants`                        |
| `analysis.ts` | Re-exports | `@/infrastructure/providers/PromptBuilder`, `@/shared/types/EmailPart`                                              |

## Migration Status

✅ **COMPLETE** - All core module functionality has been migrated to `src/`:

- **Types** → `src/shared/types/`
- **Constants** → `src/shared/constants/`
- **Utilities** → `src/shared/utils/`
- **Cache** → `src/infrastructure/cache/`
- **Tag Service** → `src/domain/services/TagService`
- **Prompt Builder** → `src/infrastructure/providers/PromptBuilder`

## New Import Patterns

```typescript
// OLD (deprecated, will be removed)
import { DEFAULTS, Provider, type Tag } from '@/core/config';
import { analysisCache, hashEmail } from '@/core/cache';
import { TagService } from '@/core/tags';
import { buildPrompt } from '@/core/analysis';

// NEW (recommended)
import { DEFAULTS, Provider, type Tag } from '@/shared/types/ProviderTypes';
import { type Tag } from '@/shared/types/TagTypes';
import { analysisCache, hashEmail } from '@/infrastructure/cache/AnalysisCache';
import { TagService } from '@/domain/services/TagService';
import { buildPrompt } from '@/infrastructure/providers/PromptBuilder';
```

## Tests

All tests from `core/*.test.ts` have been moved to:

- `test/infrastructure/cache/AnalysisCache.test.ts`
- `test/domain/services/TagService.test.ts`

## Removal Timeline

These re-export modules will be removed in a future version after all code has been updated to use the new import paths directly.
