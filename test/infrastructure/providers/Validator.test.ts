/**
 * Unit tests for Validator.validateApiUrl (issue #36: Ollama localhost-only)
 */

import { describe, it, expect } from 'vitest';
import { Validator } from '../../../src/infrastructure/providers/Validator';

describe('Validator.validateApiUrl', () => {
  // ==========================================================================
  // Positive cases — local Ollama endpoints
  // ==========================================================================

  it('accepts http://localhost', () => {
    expect(Validator.validateApiUrl('http://localhost:11434/api/generate')).toBe(true);
  });

  it('accepts http://localhost without port', () => {
    expect(Validator.validateApiUrl('http://localhost')).toBe(true);
  });

  it('accepts http://127.0.0.1 with any port', () => {
    expect(Validator.validateApiUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('accepts https://localhost', () => {
    expect(Validator.validateApiUrl('https://localhost:11434')).toBe(true);
  });

  it('accepts https://127.0.0.1', () => {
    expect(Validator.validateApiUrl('https://127.0.0.1')).toBe(true);
  });

  // ==========================================================================
  // Negative cases — anything that could receive mail content
  // ==========================================================================

  it('rejects remote http host', () => {
    expect(Validator.validateApiUrl('http://evil.example')).toBe(false);
  });

  it('rejects LAN IP', () => {
    expect(Validator.validateApiUrl('http://192.168.1.100:11434')).toBe(false);
  });

  it('rejects loopback lookalike subdomain', () => {
    expect(Validator.validateApiUrl('http://localhost.evil.example')).toBe(false);
  });

  // URL.parse treats text before '@' as userinfo, not as the host — so the
  // effective hostname here is evil.com, which must be rejected.
  it('rejects userinfo prefix pointing at remote host', () => {
    expect(Validator.validateApiUrl('http://localhost@evil.com')).toBe(false);
  });

  // Here userinfo is 'evil.com' and the real host is localhost: fetch connects
  // to localhost only, so the URL is acceptable even though it looks odd.
  it('accepts remote-looking userinfo with localhost as real host', () => {
    expect(Validator.validateApiUrl('http://evil.com@localhost:11434')).toBe(true);
  });

  it('rejects other loopback IPv4 (127.0.0.2 is not allowed)', () => {
    expect(Validator.validateApiUrl('http://127.0.0.2')).toBe(false);
  });

  it('rejects IPv6 loopback', () => {
    expect(Validator.validateApiUrl('http://[::1]:11434')).toBe(false);
  });

  it('rejects non-http protocol on localhost', () => {
    expect(Validator.validateApiUrl('ftp://localhost:11434')).toBe(false);
    expect(Validator.validateApiUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Validator.validateApiUrl('')).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(Validator.validateApiUrl('not a url')).toBe(false);
  });
});
