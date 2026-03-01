# Agent Guidelines for Test Directory

## Purpose

Test files for the Thunderbird Email AI Assistant application using Vitest framework.

## Files

### Unit Tests

- `analyze-email.test.ts` - AnalyzeEmail use case (logging, analysis tracking)
- `analyze-batch-emails.test.ts` - Batch email analysis use case
- `config.test.ts` - Configuration management tests
- `config-repository.test.ts` - Config repository persistence tests
- `email-event-listener.test.ts` - Email event handling tests
- `email-low-confidence.test.ts` - Low confidence handling tests
- `rate-limiter.test.ts` - Rate limiting logic tests
- `tag-mapping-fix.test.ts` - Tag mapping edge cases
- `concurrency-integration.test.ts` - Concurrency control tests

### Services & Utilities

- `services/EmailAnalysisTracker.test.ts` - Analysis tracking service
- `shared/utils/confidenceUtils.test.ts` - Confidence calculation utilities

### Interface Tests

- `interfaces/components/ConfidenceBadge.test.ts` - UI component tests
- `interfaces/options/options-form-validation.test.ts` - Options form validation

### Integration Tests

- `integration/tagApplication.test.ts` - Tag application integration
- `e2e.test.ts` - End-to-end tests with mock provider
- `e2e-real-provider.test.ts` - E2E tests with real AI provider

### Test Infrastructure

- `test-setup.ts` - Vitest setup (imports reflect-metadata for tsyringe)
- `test-helpers.ts` - Helper functions (createTestProvider, runTaggingTest)
- `test-config.ts` - Test configuration (API keys, timeouts)
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
