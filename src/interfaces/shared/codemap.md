# src/interfaces/shared/

## Responsibility
Shared UI helpers and components for options-page rendering.

## Layout
- `ProviderSettingsService.ts` - Plain (non-DI) helper resolving the active provider
  settings and listing models; avoids duplicating settings resolution between the
  options page and background handlers.
- `components/` - Reusable UI components (ConfidenceBadge, LowConfidenceIndicator).
- `styles/` - `confidence.css`, `indicators.css`.

## Integration
- Used by the root options page and background handlers; components tested in
  `test/interfaces/components/`.
