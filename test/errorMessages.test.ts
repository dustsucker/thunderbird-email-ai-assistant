import { describe, it, expect } from 'vitest';
import {
  mapAnalysisErrorToUserMessage,
  formatTagResultMessage,
} from '../src/shared/utils/errorMessages';

describe('mapAnalysisErrorToUserMessage', () => {
  it('maps 401 in a messy multi-layer error string to the API-Key message', () => {
    const msg = mapAnalysisErrorToUserMessage(
      'Failed to analyze email 4213: API request failed: 401 Unauthorized'
    );
    expect(msg).toContain('API-Key');
    expect(msg).toContain('Einstellungen');
    expect(msg).not.toContain('401');
    expect(msg).not.toContain('4213');
  });

  it('maps 403 Forbidden to the API-Key message', () => {
    expect(mapAnalysisErrorToUserMessage('request rejected: 403 Forbidden')).toContain('API-Key');
  });

  it('maps 429 / rate limit to the rate-limit message', () => {
    expect(mapAnalysisErrorToUserMessage('API request failed: 429 Too Many Requests')).toContain(
      'Rate-Limit'
    );
    expect(mapAnalysisErrorToUserMessage('rate limit exceeded')).toContain('Rate-Limit');
  });

  it('maps timeout errors to the timeout message', () => {
    expect(mapAnalysisErrorToUserMessage('Request timeout after 30000ms')).toContain(
      'Zeitüberschreitung'
    );
    expect(mapAnalysisErrorToUserMessage('connection ETIMEDOUT')).toContain('Zeitüberschreitung');
  });

  it('maps invalid JSON / unexpected responses to the unexpected-answer message', () => {
    expect(mapAnalysisErrorToUserMessage('Unexpected token < in JSON at position 0')).toContain(
      'unerwartete Antwort'
    );
    expect(mapAnalysisErrorToUserMessage('invalid JSON in provider response')).toContain(
      'unerwartete Antwort'
    );
  });

  it('maps network failures to the connection message', () => {
    expect(mapAnalysisErrorToUserMessage('TypeError: Failed to fetch')).toContain(
      'Verbindung fehlgeschlagen'
    );
    expect(mapAnalysisErrorToUserMessage('getaddrinfo ENOTFOUND api.example.com')).toContain(
      'Verbindung fehlgeschlagen'
    );
  });

  it('falls back to the generic message for unknown errors', () => {
    expect(mapAnalysisErrorToUserMessage('something entirely unexpected happened')).toContain(
      'Fehler aufgetreten'
    );
  });

  it('never leaks message ids embedded in the raw string', () => {
    const msg = mapAnalysisErrorToUserMessage('Failed to analyze email 403: boom');
    expect(msg).not.toContain('403');
    expect(msg).toContain('API-Key');
  });
});

describe('formatTagResultMessage', () => {
  it('shows a single tag with confidence percentage', () => {
    expect(formatTagResultMessage(['rechnung'], 0.85)).toBe(
      'Tag „rechnung" vergeben (Konfidenz: 85 %).'
    );
  });

  it('shows up to two tags plus remaining count', () => {
    expect(formatTagResultMessage(['a', 'b', 'c', 'd'], 0.5)).toBe(
      'Tags „a", „b" vergeben (+2 weitere, Konfidenz: 50 %).'
    );
  });

  it('omits confidence when not available', () => {
    expect(formatTagResultMessage(['a', 'b'])).toBe('Tags „a", „b" vergeben.');
  });

  it('reports when no tag was confident enough', () => {
    expect(formatTagResultMessage([])).toBe('Keine Kategorie sicher genug – nichts geändert.');
  });
});
