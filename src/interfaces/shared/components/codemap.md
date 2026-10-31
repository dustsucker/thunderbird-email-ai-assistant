# src/interfaces/shared/components/

## Responsibility
Reusable UI components for confidence visualization.

## Files
- `ConfidenceBadge.ts` - Confidence score badge with color coding.
- `LowConfidenceIndicator.ts` - Indicator for low-confidence classifications.
- `index.ts` - Barrel export.

## Integration
- Rendered by the options page (analysis results view); styles in
  `../styles/confidence.css` and `../styles/indicators.css`.
- Tested in `test/interfaces/components/ConfidenceBadge.test.ts` and
  `test/email-low-confidence.test.ts`.
