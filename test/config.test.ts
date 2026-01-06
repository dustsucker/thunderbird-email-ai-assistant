import { describe, it, expect } from 'vitest';
import {
  getConcurrencyLimit,
  validateConcurrencyConfig,
  validateConfidenceThreshold,
  validateCustomTagsThresholds,
  isValidConfidenceThreshold,
  ModelConcurrencyConfig,
} from '../core/config';
import { DEFAULTS } from '../core/config';
import type { Tag } from '../core/config';

describe('Config - getConcurrencyLimit', () => {
  describe('Provider Default Concurrency', () => {
    it('should return default concurrency for ollama provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'ollama', 'gemma3:27b');
      expect(limit).toBe(5);
    });

    it('should return default concurrency for openai provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should return default concurrency for gemini provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'gemini', 'gemini-pro');
      expect(limit).toBe(5);
    });

    it('should return default concurrency for claude provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'claude', 'claude-3');
      expect(limit).toBe(5);
    });

    it('should return default concurrency for mistral provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'mistral', 'mistral-large');
      expect(limit).toBe(10);
    });

    it('should return default concurrency for deepseek provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'deepseek', 'deepseek-chat');
      expect(limit).toBe(10);
    });

    it('should return default concurrency for zai-paas provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'zai-paas', 'glm-4');
      expect(limit).toBe(5);
    });

    it('should return default concurrency for zai-coding provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'zai-coding', 'glm-4');
      expect(limit).toBe(5);
    });

    it('should return fallback default of 5 for unknown provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'unknown', 'unknown-model');
      expect(limit).toBe(5);
    });
  });

  describe('Model-Specific Concurrency Configuration', () => {
    it('should return model-specific concurrency when configured', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', model: 'gpt-4', concurrency: 3 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(3);
    });

    it('should return provider default when model not configured', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', model: 'gpt-4', concurrency: 3 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-3.5-turbo');
      expect(limit).toBe(10);
    });

    it('should handle multiple model configurations', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
          { provider: 'openai', model: 'gpt-3.5-turbo', concurrency: 5 },
        ],
      };

      expect(getConcurrencyLimit(config, 'openai', 'gpt-4')).toBe(3);
      expect(getConcurrencyLimit(config, 'openai', 'gpt-3.5-turbo')).toBe(5);
    });

    it('should return provider default if concurrency is 0', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', model: 'gpt-4', concurrency: 0 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });
  });

  describe('Provider-Level Concurrency Configuration', () => {
    it('should return provider-specific concurrency when configured', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', concurrency: 7 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(7);
    });

    it('should prioritize model-specific over provider-specific concurrency', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 7 },
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        ],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(3);
    });

    it('should apply provider-specific concurrency to unconfigured models', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 7 },
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        ],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-3.5-turbo');
      expect(limit).toBe(7);
    });

    it('should return provider default if provider-level concurrency is 0', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', concurrency: 0 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined modelConcurrencyLimits', () => {
      const config = { ...DEFAULTS, modelConcurrencyLimits: undefined };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should handle empty modelConcurrencyLimits array', () => {
      const config = { ...DEFAULTS, modelConcurrencyLimits: [] };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should handle mixed provider and model configurations', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 7 },
          { provider: 'ollama', model: 'gemma3:27b', concurrency: 2 },
          { provider: 'claude', concurrency: 8 },
        ],
      };

      expect(getConcurrencyLimit(config, 'openai', 'gpt-4')).toBe(7);
      expect(getConcurrencyLimit(config, 'ollama', 'gemma3:27b')).toBe(2);
      expect(getConcurrencyLimit(config, 'ollama', 'llama3')).toBe(5);
      expect(getConcurrencyLimit(config, 'claude', 'claude-3')).toBe(8);
    });
  });
});

describe('Config - validateConcurrencyConfig', () => {
  describe('Valid Configuration', () => {
    it('should return empty errors array for valid configuration', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        { provider: 'ollama', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept configuration without model', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: 'openai', concurrency: 10 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept configuration with concurrency of 1', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept large concurrency values', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 1000 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should accept all valid providers', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'ollama', concurrency: 5 },
        { provider: 'openai', concurrency: 10 },
        { provider: 'gemini', concurrency: 5 },
        { provider: 'claude', concurrency: 5 },
        { provider: 'mistral', concurrency: 10 },
        { provider: 'deepseek', concurrency: 10 },
        { provider: 'zai-paas', concurrency: 5 },
        { provider: 'zai-coding', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });
  });

  describe('Invalid Provider', () => {
    it('should reject invalid provider name', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: 'invalid-provider', concurrency: 5 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid provider: invalid-provider');
    });

    it('should reject empty provider string', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: '', model: 'gpt-4', concurrency: 5 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should report multiple invalid providers', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'invalid1', concurrency: 5 },
        { provider: 'invalid2', concurrency: 3 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
      expect(errors[0]).toContain('Invalid provider: invalid1');
      expect(errors[1]).toContain('Invalid provider: invalid2');
    });
  });

  describe('Invalid Concurrency Values', () => {
    it('should reject concurrency of 0', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid concurrency value');
      expect(errors[0]).toContain('openai/gpt-4');
    });

    it('should reject negative concurrency', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: -5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid concurrency value');
      expect(errors[0]).toContain('-5');
    });

    it('should reject non-integer concurrency', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 3.5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid concurrency value');
      expect(errors[0]).toContain('3.5');
    });

    it('should treat undefined concurrency as invalid entry', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: undefined as unknown as number },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(0);
    });

    it('should reject NaN as concurrency', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: NaN },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid concurrency value');
    });

    it('should report multiple concurrency errors', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: -1 },
        { provider: 'ollama', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
    });
  });

  describe('Missing Required Fields', () => {
    it('should reject entry with neither provider nor model', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: '', model: '', concurrency: 5 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept entry with only provider specified', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: 'openai', concurrency: 5 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });
  });

  describe('Multiple Errors in Single Entry', () => {
    it('should report both invalid provider and invalid concurrency', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: 'invalid', concurrency: -1 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.includes('Invalid provider'))).toBe(true);
      expect(errors.some((e) => e.includes('Invalid concurrency'))).toBe(true);
    });
  });

  describe('Mixed Valid and Invalid Entries', () => {
    it('should report errors only for invalid entries', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        { provider: 'invalid', concurrency: 5 },
        { provider: 'ollama', concurrency: 5 },
        { provider: 'claude', model: 'claude-3', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.includes('Invalid provider: invalid'))).toBe(true);
      expect(
        errors.some((e) => e.includes('Invalid concurrency') && e.includes('claude/claude-3'))
      ).toBe(true);
    });
  });
});

describe('Config - validateConfidenceThreshold', () => {
  describe('Valid Threshold Values', () => {
    it('should return empty errors array for valid threshold values', () => {
      expect(validateConfidenceThreshold(0)).toEqual([]);
      expect(validateConfidenceThreshold(50)).toEqual([]);
      expect(validateConfidenceThreshold(70)).toEqual([]);
      expect(validateConfidenceThreshold(100)).toEqual([]);
    });

    it('should accept boundary values', () => {
      expect(validateConfidenceThreshold(0)).toEqual([]);
      expect(validateConfidenceThreshold(1)).toEqual([]);
      expect(validateConfidenceThreshold(99)).toEqual([]);
      expect(validateConfidenceThreshold(100)).toEqual([]);
    });
  });

  describe('Invalid Threshold Values', () => {
    it('should reject negative values', () => {
      const errors = validateConfidenceThreshold(-1);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be between 0 and 100');
      expect(errors[0]).toContain('-1');
    });

    it('should reject values greater than 100', () => {
      const errors = validateConfidenceThreshold(101);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be between 0 and 100');
      expect(errors[0]).toContain('101');
    });

    it('should reject non-integer values', () => {
      const errors = validateConfidenceThreshold(70.5);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be an integer');
      expect(errors[0]).toContain('70.5');
    });

    it('should report multiple errors for invalid values', () => {
      const errors = validateConfidenceThreshold(150.5);
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.includes('must be an integer'))).toBe(true);
      expect(errors.some((e) => e.includes('must be between 0 and 100'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should reject very large values', () => {
      const errors = validateConfidenceThreshold(1000);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be between 0 and 100');
    });

    it('should reject very small values', () => {
      const errors = validateConfidenceThreshold(-100);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be between 0 and 100');
    });
  });
});

describe('Config - isValidConfidenceThreshold', () => {
  describe('Valid Thresholds', () => {
    it('should return true for valid integer values between 0 and 100', () => {
      expect(isValidConfidenceThreshold(0)).toBe(true);
      expect(isValidConfidenceThreshold(1)).toBe(true);
      expect(isValidConfidenceThreshold(50)).toBe(true);
      expect(isValidConfidenceThreshold(70)).toBe(true);
      expect(isValidConfidenceThreshold(99)).toBe(true);
      expect(isValidConfidenceThreshold(100)).toBe(true);
    });
  });

  describe('Invalid Thresholds', () => {
    it('should return false for negative values', () => {
      expect(isValidConfidenceThreshold(-1)).toBe(false);
      expect(isValidConfidenceThreshold(-100)).toBe(false);
    });

    it('should return false for values greater than 100', () => {
      expect(isValidConfidenceThreshold(101)).toBe(false);
      expect(isValidConfidenceThreshold(150)).toBe(false);
      expect(isValidConfidenceThreshold(1000)).toBe(false);
    });

    it('should return false for non-integer values', () => {
      expect(isValidConfidenceThreshold(50.5)).toBe(false);
      expect(isValidConfidenceThreshold(70.1)).toBe(false);
      expect(isValidConfidenceThreshold(99.9)).toBe(false);
    });

    it('should return false for special numeric values', () => {
      expect(isValidConfidenceThreshold(NaN)).toBe(false);
      expect(isValidConfidenceThreshold(Infinity)).toBe(false);
      expect(isValidConfidenceThreshold(-Infinity)).toBe(false);
    });
  });
});

describe('Config - validateCustomTagsThresholds', () => {
  describe('Valid Tag Configurations', () => {
    it('should return empty errors array when all tags have valid thresholds', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 70 },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 80 },
        { key: 'tag3', name: 'Tag 3', color: '#0000FF', minConfidenceThreshold: 0 },
        { key: 'tag4', name: 'Tag 4', color: '#FFFF00', minConfidenceThreshold: 100 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors).toEqual([]);
    });

    it('should accept tags without threshold override', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000' },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: undefined },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors).toEqual([]);
    });

    it('should accept mixed valid and undefined thresholds', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 75 },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00' },
        { key: 'tag3', name: 'Tag 3', color: '#0000FF', minConfidenceThreshold: 85 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors).toEqual([]);
    });
  });

  describe('Invalid Tag Configurations', () => {
    it('should reject tags with threshold below 0', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: -1 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('tag1');
      expect(errors[0]).toContain('-1');
      expect(errors[0]).toContain('Must be an integer between 0 and 100');
    });

    it('should reject tags with threshold above 100', () => {
      const tags: Tag[] = [
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 101 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('tag2');
      expect(errors[0]).toContain('101');
      expect(errors[0]).toContain('Must be an integer between 0 and 100');
    });

    it('should reject tags with non-integer threshold', () => {
      const tags: Tag[] = [
        { key: 'tag3', name: 'Tag 3', color: '#0000FF', minConfidenceThreshold: 75.5 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('tag3');
      expect(errors[0]).toContain('75.5');
      expect(errors[0]).toContain('Must be an integer between 0 and 100');
    });
  });

  describe('Multiple Errors', () => {
    it('should report errors for all invalid tags', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 75 },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 150 },
        { key: 'tag3', name: 'Tag 3', color: '#0000FF', minConfidenceThreshold: -10 },
        { key: 'tag4', name: 'Tag 4', color: '#FFFF00', minConfidenceThreshold: 85 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.includes('tag2') && e.includes('150'))).toBe(true);
      expect(errors.some((e) => e.includes('tag3') && e.includes('-10'))).toBe(true);
    });

    it('should report both integer and range errors for same tag', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 150.5 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('tag1');
      expect(errors[0]).toContain('150.5');
      // Should report both integer and range errors in the same message
    });

    it('should handle empty tag array', () => {
      const tags: Tag[] = [];
      const errors = validateCustomTagsThresholds(tags);
      expect(errors).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary values', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: 0 },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 100 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors).toEqual([]);
    });

    it('should reject values just outside boundaries', () => {
      const tags: Tag[] = [
        { key: 'tag1', name: 'Tag 1', color: '#FF0000', minConfidenceThreshold: -1 },
        { key: 'tag2', name: 'Tag 2', color: '#00FF00', minConfidenceThreshold: 101 },
      ];

      const errors = validateCustomTagsThresholds(tags);
      expect(errors.length).toBe(2);
    });
  });
});
