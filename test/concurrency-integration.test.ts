import { describe, it, expect } from 'vitest';
import {
  getConcurrencyLimit,
  validateConcurrencyConfig,
  ModelConcurrencyConfig,
  AppConfig,
  DEFAULTS,
} from '../core/config';

describe('Concurrency Limiting - Integration Tests', () => {
  describe('End-to-End Concurrency Management', () => {
    it('should handle complete configuration hierarchy', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 8 },
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
          { provider: 'ollama', concurrency: 4 },
        ],
      };

      const errors = validateConcurrencyConfig(config.modelConcurrencyLimits!);
      expect(errors).toEqual([]);

      expect(getConcurrencyLimit(config, 'openai', 'gpt-4')).toBe(3);
      expect(getConcurrencyLimit(config, 'openai', 'gpt-3.5-turbo')).toBe(8);
      expect(getConcurrencyLimit(config, 'ollama', 'llama3')).toBe(4);
      expect(getConcurrencyLimit(config, 'claude', 'claude-3')).toBe(5);
    });

    it('should validate configuration before applying limits', () => {
      const invalidConfig: ModelConcurrencyConfig[] = [
        { provider: 'invalid', concurrency: -1 },
        { provider: 'openai', model: 'gpt-4', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(invalidConfig);
      expect(errors.length).toBe(3);
      expect(errors.some((e) => e.includes('Invalid provider'))).toBe(true);
      expect(errors.some((e) => e.includes('Invalid concurrency'))).toBe(true);
    });

    it('should safely handle invalid configurations in getConcurrencyLimit', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'invalid', model: 'gpt-4', concurrency: 3 }],
      };

      const errors = validateConcurrencyConfig(config.modelConcurrencyLimits!);
      expect(errors.length).toBeGreaterThan(0);

      const limit = getConcurrencyLimit(config, 'invalid', 'gpt-4');
      expect(limit).toBe(3);
    });
  });

  describe('Simulated Parallel Requests', () => {
    it('should calculate correct limits for multiple concurrent models', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 2 },
          { provider: 'openai', model: 'gpt-3.5-turbo', concurrency: 5 },
          { provider: 'ollama', model: 'gemma3:27b', concurrency: 3 },
        ],
      };

      const models = [
        { provider: 'openai', model: 'gpt-4', expectedLimit: 2 },
        { provider: 'openai', model: 'gpt-3.5-turbo', expectedLimit: 5 },
        { provider: 'openai', model: 'gpt-3.5', expectedLimit: 10 },
        { provider: 'ollama', model: 'gemma3:27b', expectedLimit: 3 },
        { provider: 'ollama', model: 'llama3', expectedLimit: 5 },
        { provider: 'claude', model: 'claude-3', expectedLimit: 5 },
      ];

      models.forEach(({ provider, model, expectedLimit }) => {
        const limit = getConcurrencyLimit(config, provider, model);
        expect(limit).toBe(expectedLimit);
      });
    });

    it('should simulate provider-wide concurrency limit', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', concurrency: 7 }],
      };

      const models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-3.5'];

      models.forEach((model) => {
        const limit = getConcurrencyLimit(config, 'openai', model);
        expect(limit).toBe(7);
      });
    });

    it('should demonstrate fallback to provider defaults', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', model: 'gpt-4', concurrency: 3 }],
      };

      const scenarios = [
        { provider: 'openai', model: 'gpt-4', expected: 3 },
        { provider: 'openai', model: 'gpt-3.5-turbo', expected: 10 },
        { provider: 'ollama', model: 'gemma3:27b', expected: 5 },
        { provider: 'gemini', model: 'gemini-pro', expected: 5 },
        { provider: 'mistral', model: 'mistral-large', expected: 10 },
        { provider: 'deepseek', model: 'deepseek-chat', expected: 10 },
        { provider: 'zai-paas', model: 'glm-4', expected: 5 },
        { provider: 'zai-coding', model: 'glm-4', expected: 5 },
      ];

      scenarios.forEach(({ provider, model, expected }) => {
        const limit = getConcurrencyLimit(config, provider, model);
        expect(limit).toBe(expected);
      });
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should handle mixed provider and model configurations', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 8 },
          { provider: 'openai', model: 'gpt-4', concurrency: 2 },
          { provider: 'ollama', model: 'gemma3:27b', concurrency: 3 },
          { provider: 'claude', concurrency: 6 },
        ],
      };

      const testCases = [
        { provider: 'openai', model: 'gpt-4', expected: 2 },
        { provider: 'openai', model: 'gpt-3.5-turbo', expected: 8 },
        { provider: 'ollama', model: 'gemma3:27b', expected: 3 },
        { provider: 'ollama', model: 'llama3', expected: 5 },
        { provider: 'claude', model: 'claude-3', expected: 6 },
        { provider: 'gemini', model: 'gemini-pro', expected: 5 },
      ];

      testCases.forEach(({ provider, model, expected }) => {
        expect(getConcurrencyLimit(config, provider, model)).toBe(expected);
      });
    });

    it('should validate complex multi-provider configurations', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', concurrency: 10 },
        { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        { provider: 'openai', model: 'gpt-3.5-turbo', concurrency: 5 },
        { provider: 'ollama', concurrency: 5 },
        { provider: 'ollama', model: 'gemma3:27b', concurrency: 2 },
        { provider: 'claude', concurrency: 5 },
        { provider: 'mistral', concurrency: 8 },
        { provider: 'deepseek', concurrency: 8 },
        { provider: 'gemini', concurrency: 5 },
        { provider: 'zai-paas', concurrency: 5 },
        { provider: 'zai-coding', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should detect errors in complex configurations', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', concurrency: 10 },
        { provider: 'invalid-provider', concurrency: 5 },
        { provider: 'openai', model: 'gpt-4', concurrency: -1 },
        { provider: 'ollama', model: 'gemma3:27b', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(3);
      expect(errors.some((e) => e.includes('Invalid provider: invalid-provider'))).toBe(true);
      expect(
        errors.some((e) => e.includes('Invalid concurrency') && e.includes('openai/gpt-4'))
      ).toBe(true);
      expect(
        errors.some((e) => e.includes('Invalid concurrency') && e.includes('ollama/gemma3:27b'))
      ).toBe(true);
    });
  });

  describe('Real-World Usage Patterns', () => {
    it('should support typical production configuration', () => {
      const productionConfig: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
          { provider: 'openai', model: 'gpt-3.5-turbo', concurrency: 10 },
          { provider: 'ollama', model: 'gemma3:27b', concurrency: 2 },
          { provider: 'claude', model: 'claude-3-opus', concurrency: 5 },
        ],
      };

      const validationErrors = validateConcurrencyConfig(productionConfig.modelConcurrencyLimits!);
      expect(validationErrors).toEqual([]);

      expect(getConcurrencyLimit(productionConfig, 'openai', 'gpt-4')).toBe(3);
      expect(getConcurrencyLimit(productionConfig, 'openai', 'gpt-3.5-turbo')).toBe(10);
      expect(getConcurrencyLimit(productionConfig, 'ollama', 'gemma3:27b')).toBe(2);
      expect(getConcurrencyLimit(productionConfig, 'claude', 'claude-3-opus')).toBe(5);
    });

    it('should handle migration from old configuration format', () => {
      const oldStyleConfig: ModelConcurrencyConfig[] = [
        { provider: 'openai', concurrency: 10 },
        { provider: 'ollama', concurrency: 5 },
      ];

      const newConfig: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: oldStyleConfig,
      };

      const errors = validateConcurrencyConfig(newConfig.modelConcurrencyLimits!);
      expect(errors).toEqual([]);

      expect(getConcurrencyLimit(newConfig, 'openai', 'gpt-4')).toBe(10);
      expect(getConcurrencyLimit(newConfig, 'openai', 'gpt-3.5-turbo')).toBe(10);
      expect(getConcurrencyLimit(newConfig, 'ollama', 'gemma3:27b')).toBe(5);
    });

    it('should support gradual rollout of model-specific limits', () => {
      const gradualRolloutConfig: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', concurrency: 10 }],
      };

      expect(getConcurrencyLimit(gradualRolloutConfig, 'openai', 'gpt-4')).toBe(10);
      expect(getConcurrencyLimit(gradualRolloutConfig, 'openai', 'gpt-3.5-turbo')).toBe(10);

      const updatedConfig: AppConfig = {
        ...gradualRolloutConfig,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 10 },
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        ],
      };

      expect(getConcurrencyLimit(updatedConfig, 'openai', 'gpt-4')).toBe(3);
      expect(getConcurrencyLimit(updatedConfig, 'openai', 'gpt-3.5-turbo')).toBe(10);
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    it('should handle empty configuration gracefully', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should handle undefined configuration gracefully', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: undefined,
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should handle zero concurrency with fallback to default', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', model: 'gpt-4', concurrency: 0 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });

    it('should handle large concurrency values', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [{ provider: 'openai', concurrency: 1000 }],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(1000);
    });

    it('should handle concurrent limit calculations', () => {
      const config: AppConfig = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
          { provider: 'ollama', model: 'gemma3:27b', concurrency: 2 },
        ],
      };

      const limits = [
        getConcurrencyLimit(config, 'openai', 'gpt-4'),
        getConcurrencyLimit(config, 'openai', 'gpt-3.5-turbo'),
        getConcurrencyLimit(config, 'ollama', 'gemma3:27b'),
        getConcurrencyLimit(config, 'claude', 'claude-3'),
      ];

      expect(limits).toEqual([3, 10, 2, 5]);
    });
  });

  describe('Validation Edge Cases', () => {
    it('should validate that model is optional', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: 'openai', concurrency: 10 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should detect missing provider when model is specified', () => {
      const config: ModelConcurrencyConfig[] = [{ provider: '', model: 'gpt-4', concurrency: 10 }];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should allow model without provider-level override', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', model: 'gpt-4', concurrency: 3 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });

    it('should handle multiple validation errors in single entry', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'invalid', model: 'gpt-4', concurrency: -5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
    });

    it('should validate all entries even if early ones fail', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'invalid1', concurrency: -1 },
        { provider: 'invalid2', concurrency: -2 },
        { provider: 'openai', concurrency: 10 },
        { provider: 'invalid3', model: 'gpt-4', concurrency: 0 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(6);
    });
  });
});
