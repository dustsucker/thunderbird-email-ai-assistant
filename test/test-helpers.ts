import { expect } from 'vitest';
import { MockProvider } from './mocks/MockProvider';
import { BaseProviderSettings, TagResponse } from '../providers/BaseProvider';
import { DEFAULT_CUSTOM_TAGS } from '../core/config';
import { loadEmailFixture } from './fixtures/fixture-loader';

export const MOCK_SETTINGS: BaseProviderSettings = {
  apiKey: 'test-key',
  model: 'test-model',
} as const;

export function createTestProvider(): MockProvider {
  return new MockProvider();
}

export async function runTaggingTest(
  provider: MockProvider,
  params: {
    filename: string;
    expectedTag?: string | string[];
    expectedConfidence: number;
    reasoningSubstring?: string;
  }
): Promise<TagResponse> {
  const structuredData = await loadEmailFixture(params.filename);

  const result = await provider.analyze({
    settings: MOCK_SETTINGS,
    structuredData,
    customTags: DEFAULT_CUSTOM_TAGS,
  });

  if (params.expectedTag) {
    if (Array.isArray(params.expectedTag)) {
      params.expectedTag.forEach(tag => {
        expect(result.tags).toContain(tag);
      });
      expect(result.tags.length).toBe(params.expectedTag.length);
    } else {
      expect(result.tags).toContain(params.expectedTag);
    }
  }

  expect(result.confidence).toBe(params.expectedConfidence);

  if (params.reasoningSubstring) {
    expect(result.reasoning).toContain(params.reasoningSubstring);
  }

  return result;
}

export function expectValidResponse(result: TagResponse): void {
  expect(result).toBeDefined();
  expect(Array.isArray(result.tags)).toBe(true);
  expect(typeof result.confidence).toBe('number');
  expect(result.confidence).toBeGreaterThanOrEqual(0.0);
  expect(result.confidence).toBeLessThanOrEqual(1.0);
  expect(typeof result.reasoning).toBe('string');
  expect(result.reasoning.length).toBeGreaterThan(0);
}
