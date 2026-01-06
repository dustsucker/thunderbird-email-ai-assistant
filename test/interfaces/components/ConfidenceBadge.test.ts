/**
 * ConfidenceBadge Component Tests
 *
 * Tests the confidence badge UI component including:
 * - Badge rendering with correct percentages
 * - Color coding based on confidence level
 * - Display modes (compact, detailed, minimal)
 * - Accessibility attributes
 * - Error handling
 * - Update functionality
 *
 * @module test/interfaces/components/ConfidenceBadge
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceBadge, createConfidenceBadge, createConfidenceBadges } from '@/interfaces/shared/components/ConfidenceBadge';
import { ConfidenceLevel } from '@/shared/utils/confidenceUtils';

// ============================================================================
// Test Setup
// ============================================================================

describe('ConfidenceBadge Component', () => {
  let badgeComponent: ConfidenceBadge;

  beforeEach(() => {
    badgeComponent = new ConfidenceBadge();
  });

  // ==========================================================================
  // Badge Rendering Tests
  // ==========================================================================

  describe('Badge Rendering', () => {
    it('should render compact badge with correct percentage', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.innerHTML).toBe('75%');
      expect(element.className).toContain('confidence-badge');
      expect(element.className).toContain('compact');
    });

    it('should render detailed badge with percentage and label', () => {
      const element = badgeComponent.createDetailed(0.85);
      expect(element.innerHTML).toBe('85% High');
      expect(element.className).toContain('detailed');
    });

    it('should render minimal badge with no text', () => {
      const element = badgeComponent.createMinimal(0.65);
      expect(element.innerHTML).toBe('');
      expect(element.className).toContain('minimal');
    });

    it('should round confidence percentage correctly', () => {
      const badge1 = badgeComponent.createCompact(0.756);
      expect(badge1.innerHTML).toBe('76%');

      const badge2 = badgeComponent.createCompact(0.999);
      expect(badge2.innerHTML).toBe('100%');

      const badge3 = badgeComponent.createCompact(0.001);
      expect(badge3.innerHTML).toBe('0%');
    });

    it('should handle edge cases (0 and 1)', () => {
      const badge0 = badgeComponent.createCompact(0);
      expect(badge0.innerHTML).toBe('0%');

      const badge1 = badgeComponent.createCompact(1);
      expect(badge1.innerHTML).toBe('100%');
    });
  });

  // ==========================================================================
  // Color Coding Tests
  // ==========================================================================

  describe('Color Coding', () => {
    it('should apply high confidence color (green) for >= 80%', () => {
      const badge80 = badgeComponent.createCompact(0.80);
      expect(badge80.className).toContain('confidence-high');
      expect(badge80.style.backgroundColor).toBe('#4CAF50');

      const badge85 = badgeComponent.createCompact(0.85);
      expect(badge85.className).toContain('confidence-high');

      const badge100 = badgeComponent.createCompact(1.0);
      expect(badge100.className).toContain('confidence-high');
    });

    it('should apply medium confidence color (yellow) for 70-79%', () => {
      const badge70 = badgeComponent.createCompact(0.70);
      expect(badge70.className).toContain('confidence-medium');
      expect(badge70.style.backgroundColor).toBe('#FFC107');

      const badge75 = badgeComponent.createCompact(0.75);
      expect(badge75.className).toContain('confidence-medium');

      const badge79 = badgeComponent.createCompact(0.79);
      expect(badge79.className).toContain('confidence-medium');
    });

    it('should apply low confidence color (red) for < 70%', () => {
      const badge69 = badgeComponent.createCompact(0.69);
      expect(badge69.className).toContain('confidence-low');
      expect(badge69.style.backgroundColor).toBe('#F44336');

      const badge50 = badgeComponent.createCompact(0.50);
      expect(badge50.className).toContain('confidence-low');

      const badge0 = badgeComponent.createCompact(0);
      expect(badge0.className).toContain('confidence-low');
    });

    it('should handle boundary values correctly', () => {
      // Test boundaries: 0.699 (69%) should be low, 0.700 (70%) should be medium
      const badge69 = badgeComponent.createCompact(0.699);
      expect(badge69.className).toContain('confidence-low');

      const badge70 = badgeComponent.createCompact(0.700);
      expect(badge70.className).toContain('confidence-medium');

      // Test boundaries: 0.799 (79%) should be medium, 0.800 (80%) should be high
      const badge79 = badgeComponent.createCompact(0.799);
      expect(badge79.className).toContain('confidence-medium');

      const badge80 = badgeComponent.createCompact(0.800);
      expect(badge80.className).toContain('confidence-high');
    });
  });

  // ==========================================================================
  // Display Mode Tests
  // ==========================================================================

  describe('Display Modes', () => {
    it('should create compact mode with percentage only', () => {
      const element = badgeComponent.create({ confidence: 0.75, mode: 'compact' });
      expect(element.className).toContain('compact');
      expect(element.innerHTML).toBe('75%');
    });

    it('should create detailed mode with percentage and label', () => {
      const element = badgeComponent.create({ confidence: 0.85, mode: 'detailed' });
      expect(element.className).toContain('detailed');
      expect(element.innerHTML).toBe('85% High');
    });

    it('should create minimal mode with no content', () => {
      const element = badgeComponent.create({ confidence: 0.65, mode: 'minimal' });
      expect(element.className).toContain('minimal');
      expect(element.innerHTML).toBe('');
    });

    it('should default to compact mode when not specified', () => {
      const element = badgeComponent.create({ confidence: 0.75 });
      expect(element.className).toContain('compact');
      expect(element.innerHTML).toBe('75%');
    });

    it('should respect showPercentage option', () => {
      const withPercent = badgeComponent.create({
        confidence: 0.75,
        mode: 'compact',
        showPercentage: true,
      });
      expect(withPercent.innerHTML).toBe('75%');

      const withoutPercent = badgeComponent.create({
        confidence: 0.75,
        mode: 'compact',
        showPercentage: false,
      });
      expect(withoutPercent.innerHTML).toBe('75');
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  describe('Accessibility', () => {
    it('should have role="status" attribute', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.getAttribute('role')).toBe('status');
    });

    it('should have aria-live="polite" attribute', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.getAttribute('aria-live')).toBe('polite');
    });

    it('should have descriptive aria-label', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.getAttribute('aria-label')).toBe('Confidence: 75%');
    });

    it('should include threshold in aria-describedby when provided', () => {
      const element = badgeComponent.create({
        confidence: 0.75,
        threshold: 70,
      });
      const ariaDescribedBy = element.getAttribute('aria-describedby');
      expect(ariaDescribedBy).toBeTruthy();
      expect(ariaDescribedBy).toContain('Threshold: 70%');
      expect(ariaDescribedBy).toContain('meets threshold');
    });

    it('should indicate below threshold in aria-describedby', () => {
      const element = badgeComponent.create({
        confidence: 0.65,
        threshold: 70,
      });
      const ariaDescribedBy = element.getAttribute('aria-describedby');
      expect(ariaDescribedBy).toContain('below threshold');
    });

    it('should not have aria-describedby when threshold not provided', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.getAttribute('aria-describedby')).toBeNull();
    });
  });

  // ==========================================================================
  // Custom Options Tests
  // ==========================================================================

  describe('Custom Options', () => {
    it('should apply custom CSS class', () => {
      const element = badgeComponent.create({
        confidence: 0.75,
        cssClass: 'custom-class another-class',
      });
      expect(element.className).toContain('custom-class');
      expect(element.className).toContain('another-class');
    });

    it('should add tooltip when provided', () => {
      const tooltipText = 'AI confidence score';
      const element = badgeComponent.create({
        confidence: 0.75,
        tooltip: tooltipText,
      });
      expect(element.getAttribute('title')).toBe(tooltipText);
    });

    it('should include threshold in options', () => {
      const element = badgeComponent.create({
        confidence: 0.75,
        threshold: 70,
      });
      expect(element.getAttribute('aria-describedby')).toContain('70%');
    });
  });

  // ==========================================================================
  // Update Functionality Tests
  // ==========================================================================

  describe('Update Functionality', () => {
    it('should update existing badge with new confidence', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.innerHTML).toBe('75%');
      expect(element.className).toContain('confidence-medium');

      badgeComponent.update(element, 0.85);

      expect(element.innerHTML).toBe('85%');
      expect(element.className).toContain('confidence-high');
      expect(element.getAttribute('aria-label')).toBe('Confidence: 85%');
    });

    it('should preserve display mode when updating without mode specified', () => {
      const element = badgeComponent.createDetailed(0.75);
      expect(element.innerHTML).toBe('75% Medium');

      badgeComponent.update(element, 0.85);

      expect(element.innerHTML).toBe('85% High');
      expect(element.className).toContain('detailed');
    });

    it('should allow changing display mode when updating', () => {
      const element = badgeComponent.createCompact(0.75);
      expect(element.innerHTML).toBe('75%');

      badgeComponent.update(element, 0.85, 'detailed');

      expect(element.innerHTML).toBe('85% High');
      expect(element.className).toContain('detailed');
      expect(element.className).not.toContain('compact');
    });

    it('should infer mode from element if not provided', () => {
      const element = badgeComponent.createMinimal(0.75);
      expect(element.className).toContain('minimal');

      badgeComponent.update(element, 0.85);

      expect(element.className).toContain('minimal');
    });

    it('should preserve custom CSS classes when updating', () => {
      const element = badgeComponent.create({
        confidence: 0.75,
        cssClass: 'custom-class',
      });
      expect(element.className).toContain('custom-class');

      badgeComponent.update(element, 0.85);

      expect(element.className).toContain('custom-class');
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should throw error for confidence > 1', () => {
      expect(() => {
        badgeComponent.createCompact(1.5);
      }).toThrow('Confidence must be between 0 and 1');
    });

    it('should throw error for confidence < 0', () => {
      expect(() => {
        badgeComponent.createCompact(-0.1);
      }).toThrow('Confidence must be between 0 and 1');
    });

    it('should throw error for NaN confidence', () => {
      expect(() => {
        badgeComponent.createCompact(NaN);
      }).toThrow();
    });

    it('should throw error for negative confidence', () => {
      expect(() => {
        badgeComponent.createCompact(-1);
      }).toThrow('Confidence must be between 0 and 1');
    });
  });

  // ==========================================================================
  // Convenience Functions Tests
  // ==========================================================================

  describe('Convenience Functions', () => {
    it('should create badge with createConfidenceBadge function', () => {
      const element = createConfidenceBadge(0.85, 'compact');
      expect(element.innerHTML).toBe('85%');
      expect(element.className).toContain('confidence-badge');
    });

    it('should default to compact mode in convenience function', () => {
      const element = createConfidenceBadge(0.85);
      expect(element.className).toContain('compact');
    });

    it('should create multiple badges with createConfidenceBadges', () => {
      const badges = createConfidenceBadges([0.85, 0.75, 0.65], 'compact');
      expect(badges).toHaveLength(3);
      expect(badges[0].innerHTML).toBe('85%');
      expect(badges[1].innerHTML).toBe('75%');
      expect(badges[2].innerHTML).toBe('65%');
    });

    it('should handle empty array in createConfidenceBadges', () => {
      const badges = createConfidenceBadges([]);
      expect(badges).toHaveLength(0);
    });

    it('should create badges with same mode in createConfidenceBadges', () => {
      const badges = createConfidenceBadges([0.85, 0.75, 0.65], 'detailed');
      badges.forEach((badge) => {
        expect(badge.className).toContain('detailed');
      });
    });
  });

  // ==========================================================================
  // Label Tests
  // ==========================================================================

  describe('Confidence Labels', () => {
    it('should show correct label for high confidence', () => {
      const element = badgeComponent.createDetailed(0.85);
      expect(element.innerHTML).toContain('High');
    });

    it('should show correct label for medium confidence', () => {
      const element = badgeComponent.createDetailed(0.75);
      expect(element.innerHTML).toContain('Medium');
    });

    it('should show correct label for low confidence', () => {
      const element = badgeComponent.createDetailed(0.65);
      expect(element.innerHTML).toContain('Low');
    });

    it('should capitalize first letter of label', () => {
      const element = badgeComponent.createDetailed(0.75);
      expect(element.innerHTML).toMatch(/^[0-9]+% [A-Z]/);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should work in DOM environment', () => {
      const container = document.createElement('div');
      const element = badgeComponent.createCompact(0.85);
      container.appendChild(element);

      expect(container.children.length).toBe(1);
      expect(container.children[0].innerHTML).toBe('85%');
    });

    it('should handle multiple badges in same container', () => {
      const container = document.createElement('div');
      const badges = createConfidenceBadges([0.85, 0.75, 0.65]);
      badges.forEach((badge) => container.appendChild(badge));

      expect(container.children.length).toBe(3);
      expect(container.children[0].innerHTML).toBe('85%');
      expect(container.children[1].innerHTML).toBe('75%');
      expect(container.children[2].innerHTML).toBe('65%');
    });

    it('should update badges while attached to DOM', () => {
      const container = document.createElement('div');
      const element = badgeComponent.createCompact(0.75);
      container.appendChild(element);

      expect(container.children[0].innerHTML).toBe('75%');

      badgeComponent.update(element, 0.85);

      expect(container.children[0].innerHTML).toBe('85%');
    });
  });
});
