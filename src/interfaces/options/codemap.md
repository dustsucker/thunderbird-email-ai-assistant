# src/interfaces/options/

## Responsibility
Options-page components beyond the settings form itself.

## Files
- `DebugTab.ts` - Debug panel of the options page: queue overview and log viewer
  backed by `DebugLogBuffer` (`src/infrastructure/logger/`).

## Notes
- The settings form lives in the root `options.html`/`options.ts`/`options.css`;
  this directory holds only shipped options-page components.
- Tested in `test/interfaces/options/` (debug tab, debug-logging settings,
  form validation, markup a11y).
