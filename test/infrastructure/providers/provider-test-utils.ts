/**
 * Shared test utilities for provider tests
 */

import { vi } from 'vitest';
import type { ILogger } from '../../../src/domain/interfaces/ILogger';

/**
 * Creates a mock logger for testing
 */
export function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn((key?: string) => {
      if (!key) return 'not set';
      if (key.length <= 10) return '***';
      return key.slice(0, 7) + '...' + key.slice(-3);
    }),
  };
}

/**
 * Creates mock structured email data for testing
 */
export function createMockStructuredData(
  overrides: Partial<{
    headers: Record<string, string>;
    body: string;
    attachments: Array<{ name: string; mimeType: string; size: number }>;
  }> = {}
) {
  return {
    headers: overrides.headers ?? {
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Email',
      date: '2024-01-15T10:00:00Z',
    },
    body: overrides.body ?? 'This is a test email body.',
    attachments: overrides.attachments ?? [],
  };
}

/**
 * Creates mock custom tags for testing
 */
export function createMockCustomTags() {
  return [
    {
      key: 'business',
      name: 'Business',
      color: '#FF0000',
      description: 'Business-related emails',
    },
    {
      key: 'personal',
      name: 'Personal',
      color: '#00FF00',
      description: 'Personal emails from friends and family',
    },
    {
      key: 'newsletter',
      name: 'Newsletter',
      color: '#0000FF',
      description: 'Newsletter subscriptions',
    },
  ];
}

/**
 * Valid tag response from LLM
 */
export const validTagResponse = {
  tags: ['business'],
  confidence: 0.85,
  reasoning: 'This email appears to be business-related.',
};

/**
 * Creates a mock fetch response
 */
export function createMockFetchResponse(data: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
}

/**
 * Creates a mock fetch error response
 */
export function createMockFetchError(status: number, statusText: string, errorBody?: unknown) {
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(errorBody ?? { error: 'Request failed' }),
    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody ?? { error: 'Request failed' })),
  } as unknown as Response;
}
