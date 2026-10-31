# Agent Guidelines for Test Directory

## Purpose

Test files for the Thunderbird Email AI Assistant application using Vitest framework.

## Files

### Layout (mirrors src/, plus root-level and e2e tests)

Root-level tests cover use cases and cross-cutting behavior:
`analyze-email.test.ts`, `analyze-batch-emails.test.ts`, `config.test.ts`,
`config-repository.test.ts`, `storage-read-errors.test.ts`,
`email-event-listener.test.ts`, `email-low-confidence.test.ts`,
`rate-limiter.test.ts`, `tag-mapping-fix.test.ts`,
`concurrency-integration.test.ts`, `provider-error-fallback.test.ts`,
`errorMessages.test.ts`, `loggingUtils.test.ts`, and the `options-*.test.ts`
suite (page init, connection, provider settings, markup a11y).

Subtrees:

- `application/use-cases/` - one test per use case (ApplyTagsToEmail,
  ApplyTagsWithConfidenceUseCase, CacheAnalysisUseCase, ExtractEmailContentUseCase,
  RetrieveEmailUseCase, TrackAnalysisMetrics, UndoTagChanges)
- `background/` - BackgroundScript, MessageHandler, BackgroundHandlers, BadgeProgress,
  HandlerCleanup
- `domain/` - services (EmailContentExtractor, TagService) and value objects
  (ApiKey, EmailAddress, TagColor)
- `infrastructure/` - providers (one test per provider plus BaseProvider,
  ProviderFactory, PromptBuilder, ProviderUtils, Validator), cache (AnalysisCache,
  MemoryCache + error paths), logger (ConsoleLogger, DebugLogBuffer), storage
  (MetricsRepository, TagHistoryRepository, TagApplyHistoryRepository), system
  (SystemClock, CryptoRandom)
- `integration/` - DIContainer wiring, tagApplication flow
- `interfaces/` - components (ConfidenceBadge) and options page (DebugTab,
  debug-logging-settings, form validation)
- `services/` - EmailAnalysisTracker, PriorityQueue
- `shared/` - errors (Errors.test.ts) and utils (confidenceUtils)

### E2E

- `e2e.test.ts` - End-to-end tests with mock provider
- `e2e-real-provider.test.ts` - E2E tests with real AI provider

### Test Infrastructure

- `test-setup.ts` - Vitest setup (imports reflect-metadata for tsyringe)
- `test-helpers.ts` - Helper functions (createTestProvider, runTaggingTest)
- `test-config.ts` - Test configuration (API keys, timeouts)
- `helpers/mock-factories.ts` - Shared mock factories
- `mocks/MockProvider.ts` - Mock AI provider for unit tests
- `RateLimiter.test-helper.ts` - Shared rate limiter test utilities
- `fixtures/fixture-loader.ts` - EML file parser and fixture loader
- `fixtures/*.eml` - Sample email fixtures (personal, business, advertisement)

## Rules

- Use **Vitest** framework (`describe`, `it`, `expect`, `vi`)
- Mock dependencies with `vi.fn()` in `beforeEach()` blocks
- Clear/reset mocks between tests using `beforeEach`
- Use TypeScript strict mode with proper typing
- Import from `@/` path aliases for clean imports
- Use `reflect-metadata` for tsyringe DI container support

## Patterns

### Mocking DI Dependencies

```typescript
beforeEach(() => {
  logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  // Inject mocks into class under test
});
```

### Using Fixtures

```typescript
const structuredData = await loadEmailFixture('business-email.eml');
```

### Mock Provider Setup

```typescript
const provider = new MockProvider();
provider.setMockResponse({ tags: ['work'], confidence: 0.9, reasoning: 'Test' });
```

## Commands

- Run all tests: `npm test`
- Run single test: `npx vitest run test/analyze-email.test.ts`
- Watch mode: `npm run test:watch`
- Coverage: `npm test -- --coverage`
- Run E2E with real provider: `TEST_API_KEY=xxx npm test -- e2e-real-provider`
