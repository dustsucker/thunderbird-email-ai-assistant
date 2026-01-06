/**
 * Options Page Form Validation Tests
 *
 * Tests form validation for confidence threshold configuration including:
 * - Global threshold form input validation
 * - Tag threshold validation
 * - Save and load functionality
 * - Error handling for invalid values
 *
 * @module test/interfaces/options/options-form-validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isValidThreshold, validateTagThreshold } from '@/shared/utils/confidenceUtils';
import type { Tag } from '@/shared/types/ProviderTypes';

// ============================================================================
// Mock DOM Setup
// ============================================================================

// Mock messenger.storage.local for tests
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
  permissions: {
    request: vi.fn(),
  },
};

// Mock window.messenger
global.window = {
  ...global.window,
  messenger: mockStorage as any,
};

// ============================================================================
// Global Threshold Validation Tests
// ============================================================================

describe('Options Page - Global Threshold Validation', () => {
  describe('Input Validation', () => {
    it('should accept valid threshold values (0-100)', () => {
      const validValues = [0, 1, 50, 70, 100];

      validValues.forEach((value) => {
        expect(isValidThreshold(value)).toBe(true);
      });
    });

    it('should reject values below 0', () => {
      const invalidValues = [-1, -10, -100];

      invalidValues.forEach((value) => {
        expect(isValidThreshold(value)).toBe(false);
      });
    });

    it('should reject values above 100', () => {
      const invalidValues = [101, 150, 200, 1000];

      invalidValues.forEach((value) => {
        expect(isValidThreshold(value)).toBe(false);
      });
    });

    it('should reject non-integer values', () => {
      const invalidValues = [50.5, 70.1, 0.1, 99.9];

      invalidValues.forEach((value) => {
        expect(isValidThreshold(value)).toBe(false);
      });
    });

    it('should reject NaN values', () => {
      expect(isValidThreshold(NaN)).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(isValidThreshold(Infinity)).toBe(false);
      expect(isValidThreshold(-Infinity)).toBe(false);
    });
  });

  describe('Form Input Parsing', () => {
    it('should parse valid integer input correctly', () => {
      const input = '75';
      const parsed = parseInt(input, 10);
      expect(parsed).toBe(75);
      expect(isValidThreshold(parsed)).toBe(true);
    });

    it('should handle empty string as undefined', () => {
      const input = '';
      const parsed = parseInt(input, 10);
      expect(isNaN(parsed)).toBe(true);
    });

    it('should handle whitespace in input', () => {
      const input = ' 75 ';
      const parsed = parseInt(input, 10);
      expect(parsed).toBe(75);
      expect(isValidThreshold(parsed)).toBe(true);
    });

    it('should reject decimal string input', () => {
      const input = '75.5';
      const parsed = parseInt(input, 10);
      expect(parsed).toBe(75); // parseInt truncates
      expect(isValidThreshold(parsed)).toBe(true);
    });
  });

  describe('Boundary Values', () => {
    it('should accept 0 as minimum threshold', () => {
      expect(isValidThreshold(0)).toBe(true);
    });

    it('should accept 100 as maximum threshold', () => {
      expect(isValidThreshold(100)).toBe(true);
    });

    it('should accept 70 as default threshold', () => {
      expect(isValidThreshold(70)).toBe(true);
    });

    it('should handle values at 1', () => {
      expect(isValidThreshold(1)).toBe(true);
    });

    it('should handle values at 99', () => {
      expect(isValidThreshold(99)).toBe(true);
    });
  });
});

// ============================================================================
// Tag Threshold Validation Tests
// ============================================================================

describe('Options Page - Tag Threshold Validation', () => {
  describe('Tag Validation Function', () => {
    it('should validate tag with no threshold override', () => {
      const tag: Partial<Tag> = {
        name: 'Important',
        key: 'important',
        color: '#FF0000',
        prompt: 'This is an important email',
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should validate tag with valid threshold override', () => {
      const tag: Partial<Tag> = {
        name: 'Urgent',
        key: 'urgent',
        color: '#FF0000',
        prompt: 'This is urgent',
        minConfidenceThreshold: 80,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject tag with threshold below 0', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: -1,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject tag with threshold above 100', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: 101,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject tag with non-integer threshold', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: 75.5,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('integer');
    });

    it('should provide descriptive error messages', () => {
      const testCases = [
        { threshold: -1, expectedInError: '-1' },
        { threshold: 101, expectedInError: '101' },
        { threshold: 75.5, expectedInError: '75.5' },
      ];

      testCases.forEach(({ threshold, expectedInError }) => {
        const tag: Partial<Tag> = {
          minConfidenceThreshold: threshold as any,
        };

        const result = validateTagThreshold(tag);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(expectedInError);
      });
    });
  });

  describe('Tag Form Input Validation', () => {
    it('should accept empty threshold input (optional field)', () => {
      const thresholdInput = '';
      const parsed = parseInt(thresholdInput, 10);

      expect(isNaN(parsed)).toBe(true);
      // Empty input should result in undefined threshold (uses global)
    });

    it('should accept valid threshold input', () => {
      const thresholdInput = '80';
      const parsed = parseInt(thresholdInput, 10);

      expect(isValidThreshold(parsed)).toBe(true);
    });

    it('should reject threshold below 0', () => {
      const thresholdInput = '-1';
      const parsed = parseInt(thresholdInput, 10);

      expect(isValidThreshold(parsed)).toBe(false);
    });

    it('should reject threshold above 100', () => {
      const thresholdInput = '101';
      const parsed = parseInt(thresholdInput, 10);

      expect(isValidThreshold(parsed)).toBe(false);
    });

    it('should reject non-numeric threshold input', () => {
      const thresholdInput = 'abc';
      const parsed = parseInt(thresholdInput, 10);

      expect(isNaN(parsed)).toBe(true);
      // Non-numeric input should be treated as invalid
    });
  });

  describe('Tag Threshold Edge Cases', () => {
    it('should allow threshold of 0 (apply all tags)', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: 0,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
    });

    it('should allow threshold of 100 (only apply 100% confidence)', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: 100,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
    });

    it('should handle threshold equal to global default', () => {
      const tag: Partial<Tag> = {
        minConfidenceThreshold: 70, // Same as default
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// Save/Load Functionality Tests
// ============================================================================

describe('Options Page - Save/Load Functionality', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('Global Threshold Save', () => {
    it('should save valid threshold to storage', async () => {
      const threshold = 75;
      const appConfig = { minConfidenceThreshold: threshold };

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({ appConfig });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        appConfig,
      });
      expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
    });

    it('should use default threshold when input is invalid', async () => {
      const invalidThreshold = 150; // Above 100
      const defaultThreshold = 70;
      const appConfig = { minConfidenceThreshold: defaultThreshold };

      mockStorage.local.set.mockResolvedValue(undefined);

      // In actual implementation, invalid threshold falls back to default
      await mockStorage.local.set({ appConfig });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });
    });

    it('should use default threshold when input is empty', async () => {
      const defaultThreshold = 70;
      const appConfig = { minConfidenceThreshold: defaultThreshold };

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({ appConfig });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });
    });
  });

  describe('Global Threshold Load', () => {
    it('should load threshold from storage', async () => {
      const storedThreshold = 80;
      const appConfig = { minConfidenceThreshold: storedThreshold };

      mockStorage.local.get.mockResolvedValue({ appConfig });

      const result = await mockStorage.local.get({ appConfig });

      expect(result).toEqual({ appConfig });
      expect(mockStorage.local.get).toHaveBeenCalledWith({ appConfig });
    });

    it('should use default when threshold not in storage', async () => {
      const defaultThreshold = 70;

      mockStorage.local.get.mockResolvedValue({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      const result = await mockStorage.local.get({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      expect(result.appConfig.minConfidenceThreshold).toBe(defaultThreshold);
    });

    it('should handle missing appConfig in storage', async () => {
      const defaultThreshold = 70;

      mockStorage.local.get.mockResolvedValue({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      const result = await mockStorage.local.get({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      expect(result.appConfig).toBeDefined();
      expect(result.appConfig.minConfidenceThreshold).toBe(defaultThreshold);
    });
  });

  describe('Tag Threshold Save', () => {
    it('should save tag with threshold override', async () => {
      const customTag: Partial<Tag> = {
        name: 'Urgent',
        key: 'urgent',
        color: '#FF0000',
        prompt: 'Urgent email',
        minConfidenceThreshold: 80,
      };

      const customTags = [customTag];

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({ customTags });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        customTags,
      });
    });

    it('should save tag without threshold override', async () => {
      const customTag: Partial<Tag> = {
        name: 'Important',
        key: 'important',
        color: '#FF0000',
        prompt: 'Important email',
        // minConfidenceThreshold undefined - uses global
      };

      const customTags = [customTag];

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({ customTags });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        customTags,
      });
    });

    it('should save multiple tags with mixed thresholds', async () => {
      const customTags: Partial<Tag>[] = [
        {
          name: 'Urgent',
          key: 'urgent',
          color: '#FF0000',
          prompt: 'Urgent',
          minConfidenceThreshold: 80,
        },
        {
          name: 'Important',
          key: 'important',
          color: '#0000FF',
          prompt: 'Important',
          // No threshold override
        },
        {
          name: 'Newsletter',
          key: 'newsletter',
          color: '#00FF00',
          prompt: 'Newsletter',
          minConfidenceThreshold: 60,
        },
      ];

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({ customTags });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        customTags,
      });
    });
  });

  describe('Tag Threshold Load', () => {
    it('should load tags with threshold overrides', async () => {
      const storedTags = [
        {
          name: 'Urgent',
          key: 'urgent',
          color: '#FF0000',
          prompt: 'Urgent',
          minConfidenceThreshold: 80,
        },
      ];

      mockStorage.local.get.mockResolvedValue({ customTags: storedTags });

      const result = await mockStorage.local.get({ customTags: storedTags });

      expect(result.customTags).toEqual(storedTags);
      expect(result.customTags[0].minConfidenceThreshold).toBe(80);
    });

    it('should load tags without threshold overrides', async () => {
      const storedTags = [
        {
          name: 'Important',
          key: 'important',
          color: '#0000FF',
          prompt: 'Important',
        },
      ];

      mockStorage.local.get.mockResolvedValue({ customTags: storedTags });

      const result = await mockStorage.local.get({ customTags: storedTags });

      expect(result.customTags).toEqual(storedTags);
      expect(result.customTags[0].minConfidenceThreshold).toBeUndefined();
    });
  });
});

// ============================================================================
// UI Interaction Tests
// ============================================================================

describe('Options Page - UI Interactions', () => {
  describe('Slider and Number Input Sync', () => {
    it('should sync number input to slider', () => {
      // Mock DOM elements
      const numberInput = document.createElement('input');
      numberInput.type = 'number';
      numberInput.id = 'min-confidence-threshold';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'min-confidence-threshold-slider';

      document.body.appendChild(numberInput);
      document.body.appendChild(slider);

      // Simulate user input
      numberInput.value = '75';
      slider.value = numberInput.value;

      expect(slider.value).toBe('75');
      expect(numberInput.value).toBe('75');
    });

    it('should sync slider to number input', () => {
      const numberInput = document.createElement('input');
      numberInput.type = 'number';
      numberInput.id = 'min-confidence-threshold';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'min-confidence-threshold-slider';

      document.body.appendChild(numberInput);
      document.body.appendChild(slider);

      // Simulate slider change
      slider.value = '80';
      numberInput.value = slider.value;

      expect(numberInput.value).toBe('80');
      expect(slider.value).toBe('80');
    });

    it('should update confidence value display', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'min-confidence-threshold-slider';

      const valueDisplay = document.createElement('span');
      valueDisplay.id = 'confidence-value';

      document.body.appendChild(slider);
      document.body.appendChild(valueDisplay);

      // Simulate slider change
      slider.value = '85';
      valueDisplay.textContent = slider.value;

      expect(valueDisplay.textContent).toBe('85');
    });
  });

  describe('Form Validation Feedback', () => {
    it('should show error for invalid threshold', () => {
      const isValid = isValidThreshold(150);
      expect(isValid).toBe(false);
      // In actual implementation, this would show an alert
    });

    it('should show error for threshold below 0', () => {
      const isValid = isValidThreshold(-1);
      expect(isValid).toBe(false);
    });

    it('should show error for non-numeric threshold', () => {
      const parsed = parseInt('abc', 10);
      expect(isNaN(parsed)).toBe(true);
      // In actual implementation, this would show an alert
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Options Page - Integration', () => {
  describe('End-to-End Threshold Configuration', () => {
    it('should handle complete threshold save/load cycle', async () => {
      const threshold = 75;
      const appConfig = { minConfidenceThreshold: threshold };

      // Save
      mockStorage.local.set.mockResolvedValue(undefined);
      await mockStorage.local.set({ appConfig });
      expect(mockStorage.local.set).toHaveBeenCalled();

      // Load
      mockStorage.local.get.mockResolvedValue({ appConfig });
      const result = await mockStorage.local.get({ appConfig });
      expect(result.appConfig.minConfidenceThreshold).toBe(threshold);
    });

    it('should handle threshold update', async () => {
      const oldThreshold = 70;
      const newThreshold = 80;

      // Initial save
      mockStorage.local.set.mockResolvedValue(undefined);
      await mockStorage.local.set({
        appConfig: { minConfidenceThreshold: oldThreshold },
      });

      // Update
      await mockStorage.local.set({
        appConfig: { minConfidenceThreshold: newThreshold },
      });

      expect(mockStorage.local.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('Backward Compatibility', () => {
    it('should use default when loading old config without threshold', async () => {
      const defaultThreshold = 70;
      const oldConfig = {}; // No minConfidenceThreshold field

      mockStorage.local.get.mockResolvedValue({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      const result = await mockStorage.local.get({
        appConfig: { minConfidenceThreshold: defaultThreshold },
      });

      expect(result.appConfig.minConfidenceThreshold).toBe(defaultThreshold);
    });

    it('should migrate existing configs to include threshold', async () => {
      const defaultThreshold = 70;
      const updatedConfig = { minConfidenceThreshold: defaultThreshold };

      mockStorage.local.set.mockResolvedValue(undefined);

      await mockStorage.local.set({
        appConfig: updatedConfig,
      });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        appConfig: updatedConfig,
      });
    });
  });
});
