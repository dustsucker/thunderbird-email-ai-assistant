/**
 * User-facing message helpers for analysis notifications.
 *
 * Maps raw provider/analysis error strings to German messages with
 * actionable guidance. Raw error strings must only ever reach the logger,
 * never the notification text.
 *
 * @module shared/utils/errorMessages
 */

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Maps a raw analysis error string to a German user-facing message.
 *
 * Detection order: HTTP status codes first, then timeout, unexpected
 * response, network failures, and finally a generic fallback.
 *
 * @param rawError - Raw error message (may be messy, multi-layered)
 * @returns German message with action guidance (never contains raw internals)
 */
export function mapAnalysisErrorToUserMessage(rawError: string): string {
  const error = rawError.toLowerCase();

  // Status codes before keywords, so "401 Unauthorized" wins over other hints
  if (/(?<!\d)(401|403)(?!\d)/.test(error) || /unauthorized|forbidden/.test(error)) {
    return 'Der API-Key ist ungültig oder abgelaufen. Bitte überprüfen Sie Ihre Einstellungen.';
  }
  if (/(?<!\d)429(?!\d)/.test(error) || /rate.?limit|too many requests/.test(error)) {
    return 'Das Rate-Limit des Anbieters ist erreicht. Bitte warten Sie kurz oder wechseln Sie das Modell.';
  }
  if (/timeout|timed.?out|etimedout|econnaborted/.test(error)) {
    return 'Zeitüberschreitung bei der Anfrage. Bitte prüfen Sie Ihre Verbindung oder wählen Sie ein anderes Modell.';
  }
  if (/json|unexpected response|failed to parse|unexpected (token|end)/.test(error)) {
    return 'Der Anbieter hat eine unerwartete Antwort geliefert. Bitte prüfen Sie Modell und Provider-Einstellungen.';
  }
  if (
    /network|enotfound|econnrefused|econnreset|failed to fetch|getaddrinfo|dns|socket/.test(error)
  ) {
    return 'Verbindung fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und die API-URL.';
  }
  return 'Bei der Analyse ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder prüfen Sie die Einstellungen.';
}

/**
 * Formats a successful analysis result as a German user-facing message.
 *
 * @param tags - Awarded tag keys (empty means nothing was awarded)
 * @param confidence - Overall confidence score (0.0 to 1.0), shown if available
 * @returns e.g. `Tag „Rechnung" vergeben (Konfidenz: 85 %).` or
 *          `Keine Kategorie sicher genug – nichts geändert.`
 */
export function formatTagResultMessage(tags: string[], confidence?: number): string {
  if (tags.length === 0) {
    return 'Keine Kategorie sicher genug – nichts geändert.';
  }

  const label = tags.length === 1 ? 'Tag' : 'Tags';
  const names = tags
    .slice(0, 2)
    .map((tag) => `„${tag}"`)
    .join(', ');

  const details: string[] = [];
  if (tags.length > 2) {
    details.push(`+${tags.length - 2} weitere`);
  }
  if (typeof confidence === 'number' && confidence > 0) {
    details.push(`Konfidenz: ${Math.round(confidence * 100)} %`);
  }

  return `${label} ${names} vergeben${details.length > 0 ? ` (${details.join(', ')})` : ''}.`;
}
