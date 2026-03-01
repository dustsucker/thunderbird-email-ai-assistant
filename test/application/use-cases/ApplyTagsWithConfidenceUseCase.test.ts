/**
 * Tests for ApplyTagsWithConfidenceUseCase
 *
 * @module test/application/use-cases/ApplyTagsWithConfidenceUseCase.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApplyTagsWithConfidenceUseCase } from '../../../src/application/use-cases/ApplyTagsWithConfidenceUseCase';
import type { ITagManager } from '../../../src/domain/interfaces/ITagManager';
import type {
  IAppConfig,
  ICustomTag,
} from '../../../src/infrastructure/interfaces/IConfigRepository';
import type { Tag } from '../../../src/shared/types/ProviderTypes';
import {
  createMockLogger,
  createMockConfigRepository,
  createDefaultAppConfig,
} from '../../helpers/mock-factories';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockTag = (overrides: Partial<Tag> = {}): Tag => ({
  key: 'business',
  name: 'Business',
  color: '#FF0000',
  prompt: 'Test prompt',
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('ApplyTagsWithConfidenceUseCase', () => {
  let useCase: ApplyTagsWithConfidenceUseCase;
  let mockTagManager: ITagManager;
  let mockConfigRepository = createMockConfigRepository();
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockTagManager = {
      getAllTags: vi.fn(),
      getTag: vi.fn(),
      getTagById: vi.fn(),
      createTag: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
      addTagToMessage: vi.fn(),
      removeTagFromMessage: vi.fn(),
      setTagsOnMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    mockConfigRepository = createMockConfigRepository();
    mockLogger = createMockLogger();

    useCase = new ApplyTagsWithConfidenceUseCase(mockTagManager, mockConfigRepository, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(useCase).toBeInstanceOf(ApplyTagsWithConfidenceUseCase);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '✅ ApplyTagsWithConfidenceUseCase initialized'
      );
    });
  });

  // ==========================================================================
  // execute() Tests - Basic Scenarios
  // ==========================================================================

  describe('execute', () => {
    beforeEach(() => {
      // Default mock setup
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: false,
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should skip tag application when applyTags=false', async () => {
      const result = await useCase.execute('123', ['business'], 0.85, 'Test reasoning', {
        applyTags: false,
      });

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toEqual([]);
      expect(mockTagManager.setTagsOnMessage).not.toHaveBeenCalled();
    });

    it('should apply tags when applyTags=true (default)', async () => {
      const result = await useCase.execute('123', ['business'], 0.85);

      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['business']);
      expect(result.appliedTags).toEqual(['business']);
    });

    it('should throw error for invalid message ID', async () => {
      await expect(useCase.execute('invalid', ['business'], 0.85)).rejects.toThrow(
        'Invalid message ID: invalid'
      );
    });

    it('should throw error for empty message ID', async () => {
      await expect(useCase.execute('', ['business'], 0.85)).rejects.toThrow('Invalid message ID:');
    });

    it('should apply tags that meet global threshold', async () => {
      const result = await useCase.execute('123', ['business', 'personal'], 0.75);

      expect(result.appliedTags).toEqual(['business', 'personal']);
      expect(result.lowConfidenceFlags).toEqual([]);
    });
  });

  // ==========================================================================
  // execute() Tests - Confidence Threshold Filtering
  // ==========================================================================

  describe('confidence threshold filtering', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should create low-confidence flag for tags below threshold', async () => {
      const result = await useCase.execute('123', ['business'], 0.5); // 50% < 70%

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toHaveLength(1);
      expect(result.lowConfidenceFlags[0].tagKey).toBe('business');
      expect(result.lowConfidenceFlags[0].confidence).toBe(0.5);
      expect(result.lowConfidenceFlags[0].threshold).toBe(70);
      expect(result.lowConfidenceFlags[0].thresholdType).toBe('global');
    });

    it('should apply tag exactly at threshold', async () => {
      const result = await useCase.execute('123', ['business'], 0.7); // 70% = 70%

      expect(result.appliedTags).toEqual(['business']);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should apply tag above threshold', async () => {
      const result = await useCase.execute('123', ['business'], 0.71); // 71% > 70%

      expect(result.appliedTags).toEqual(['business']);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should handle mixed confidence results', async () => {
      const result = await useCase.execute(
        '123',
        ['business', 'personal', 'newsletter'],
        0.65 // 65% - applies to business (below 70%), others
      );

      // All tags below threshold
      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toHaveLength(3);
    });
  });

  // ==========================================================================
  // execute() Tests - Custom Tag Thresholds
  // ==========================================================================

  describe('custom tag thresholds', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should use custom threshold when defined for tag', async () => {
      const customTags: ICustomTag[] = [
        {
          key: 'business',
          name: 'Business',
          color: '#FF0000',
          prompt: 'Business email',
          minConfidenceThreshold: 80,
        },
      ];
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(customTags);

      const result = await useCase.execute('123', ['business'], 0.75); // 75% < 80%

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toHaveLength(1);
      expect(result.lowConfidenceFlags[0].threshold).toBe(80);
      expect(result.lowConfidenceFlags[0].thresholdType).toBe('custom');
    });

    it('should apply tag meeting custom threshold', async () => {
      const customTags: ICustomTag[] = [
        {
          key: 'business',
          name: 'Business',
          color: '#FF0000',
          prompt: 'Business email',
          minConfidenceThreshold: 60,
        },
      ];
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(customTags);

      const result = await useCase.execute('123', ['business'], 0.65); // 65% > 60%

      expect(result.appliedTags).toEqual(['business']);
    });

    it('should fall back to global threshold for undefined custom threshold', async () => {
      const customTags: ICustomTag[] = [
        {
          key: 'business',
          name: 'Business',
          color: '#FF0000',
          prompt: 'Business email',
          // No minConfidenceThreshold
        },
      ];
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(customTags);

      const result = await useCase.execute('123', ['business'], 0.75); // 75% > 70%

      expect(result.appliedTags).toEqual(['business']);
    });
  });

  // ==========================================================================
  // execute() Tests - Reasoning
  // ==========================================================================

  describe('reasoning in low-confidence flags', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should include reasoning in low-confidence flag', async () => {
      const result = await useCase.execute(
        '123',
        ['business'],
        0.5,
        'This looks like a promotional email'
      );

      expect(result.lowConfidenceFlags[0].reasoning).toContain(
        'This looks like a promotional email'
      );
      expect(result.lowConfidenceFlags[0].reasoning).toContain(
        'Confidence 50% below threshold 70%'
      );
    });

    it('should work without reasoning', async () => {
      const result = await useCase.execute('123', ['business'], 0.5);

      expect(result.lowConfidenceFlags[0].reasoning).toContain(
        'Confidence 50% below threshold 70%'
      );
    });
  });

  // ==========================================================================
  // execute() Tests - Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should throw and log on tag manager error', async () => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);

      const error = new Error('Tag manager error');
      vi.mocked(mockTagManager.setTagsOnMessage).mockRejectedValue(error);

      await expect(useCase.execute('123', ['business'], 0.85)).rejects.toThrow('Tag manager error');

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to apply tags', {
        messageId: '123',
        tagKeys: ['business'],
        confidence: 0.85,
        error: 'Tag manager error',
      });
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockRejectedValue('String error');

      await expect(useCase.execute('123', ['business'], 0.85)).rejects.toThrow('String error');
    });

    it('should handle config repository errors', async () => {
      vi.mocked(mockConfigRepository.getAppConfig).mockRejectedValue(new Error('Config error'));

      await expect(useCase.execute('123', ['business'], 0.85)).rejects.toThrow('Config error');
    });
  });

  // ==========================================================================
  // Logging Tests
  // ==========================================================================

  describe('logging', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should log when tags are applied successfully', async () => {
      await useCase.execute('123', ['business'], 0.85);

      expect(mockLogger.info).toHaveBeenCalledWith('✅ Tags applied successfully', {
        messageId: '123',
        applied: 1,
        total: 1,
      });
    });

    it('should warn when no tags meet threshold', async () => {
      await useCase.execute('123', ['business'], 0.5);

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  No tags met confidence threshold', {
        messageId: '123',
        total: 1,
        confidence: '50.0%',
        globalThreshold: 70,
      });
    });

    it('should log low-confidence flags', async () => {
      await useCase.execute('123', ['business', 'personal'], 0.5);

      expect(mockLogger.info).toHaveBeenCalledWith('📋 Low-confidence flags created', {
        messageId: '123',
        flagCount: 2,
        flags: expect.arrayContaining(['business: 50% < 70%', 'personal: 50% < 70%']),
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should handle empty tag array', async () => {
      const result = await useCase.execute('123', [], 0.85);

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should handle confidence of 0', async () => {
      const result = await useCase.execute('123', ['business'], 0);

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toHaveLength(1);
    });

    it('should handle confidence of 1', async () => {
      const result = await useCase.execute('123', ['business'], 1);

      expect(result.appliedTags).toEqual(['business']);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should handle missing global threshold (use default)', async () => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        // No minConfidenceThreshold
      } as IAppConfig);

      const result = await useCase.execute('123', ['business'], 0.65);

      // Default threshold is 70, so 65% should fail
      expect(result.appliedTags).toEqual([]);
    });

    it('should handle negative message IDs', async () => {
      const result = await useCase.execute('-1', ['business'], 0.85);

      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(-1, ['business']);
    });
  });
});
