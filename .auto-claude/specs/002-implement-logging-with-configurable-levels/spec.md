# Specification: Implement Configurable Logging System with Comprehensive Coverage

## Overview

Implement a comprehensive logging system with configurable log levels to enable detailed debugging and troubleshooting. Currently, the application has a basic ConsoleLogger that outputs all messages without level filtering. This enhancement will add log level configuration (DEBUG, INFO, WARN, ERROR) that can be adjusted through the settings UI, allowing users to control verbosity and capture detailed diagnostic information when troubleshooting issues.

The user's request (in German): "Bitte Verbesser mir das Logging, so das ich das logg level einstellen kann und möglichst alles gelogged wird, um besser heraus finden zu können warum sachen nicht funktionieren." translates to: "Please improve the logging for me so that I can set the log level and as much as possible is logged to better find out why things don't work."

## Workflow Type

**Type**: feature

**Rationale**: This is a new feature enhancement that adds configurable log level support to the existing logging infrastructure. It extends the ILogger interface, modifies the ConsoleLogger implementation, adds configuration options, and creates UI controls. This is not a refactor (it adds new capabilities), not an investigation (the requirements are clear), and not a migration (no architectural changes).

## Task Scope

### Services Involved
- **main** (primary) - Thunderbird email AI assistant browser extension

### This Task Will:
- [ ] Add LogLevel enum to infrastructure/interfaces
- [ ] Extend IAppConfig to include logLevel field
- [ ] Enhance ConsoleLogger with setLevel() method and level filtering
- [ ] Update ILogger interface to include setLevel() method
- [ ] Modify DI container initialization to load and apply log level from config
- [ ] Add log level selector UI to SettingsForm
- [ ] Add comprehensive debug logging to key application workflows
- [ ] Write unit tests for log level filtering functionality
- [ ] Update IndexedDBConfigRepository to persist log level preference

### Out of Scope:
- Removing or replacing existing ConsoleLogger (enhancing it instead)
- Changing log message format or structure
- Implementing log file output (stays with console.log)
- Removing LegacyLogger (will remain unused but not deleted)
- Creating a separate logging service/manager class

## Service Context

### main

**Tech Stack:**
- Language: TypeScript
- Framework: None (vanilla TypeScript with Webpack)
- Build Tool: Webpack
- Package Manager: npm
- Dependency Injection: tsyringe
- Testing: Vitest

**Key Directories:**
- `src/` - Source code
- `src/infrastructure/logger/` - Logging implementations
- `src/infrastructure/interfaces/` - Interface definitions
- `src/infrastructure/repositories/` - Data persistence
- `src/interfaces/options/` - Settings UI
- `test/` - Test files

**Entry Points:**
- Options page: `src/interfaces/options/OptionsScript.ts`
- Background script: `src/interfaces/background/index.ts`

**How to Run:**
```bash
# Development build
npm run build:dev

# Production build
npm run build

# Run tests
npm run test

# Watch mode
npm run test:watch

# Type checking
npm run type-check

# Package extension
npm run package
```

**Port:** Not applicable (browser extension, runs in Thunderbird)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/infrastructure/interfaces/ILogger.ts` | main | Add setLevel(level: LogLevel): void method to interface |
| `src/infrastructure/interfaces/IConfigRepository.ts` | main | Add LogLevel enum and logLevel field to IAppConfig |
| `src/infrastructure/logger/ConsoleLogger.ts` | main | Add private logLevel field and setLevel() method with filtering logic |
| `src/infrastructure/repositories/IndexedDBConfigRepository.ts` | main | Ensure logLevel is persisted/retrieved with app config |
| `src/interfaces/options/OptionsScript.ts` | main | Initialize logger with log level from config after loading app config |
| `src/interfaces/options/SettingsForm.ts` | main | Add log level selector UI control and event handling |
| `src/application/use-cases/AnalyzeEmail.ts` | main | Add comprehensive debug logging for email analysis workflow |
| `src/application/use-cases/AnalyzeBatchEmails.ts` | main | Add comprehensive debug logging for batch analysis |
| `src/infrastructure/providers/ProviderFactory.ts` | main | Add debug logging for provider initialization |
| `src/infrastructure/providers/BaseProviderAdapter.ts` | main | Add debug logging for API requests/responses |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/infrastructure/logger/LegacyLogger.ts` | Existing log level filtering implementation (LogLevel enum, shouldLog logic) |
| `src/infrastructure/interfaces/IConfigRepository.ts` | Configuration pattern (IAppConfig interface with existing enableLogging field) |
| `src/interfaces/options/SettingsForm.ts` | Settings UI form controls and event handling pattern |
| `src/infrastructure/repositories/IndexedDBConfigRepository.ts` | Configuration persistence pattern |
| `src/application/use-cases/AnalyzeEmail.ts` | Logger injection and usage pattern with @inject('ILogger') |

## Patterns to Follow

### Log Level Filtering (from LegacyLogger.ts)

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

private shouldLog(level: LogLevel): boolean {
  return level >= this.currentLogLevel;
}

debug(message: string, context?: LoggerContext): void {
  if (this.shouldLog(LogLevel.DEBUG)) {
    console.debug(this.formatMessage(message, context));
  }
}
```

**Key Points:**
- LogLevel uses numeric values for easy comparison (0 = most verbose)
- shouldLog() checks if message level >= current level
- Each log method filters before output
- This pattern should be replicated in ConsoleLogger

### Configuration Pattern (from IConfigRepository.ts)

```typescript
export interface IAppConfig {
  defaultProvider: string;
  enableNotifications: boolean;
  enableLogging: boolean;
  modelConcurrencyLimits?: IModelConcurrencyConfig[];
}
```

**Key Points:**
- Configuration is a simple interface with serializable fields
- Stored in browser.storage.local via IndexedDBConfigRepository
- Boolean flags control features (like enableLogging)
- Add logLevel: LogLevel field following this pattern

### Logger Usage Pattern (from AnalyzeEmail.ts)

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

@injectable()
export class AnalyzeEmail {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  async execute(messageId: string): Promise<AnalyzeEmailResult> {
    this.logger.info('Starting email analysis', { messageId });
    // ... logic ...
    this.logger.debug('Analysis complete', { result });
  }
}
```

**Key Points:**
- Use @inject('ILogger') for constructor injection
- Log at appropriate levels (info for major steps, debug for details)
- Include context objects with relevant data
- Use logger.debug() for detailed diagnostics

### Settings Form Pattern (from SettingsForm.ts)

```typescript
private createCheckbox(label: string, id: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'setting-item';
  // ... create checkbox and span elements ...
  return label;
}

private attachEventHandlers(): void {
  this.elements.providerSelect.addEventListener('change', async () => {
    await this.saveSettings();
  });
}
```

**Key Points:**
- Create form controls with helper methods
- Attach event handlers that call saveSettings()
- Use async/await for config operations
- Follow existing CSS classes and structure

## Requirements

### Functional Requirements

1. **Configurable Log Levels**
   - Description: Add ability to set log level to DEBUG, INFO, WARN, or ERROR
   - Acceptance:
     - LogLevel enum exists with DEBUG=0, INFO=1, WARN=2, ERROR=3
     - ConsoleLogger implements setLevel(level: LogLevel) method
     - Logger filters messages based on current level (e.g., DEBUG shows all, ERROR shows only errors)
     - setLevel() can be called multiple times to change level dynamically

2. **Persistent Log Level Configuration**
   - Description: Log level setting persists across browser extension restarts
   - Acceptance:
     - IAppConfig interface includes logLevel: LogLevel field
     - IndexedDBConfigRepository saves/loads logLevel with other config
     - Default log level is INFO if not set
     - Log level survives extension restart

3. **Settings UI for Log Level**
   - Description: Add dropdown/selector in settings page to choose log level
   - Acceptance:
     - SettingsForm displays log level selector with 4 options (Debug, Info, Warning, Error)
     - Selector shows current log level from config
     - Changing selector immediately saves to config and updates logger
     - UI follows existing settings form styling

4. **Logger Initialization with Config**
   - Description: Logger loads and applies log level from config on startup
   - Acceptance:
     - OptionsScript.ts retrieves app config after loading
     - ConsoleLogger.setLevel() called with config.logLevel
     - Logger has correct level before any use cases execute
     - Works in both options page and background script contexts

5. **Comprehensive Debug Logging**
   - Description: Add detailed logging to help diagnose issues
   - Acceptance:
     - AnalyzeEmail use case logs: start, email retrieval, content extraction, cache check, provider call, tag application
     - AnalyzeBatchEmails logs: batch start, each email analysis, batch completion, errors
     - ProviderFactory logs: provider creation, initialization, errors
     - BaseProviderAdapter logs: API requests, responses, errors, retries
     - All debug logs include relevant context (messageId, provider, status codes, etc.)

### Edge Cases

1. **Invalid Log Level in Config** - If stored config has invalid log level value, default to INFO and log warning
2. **Logger Not Yet Initialized** - If setLevel() called before logger injected, handle gracefully (no-op or queue)
3. **Config Load Failure** - If config fails to load, use INFO level and continue operation
4. **Multiple Logger Instances** - DI container creates singleton, ensure setLevel() affects all usage
5. **EnableLogging = false** - If enableLogging is false, log level setting should be ignored or all output suppressed

## Implementation Notes

### DO
- Copy LogLevel enum and shouldLog() pattern from LegacyLogger.ts to ConsoleLogger
- Add logLevel to IAppConfig interface following existing pattern of enableLogging
- Create settings UI control matching existing checkbox/select styling
- Add debug logging at key workflow steps (entry/exit of methods, API calls, error handling)
- Use German labels for UI elements to match user's language preference (optional, English is fine)
- Write unit tests for log level filtering logic
- Test that changing level in UI immediately affects output

### DON'T
- Create a new LoggerService or LogManager class (enhance existing ConsoleLogger)
- Remove or break existing ILogger interface (extend it only)
- Change console method signatures (debug/info/warn/error remain same)
- Implement file logging or remote logging (stay with console)
- Delete LegacyLogger (leave it as-is, just not using it)
- Over-log performance-critical loops (log once per operation, not per iteration)

## Development Environment

### Start Services

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run build:dev

# Load extension in Thunderbird
# 1. Build the extension: npm run build
# 2. In Thunderbird: Tools -> Add-ons and Themes -> Gear icon -> Debug Add-ons
# 3. Click "Load Temporary Add-on" and select manifest.json

# Run tests in watch mode
npm run test:watch

# Type check while developing
npm run type-check
```

### Service URLs
Not applicable (browser extension)

### Required Environment Variables
- `ZAI_API_KEY` - API key for Zai provider (for testing)
- `ZAI_MODEL` - Model name (default: "glm-4.7")
- `ZAI_VARIANT` - Model variant (default: "coding")
- `ZAI_BASE_URL` - API base URL
- `TEST_API_TIMEOUT` - Test timeout in ms (default: 30000)

### Browser DevTools
- Open Thunderbird DevTools: Tools -> Developer Tools -> Error Console
- Or use about:debugging#/runtime/this-firefox to inspect extension
- Console logs appear in Browser Console (Ctrl+Shift+J)

## Success Criteria

The task is complete when:

1. [ ] Log level can be set via settings UI dropdown (Debug, Info, Warning, Error)
2. [ ] Setting persists across extension restarts
3. [ ] Logger filters output based on selected level (e.g., Debug shows all, Error shows only errors)
4. [ ] Comprehensive debug logs added to key workflows (email analysis, batch processing, provider calls)
5. [ ] No console errors during normal operation
6. [ ] All existing tests still pass
7. [ ] New unit tests cover log level filtering
8. [ ] TypeScript compilation succeeds with no errors
9. [ ] User can verify log level changes immediately affect console output verbosity

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| LogLevel enum values | `test/infrastructure/logger/console-logger.test.ts` | DEBUG=0, INFO=1, WARN=2, ERROR=3 |
| setLevel() changes level | `test/infrastructure/logger/console-logger.test.ts` | currentLogLevel updates correctly |
| shouldLog() filtering | `test/infrastructure/logger/console-logger.test.ts` | Returns true when level >= current, false otherwise |
| debug() respects level | `test/infrastructure/logger/console-logger.test.ts` | Only logs when level <= DEBUG |
| info() respects level | `test/infrastructure/logger/console-logger.test.ts` | Only logs when level <= INFO |
| warn() respects level | `test/infrastructure/logger/console-logger.test.ts` | Only logs when level <= WARN |
| error() respects level | `test/infrastructure/logger/console-logger.test.ts` | Always logs (level <= ERROR) |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Config loads log level | IndexedDBConfigRepository + ConsoleLogger | Saved log level loaded from storage and applied to logger |
| Settings UI saves level | SettingsForm + ConfigRepository | Changing dropdown saves log level to config |
| Dynamic level change | SettingsForm + Logger | Changing level immediately affects console output |
| Default level on new install | ConfigRepository | First run defaults to INFO level |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Change log level to Debug | 1. Open settings page 2. Select "Debug" from log level dropdown 3. Trigger email analysis 4. Check console | Console shows DEBUG, INFO, WARN, ERROR messages (detailed output) |
| Change log level to Error | 1. Open settings page 2. Select "Error" from log level dropdown 3. Trigger email analysis 4. Check console | Console shows only ERROR messages (minimal output) |
| Persist log level across restart | 1. Set log level to "Debug" 2. Close and reopen Thunderbird 3. Trigger email analysis 4. Check dropdown | Dropdown still shows "Debug" and console output is verbose |
| Invalid config recovery | 1. Manually corrupt config in storage 2. Reload extension 3. Check console | Extension loads with INFO level and logs warning about invalid config |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Settings Form | `moz-extension://<id>/options.html` | - Log level dropdown exists and is visible <br> - Dropdown shows 4 options: Debug, Info, Warning, Error <br> - Current selection matches config <br> - Changing selection updates immediately <br> - No console errors when changing setting |
| Email Analysis | Background script context | - Console logs appear at correct verbosity <br> - Debug level shows all steps (retrieval, extraction, cache, API, tags) <br> - Error level shows only failures <br> - Log messages include context objects |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Log level persists in storage | browser.storage.local.get('appConfig') | appConfig.logLevel exists and matches selected value |
| Config saves correctly | Change level 3 times, check storage after each | All changes persisted, final value is last selection |

### Code Quality Checks
| Check | Command/File | Expected |
|-------|--------------|----------|
| TypeScript compiles | `npm run type-check` | No type errors |
| All tests pass | `npm run test` | All tests pass including new logger tests |
| ESLint passes | `npm run lint` | No linting errors |
| No console errors | Browser console during operation | No errors or warnings related to logging |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete
- [ ] Config persistence verified
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (ILogger interface, tsyringe DI, config storage)
- [ ] Log level changes take effect immediately without restart
- [ ] Debug logs provide useful diagnostic information for troubleshooting
- [ ] Performance impact of additional logging is minimal (no significant slowdown)
