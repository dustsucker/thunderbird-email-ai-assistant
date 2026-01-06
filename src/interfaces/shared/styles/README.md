# Low-Confidence Indicators

Visual indicators for displaying low-confidence AI classifications in Thunderbird's email list and view.

## Overview

This module provides CSS styles and TypeScript components for showing visual cues when emails have been flagged due to low-confidence AI classifications. The indicators help users understand which emails require manual review and which were auto-tagged with high confidence.

## Features

- **Icon Indicators**: Compact warning icons for email lists
- **Badge Indicators**: Detailed badges with confidence percentages
- **Notification Banners**: Temporary alerts for new low-confidence emails
- **Email Border Styling**: Visual borders and backgrounds for flagged emails
- **Configurable Visibility**: Control which indicators are shown
- **Accessibility**: Full ARIA support, keyboard navigation, high-contrast mode
- **Responsive Design**: Adapts to different screen sizes
- **Dark Mode Support**: Automatic color scheme adaptation

## Files

- `indicators.css` - Complete CSS styling system
- `LowConfidenceIndicator.ts` - TypeScript component for programmatic usage
- `indicators-demo.html` - Interactive demo and usage examples

## Quick Start

### Using CSS Classes

```html
<!-- Icon indicator -->
<span class="low-confidence-indicator indicator-icon confidence-very-low">
  <svg viewBox="0 0 24 24">
    <path d="M12 2L1 21h22L12 2z"/>
  </svg>
</span>

<!-- Badge indicator -->
<span class="low-confidence-indicator confidence-low">
  <span class="badge-text">Low</span>
  <span class="badge-score">65%</span>
</span>

<!-- Flagged email -->
<div class="email-item email-flagged" data-flagged="true">
  Email content...
</div>
```

### Using TypeScript Component

```typescript
import {
  LowConfidenceIndicator,
  createLowConfidenceIndicator
} from '@/interfaces/shared/components';

// Create indicator with default settings
const indicator = createLowConfidenceIndicator(0.65, 'icon');
document.body.appendChild(indicator);

// Create with full control
const component = new LowConfidenceIndicator();
const badge = component.create({
  confidence: 0.55,
  type: 'badge',
  placement: 'list',
  tooltip: 'Low confidence - requires review',
  animate: true,
  isFlagged: true
});
document.body.appendChild(badge);

// Mark email as flagged
const emailRow = document.querySelector('.email-row');
component.markEmailAsFlagged(emailRow, true);

// Show notification
const banner = component.createNotificationBanner({
  count: 3,
  message: '3 emails require review',
  actionText: 'Review Now',
  onAction: () => console.log('Review clicked'),
  autoDismiss: 5000
});
document.body.appendChild(banner);
```

## Confidence Levels

| Level | Range | Color | CSS Class |
|-------|-------|-------|-----------|
| Very Low | 0-49% | Red | `confidence-very-low` |
| Low | 50-69% | Orange | `confidence-low` |
| Medium | 70-79% | Yellow | `confidence-medium` |
| High | 80-100% | Green | (not flagged) |

## CSS Classes Reference

### Base Classes

- `.low-confidence-indicator` - Base class for all indicators
- `.indicator-icon` - Icon-only indicator
- `.indicator-badge` - Badge with text and percentage
- `.email-flagged` - Email requiring manual review
- `.email-auto-tagged` - Email processed automatically

### Confidence Level Classes

- `.confidence-very-low` - Very low confidence (0-49%)
- `.confidence-low` - Low confidence (50-69%)
- `.confidence-medium` - Medium confidence (70-79%)

### Placement Classes

- `.indicator-in-list` - For email list/thread pane
- `.indicator-in-view` - For email view/message display
- `.indicator-in-header` - For header areas

### Size Variants

- `.indicator-small` - Small variant (12px icons, tighter padding)
- `.indicator-large` - Large variant (20px icons, looser padding)

### Style Variants

- `.indicator-subtle` - Lighter, dashed border styling
- `.indicator-prominent` - Bolder styling with shadow

### Animation Classes

- `.pulse` - Pulsing animation
- `.fade-in` - Fade-in animation

### Visibility Control Classes

Applied to `<body>` to control global visibility:

- `.indicators-hidden` - Hide all indicators
- `.indicators-icons-only` - Show only icons
- `.indicators-badges-only` - Show only badges
- `.indicators-no-notifications` - Hide notification banners

## TypeScript API

### LowConfidenceIndicator Class

#### Constructor

```typescript
const indicator = new LowConfidenceIndicator();
```

#### Methods

##### create(options)

Creates a low-confidence indicator element.

```typescript
create(options: LowConfidenceIndicatorOptions): HTMLElement
```

**Options:**
- `confidence: number` - Confidence value (0-1 range)
- `type?: 'icon' | 'badge' | 'both'` - Indicator type (default: 'icon')
- `placement?: 'list' | 'view' | 'header'` - Placement location (default: 'list')
- `cssClass?: string` - Additional CSS classes
- `tooltip?: string` - Tooltip text
- `animate?: boolean` - Whether to animate (default: false)
- `isFlagged?: boolean` - Whether flagged for review (default: true)

**Returns:** HTMLElement

##### createIcon(confidence, placement, cssClass)

Creates an icon-only indicator.

```typescript
createIcon(
  confidence: number,
  placement?: IndicatorPlacement,
  cssClass?: string
): HTMLElement
```

##### createBadge(confidence, placement, cssClass)

Creates a badge indicator.

```typescript
createBadge(
  confidence: number,
  placement?: IndicatorPlacement,
  cssClass?: string
): HTMLElement
```

##### createNotificationBanner(options)

Creates a notification banner.

```typescript
createNotificationBanner(options: NotificationBannerOptions): HTMLElement
```

**Options:**
- `count: number` - Number of low-confidence emails
- `message?: string` - Custom message
- `actionText?: string` - Action button text (default: 'Review')
- `onAction?: () => void` - Action button callback
- `autoDismiss?: number` - Auto-dismiss timeout in ms (default: 0)

##### markEmailAsFlagged(element, isFlagged)

Marks an email element as flagged.

```typescript
markEmailAsFlagged(emailElement: HTMLElement, isFlagged: boolean): void
```

##### markEmailAsAutoTagged(element, isAutoTagged)

Marks an email element as auto-tagged.

```typescript
markEmailAsAutoTagged(emailElement: HTMLElement, isAutoTagged: boolean): void
```

##### setVisibilityConfig(config)

Updates visibility configuration.

```typescript
setVisibilityConfig(config: Partial<IndicatorVisibilityConfig>): void
```

**Config:**
- `showIndicators?: boolean` - Show any indicators
- `showIcons?: boolean` - Show icon indicators
- `showBadges?: boolean` - Show badge indicators
- `showNotifications?: boolean` - Show notification banners

##### getVisibilityConfig()

Gets current visibility configuration.

```typescript
getVisibilityConfig(): IndicatorVisibilityConfig
```

### Convenience Functions

```typescript
// Create indicator with defaults
createLowConfidenceIndicator(
  confidence: number,
  type?: IndicatorType
): HTMLElement

// Create notification banner
createNotificationBanner(count: number): HTMLElement
```

## Thunderbird Integration

### Thread Pane (Email List)

The styles include specific selectors for Thunderbird's DOM structure:

```css
/* Applied to rows with data attributes */
.trth-row[data-flagged="true"] { /* left border + bg */ }
.trth-row[data-auto-tagged="true"] { /* right border + bg */ }

/* Indicators in specific columns */
.trth-row .subject-column .low-confidence-indicator
.trth-row .correspondentcol-column .low-confidence-indicator
```

### Message Display

```css
.message-header-container .low-confidence-indicator
```

## Accessibility

- **ARIA Labels**: All indicators have descriptive aria-label
- **Role**: `role="img"` for icons, `role="alert"` for notifications
- **Keyboard**: `focus-visible` styles for keyboard navigation
- **High Contrast**: Enhanced borders in `prefers-contrast: high` mode
- **Reduced Motion**: Animations respect `prefers-reduced-motion: reduce`
- **Screen Readers**: Proper labels and live regions for notifications

## Responsive Design

The styles adapt to smaller screens automatically:

```css
@media (max-width: 768px) {
  /* Smaller icons and badges */
  /* Tighter spacing */
  /* Stacked notification actions */
}
```

## Dark Mode

Colors automatically adapt in dark mode:

```css
@media (prefers-color-scheme: dark) {
  /* Darker backgrounds */
  /* Lighter text colors */
  /* Adjusted borders */
}
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Thunderbird: Full support (WebExtension API)

## Examples

See `indicators-demo.html` for a complete interactive demo including:
- All indicator types and styles
- Simulated email list
- Visibility controls
- Notification banners
- Code examples

## License

MIT License - See project root for details
