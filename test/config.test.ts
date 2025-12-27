import { describe, it, expect, beforeEach } from 'vitest';
import { getConcurrencyLimit, validateConcurrencyConfig, ModelConcurrencyConfig } from '../core/config';
import { DEFAULTS } from '../core/config';

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

    it('should return default concurrency for zai provider', () => {
      const limit = getConcurrencyLimit(DEFAULTS, 'zai', 'glm-4');
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
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        ],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(3);
    });

    it('should return provider default when model not configured', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 3 },
        ],
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
        modelConcurrencyLimits: [
          { provider: 'openai', model: 'gpt-4', concurrency: 0 },
        ],
      };

      const limit = getConcurrencyLimit(config, 'openai', 'gpt-4');
      expect(limit).toBe(10);
    });
  });

  describe('Provider-Level Concurrency Configuration', () => {
    it('should return provider-specific concurrency when configured', () => {
      const config = {
        ...DEFAULTS,
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 7 },
        ],
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
        modelConcurrencyLimits: [
          { provider: 'openai', concurrency: 0 },
        ],
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
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', concurrency: 10 },
      ];

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
        { provider: 'zai', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });
  });

  describe('Invalid Provider', () => {
    it('should reject invalid provider name', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'invalid-provider', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid provider: invalid-provider');
    });

    it('should reject empty provider string', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: '', model: 'gpt-4', concurrency: 5 },
      ];

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
      const config: ModelConcurrencyConfig[] = [
        { provider: '', model: '', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept entry with only provider specified', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'openai', concurrency: 5 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors).toEqual([]);
    });
  });

  describe('Multiple Errors in Single Entry', () => {
    it('should report both invalid provider and invalid concurrency', () => {
      const config: ModelConcurrencyConfig[] = [
        { provider: 'invalid', concurrency: -1 },
      ];

      const errors = validateConcurrencyConfig(config);
      expect(errors.length).toBe(2);
      expect(errors.some(e => e.includes('Invalid provider'))).toBe(true);
      expect(errors.some(e => e.includes('Invalid concurrency'))).toBe(true);
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
      expect(errors.some(e => e.includes('Invalid provider: invalid'))).toBe(true);
      expect(errors.some(e => e.includes('Invalid concurrency') && e.includes('claude/claude-3'))).toBe(true);
    });
  });
});
