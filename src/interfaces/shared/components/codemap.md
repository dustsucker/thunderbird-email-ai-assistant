# src/interfaces/shared/components/

## Responsibility
Reusable, framework-free DOM components for confidence visualization: score badges and low-confidence flags/banners, styled by `../styles/confidence.css` and `indicators.css`.

## Design
- **Builder pattern**: `ConfidenceBadge.create(options)` assembles an `HTMLSpanElement` from `ConfidenceBadgeOptions` (`mode: 'compact'|'detailed'|'minimal'`, threshold, tooltip); convenience factories `createConfidenceBadge()` / `createConfidenceBadges()` wrap it.
- **Strategy via config**: `LowConfidenceIndicator` switches on `IndicatorType` (`icon`/`badge`/`both`) and `IndicatorPlacement` (`list`/`view`/`header`), with `IndicatorVisibilityConfig` toggling what gets rendered; `createNotificationBanner()` builds a dismissible `role="alert"` banner.
- Accessibility: ARIA attributes (`role="status"`, `aria-live`, `aria-label`), inline SVG icons, level classes `confidence-high/medium/low/very-low`.
- Barrel `index.ts` re-exports both classes, factories, and option types.

## Flow
1. Caller passes a confidence in 0–1 (validated, `RangeError` thrown otherwise).
2. `confidenceToPercentage()` / `getConfidenceLevel()` / `getConfidenceColor()` from `@/shared/utils/confidenceUtils` derive percentage, level, and color; `getDetailedConfidenceLevel()` splits `<50% / <70% / else` into `very-low|low|medium`.
3. `ConfidenceBadge.update()` re-renders an existing element in place (mode inferred from CSS classes).
4. `LowConfidenceIndicator.markEmailAsFlagged()` / `markEmailAsAutoTagged()` toggle `email-flagged` / `email-auto-tagged` classes and `data-*` attributes on email rows; `dismissNotification()` animates then removes banners.

## Integration
- Consumed by: options-page UI and future message-list overlays via `./index.ts`.
- Depends on: `@/shared/utils/confidenceUtils`; styles from `src/interfaces/shared/styles/`; demo pages `ConfidenceBadge.demo.html` and `styles/indicators-demo.html`.
