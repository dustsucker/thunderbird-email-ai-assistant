# Confidence Badge Component

A reusable UI component for displaying AI confidence scores with color-coded visual indicators.

## Features

- **Multiple Display Modes**: Compact, detailed, and minimal variants
- **Color Coding**: Automatic color based on confidence level
  - Green (High): >= 80%
  - Yellow/Amber (Medium): 70-79%
  - Red (Low): < 70%
- **Accessibility**: Full ARIA attributes for screen readers
- **Responsive**: Adapts to different screen sizes
- **Customizable**: Size variants, outline style, and subtle mode

## Installation

The component is already integrated into the project. Import it in your TypeScript files:

```typescript
import {
  ConfidenceBadge,
  createConfidenceBadge,
  createConfidenceBadges
} from '@/interfaces/shared/components';
```

## Usage

### Basic Usage

```typescript
import { ConfidenceBadge } from '@/interfaces/shared/components';

const badge = new ConfidenceBadge();

// Create a compact badge (default)
const element = badge.createCompact(0.85);
document.body.appendChild(element);
```

### Convenience Functions

```typescript
import { createConfidenceBadge } from '@/interfaces/shared/components';

// Create badge with default settings
const badge = createConfidenceBadge(0.85, 'compact');
document.body.appendChild(badge);
```

### Display Modes

#### Compact Mode (Default)
Shows just the percentage:
```typescript
const badge = new ConfidenceBadge();
const element = badge.createCompact(0.75);
// Output: <span class="confidence-badge confidence-medium">75%</span>
```

#### Detailed Mode
Shows percentage with text label:
```typescript
const element = badge.createDetailed(0.85);
// Output: <span class="confidence-badge confidence-high detailed">85% High</span>
```

#### Minimal Mode
Shows just a colored dot:
```typescript
const element = badge.createMinimal(0.65);
// Output: <span class="confidence-badge confidence-low minimal"></span>
```

### Advanced Options

```typescript
const element = badge.create({
  confidence: 0.92,
  mode: 'detailed',
  cssClass: 'large',
  threshold: 80,
  showPercentage: true,
  tooltip: 'AI confidence score'
});
```

### Updating Existing Badges

```typescript
const element = badge.createCompact(0.75);
document.body.appendChild(element);

// Later, update the badge
badge.update(element, 0.90);
```

### Integration with Tags

```typescript
// In your tag rendering logic
function renderTagWithConfidence(tag: Tag, confidence: number) {
  const container = document.createElement('div');
  container.className = 'tag-item';

  const tagName = document.createElement('span');
  tagName.className = 'tag-name';
  tagName.textContent = tag.name;

  const confidenceBadge = createConfidenceBadge(confidence, 'compact');

  container.appendChild(tagName);
  container.appendChild(confidenceBadge);

  return container;
}
```

## CSS Classes

The component includes the following CSS classes for customization:

- `.confidence-badge` - Base class
- `.confidence-high` - High confidence (green)
- `.confidence-medium` - Medium confidence (yellow)
- `.confidence-low` - Low confidence (red)
- `.compact` - Compact display mode
- `.detailed` - Detailed display mode
- `.minimal` - Minimal display mode
- `.small` - Small size variant
- `.large` - Large size variant
- `.outline` - Outline style (no background)
- `.subtle` - Subtle variant (lighter backgrounds)

## Styling

Include the CSS file in your HTML:

```html
<link rel="stylesheet" href="src/interfaces/shared/styles/confidence.css">
```

Or import it in your TypeScript/SCSS:

```typescript
import '@/interfaces/shared/styles/confidence.css';
```

### Custom CSS Variables

You can customize the appearance using CSS variables:

```css
:root {
  --confidence-badge-padding-compact: 4px 8px;
  --confidence-badge-font-size: 12px;
  --confidence-badge-radius: 12px;
  /* ... more variables ... */
}
```

## Accessibility

The component includes built-in accessibility features:

- `role="status"` - Indicates the badge is a status indicator
- `aria-live="polite"` - Announces changes to screen readers
- `aria-label` - Provides text description (e.g., "Confidence: 85%")
- Keyboard navigation support
- High contrast mode support
- Reduced motion support

## Demo

Open `ConfidenceBadge.demo.html` in a browser to see all display options and integration examples.

## API Reference

### ConfidenceBadge Class

#### Methods

- `create(options: ConfidenceBadgeOptions): HTMLSpanElement`
  - Creates a badge with custom options

- `createCompact(confidence: number, cssClass?: string): HTMLSpanElement`
  - Creates a compact badge

- `createDetailed(confidence: number, cssClass?: string): HTMLSpanElement`
  - Creates a detailed badge

- `createMinimal(confidence: number, cssClass?: string): HTMLSpanElement`
  - Creates a minimal badge

- `update(element: HTMLSpanElement, confidence: number, mode?: DisplayMode): void`
  - Updates an existing badge

### Types

```typescript
type ConfidenceBadgeDisplayMode = 'compact' | 'detailed' | 'minimal';

interface ConfidenceBadgeOptions {
  confidence: number;        // 0-1 range
  mode?: ConfidenceBadgeDisplayMode;
  cssClass?: string;
  threshold?: number;
  showPercentage?: boolean;
  tooltip?: string;
}
```

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support

## License

Part of the Thunderbird Email AI Assistant project.
