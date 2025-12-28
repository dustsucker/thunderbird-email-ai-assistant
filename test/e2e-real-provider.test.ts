import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleLogger } from '../src/infrastructure/logger/ConsoleLogger';
import { BaseProviderAdapter } from '../src/infrastructure/providers';
import { ZaiPaaSProvider } from '../src/infrastructure/providers';
import type { ILogger } from '../src/infrastructure/interfaces/ILogger';
import { loadEmailFixture } from './fixtures/fixture-loader';
import { getTestConfig, TEST_TIMEOUT } from './test-config';
import { DEFAULT_CUSTOM_TAGS } from '../core/config';
import 'reflect-metadata';

function getZaiConfigErrorMessage(): string | undefined {
  const config = getTestConfig();
  if (!config.zaiApiKey || config.zaiApiKey === 'your-zai-api-key-here') {
    return 'ZAI config ist nicht gesetzt. Bitte setze ZAI_API_KEY in der .env Datei';
  }
  return undefined;
}

function createZaiProvider() {
  const logger: ILogger = new ConsoleLogger();
  const zaiProvider = new ZaiPaaSProvider(logger);
  const adapter = new BaseProviderAdapter('zai-paas', zaiProvider, logger);
  return adapter;
}

async function analyzeWithProvider(
  provider: any,
  structuredData: any,
  tags: readonly any[]
): Promise<any> {
  const config = getTestConfig();

  // Convert tags from { key, name, prompt } to { key, name, description }
  const convertedTags = tags.map((tag) => ({
    key: tag.key,
    name: tag.name,
    description: tag.prompt || '',
  }));

  return provider.analyze({
    settings: {
      apiKey: config.zaiApiKey,
      apiUrl: config.zaiBaseUrl,
      model: config.zaiModel,
      // Note: variant is not currently supported by ZaiProvider via settings
      // It uses internal DEFAULT_VARIANT = 'paas'
    },
    data: structuredData,
    tags: convertedTags,
  });
}

describe('E2E Real Provider - ZAI', () => {
  beforeEach(() => {
    const errorMessage = getZaiConfigErrorMessage();
    if (errorMessage) {
      expect.fail(errorMessage);
    }
  });

  beforeEach(() => {
    const config = getTestConfig();
    console.log('=== DEBUG: Test Config ===');
    console.log('zaiModel:', config.zaiModel);
    console.log('zaiVariant:', config.zaiVariant);
    console.log('zaiBaseUrl:', config.zaiBaseUrl);
    console.log('zaiApiKey (first 8 chars):', config.zaiApiKey?.substring(0, 8));
    console.log('=========================');
  });

  it(
    'should tag business email with is_business',
    async () => {
      const provider = createZaiProvider();
      const structuredData = await loadEmailFixture('business-email.eml');

      const result = await analyzeWithProvider(provider, structuredData, DEFAULT_CUSTOM_TAGS);

      expect(result.tags).toBeDefined();
      expect(result.tags).toContain('is_business');
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.length).toBeGreaterThan(10);
    },
    TEST_TIMEOUT
  );

  it(
    'should tag advertisement email with is_advertise',
    async () => {
      const provider = createZaiProvider();
      const structuredData = await loadEmailFixture('advertisement-email.eml');

      const result = await analyzeWithProvider(provider, structuredData, DEFAULT_CUSTOM_TAGS);

      expect(result.tags).toBeDefined();
      expect(result.tags).toContain('is_advertise');
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.length).toBeGreaterThan(10);
    },
    TEST_TIMEOUT
  );

  it(
    'should tag personal email with is_personal',
    async () => {
      const provider = createZaiProvider();
      const structuredData = await loadEmailFixture('personal-email.eml');

      const result = await analyzeWithProvider(provider, structuredData, DEFAULT_CUSTOM_TAGS);

      expect(result.tags).toBeDefined();
      expect(result.tags).toContain('is_personal');
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.length).toBeGreaterThan(10);
    },
    TEST_TIMEOUT
  );

  it(
    'should handle multiple tags correctly',
    async () => {
      const provider = createZaiProvider();
      const structuredData = await loadEmailFixture('business-email.eml');

      const result = await analyzeWithProvider(provider, structuredData, DEFAULT_CUSTOM_TAGS);

      expect(result.tags).toBeDefined();
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    'should reject empty emails gracefully',
    async () => {
      const provider = createZaiProvider();
      const emptyStructuredData = {
        headers: {
          from: 'test@example.com',
          to: 'recipient@example.com',
          subject: 'Test Subject',
          date: new Date().toISOString(),
        },
        body: '',
        attachments: [],
      };

      const result = await analyzeWithProvider(provider, emptyStructuredData, DEFAULT_CUSTOM_TAGS);

      expect(result.tags).toBeDefined();
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    'should validate response structure',
    async () => {
      const provider = createZaiProvider();
      const structuredData = await loadEmailFixture('business-email.eml');

      const result = await analyzeWithProvider(provider, structuredData, DEFAULT_CUSTOM_TAGS);

      expect(result).toBeDefined();
      expect(typeof result.tags).toBe('object');
      expect(Array.isArray(result.tags)).toBe(true);
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.reasoning).toBe('string');
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.reasoning.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );
});
