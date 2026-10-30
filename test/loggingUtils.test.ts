/**
 * Unit tests for loggingUtils sanitization (issue #2):
 * - Exact field-name matching: tagKey/cacheKey/key are NOT masked
 * - apiKey/api_key/token/secret/password ARE masked
 * - subject/response fields are redacted entirely
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForLogging, maskSensitiveValue } from '../src/shared/utils/loggingUtils';

describe('sanitizeForLogging exact field-name matching', () => {
  it('does NOT mask fields that merely contain "key" as substring', () => {
    const result = sanitizeForLogging({
      tagKey: 'work_urgent',
      cacheKey: 'abc123',
      key: 'plain-value',
      keyCode: 42,
    }) as Record<string, unknown>;

    expect(result.tagKey).toBe('work_urgent');
    expect(result.cacheKey).toBe('abc123');
    expect(result.key).toBe('plain-value');
    expect(result.keyCode).toBe(42);
  });

  it('DOES mask apiKey/api_key/token/secret/password fields', () => {
    const result = sanitizeForLogging({
      apiKey: 'sk-1234567890abcdef',
      api_key: 'sk-1234567890abcdef',
      token: 'tok-1234567890abcdef',
      secret: 'sec-1234567890abcdef',
      password: 'pass-1234567890ab',
    }) as Record<string, string>;

    expect(result.apiKey).toBe('sk-1234...def');
    expect(result.api_key).toBe('sk-1234...def');
    expect(result.token).toBe('tok-123...def');
    expect(result.secret).toBe('sec-123...def');
    expect(result.password).toBe('pass-12...0ab');
  });

  it('masks sensitive fields case-insensitively', () => {
    const result = sanitizeForLogging({ APIKey: 'sk-1234567890abcdef' }) as Record<string, string>;
    expect(result.APIKey).toBe('sk-1234...def');
  });

  it('masks compound provider key names (paladin advisory)', () => {
    const result = sanitizeForLogging({ openaiApiKey: 'sk-secret' }) as Record<string, unknown>;
    expect(result.openaiApiKey).toBe('***');
  });

  it('masks sensitive header names like x-api-key inside nested objects (paladin advisory)', () => {
    const result = sanitizeForLogging({
      headers: { 'x-api-key': 'k', 'content-type': 'text/plain' },
    }) as { headers: Record<string, unknown> };

    expect(result.headers['x-api-key']).toBe('***');
    expect(result.headers['content-type']).toBe('text/plain');
  });

  it('keeps tagKey/cacheKey/key unmasked (paladin advisory)', () => {
    const result = sanitizeForLogging({ tagKey: 'x', cacheKey: 'y', key: 'z' }) as Record<
      string,
      unknown
    >;

    expect(result.tagKey).toBe('x');
    expect(result.cacheKey).toBe('y');
    expect(result.key).toBe('z');
  });

  it('masks nested sensitive fields but not nested key-like fields', () => {
    const result = sanitizeForLogging({
      config: { apiKey: 'sk-1234567890abcdef', tagKey: 'work' },
    }) as { config: Record<string, unknown> };

    expect(result.config.apiKey).toBe('sk-1234...def');
    expect(result.config.tagKey).toBe('work');
  });

  it('masks sensitive URL query params but keeps non-sensitive ones', () => {
    const result = sanitizeForLogging({
      url: 'https://api.example.com/v1?key=secret123&format=json',
    }) as Record<string, string>;

    expect(result.url).toBe('https://api.example.com/v1?key=***&format=json');
  });
});

describe('sanitizeForLogging subject/response redaction', () => {
  it('redacts subject fields entirely', () => {
    const result = sanitizeForLogging({
      messageId: '123',
      subject: 'Quarterly Report — internal numbers',
    }) as Record<string, unknown>;

    expect(result.messageId).toBe('123');
    expect(result.subject).toBe('[redacted 35 chars]');
    expect(result.subject).not.toContain('Quarterly');
  });

  it('redacts raw LLM response fields entirely', () => {
    const result = sanitizeForLogging({
      response: 'Sure! Here is the JSON {"tags": ["work"]}',
    }) as Record<string, unknown>;

    expect(result.response).toBe('[redacted 41 chars]');
    expect(result.response).not.toContain('tags');
  });

  it('redacts non-string subject/response values', () => {
    const result = sanitizeForLogging({
      subject: { raw: 'object' },
      response: ['array'],
    }) as Record<string, unknown>;

    expect(result.subject).toBe('[redacted]');
    expect(result.response).toBe('[redacted]');
  });

  it('redacts nested subject fields', () => {
    const result = sanitizeForLogging({
      message: { id: 7, subject: 'Invoice #42' },
    }) as { message: Record<string, unknown> };

    expect(result.message.id).toBe(7);
    expect(result.message.subject).toBe('[redacted 11 chars]');
  });
});

describe('maskSensitiveValue', () => {
  it('shows first 7 and last 3 chars for long values', () => {
    expect(maskSensitiveValue('sk-1234567890abcdef')).toBe('sk-1234...def');
  });

  it('fully masks short values', () => {
    expect(maskSensitiveValue('short')).toBe('***');
  });

  it('returns "not set" for falsy/non-string values', () => {
    expect(maskSensitiveValue(null)).toBe('not set');
    expect(maskSensitiveValue(undefined)).toBe('not set');
    expect(maskSensitiveValue(12345)).toBe('not set');
  });
});
