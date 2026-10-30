/**
 * Tests for ApplyTagsWithConfidenceUseCase
 *
 * @module test/application/use-cases/ApplyTagsWithConfidenceUseCase.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApplyTagsWithConfidenceUseCase } from '../../../src/application/use-cases/ApplyTagsWithConfidenceUseCase';
import { UndoTagChanges } from '../../../src/application/use-cases/UndoTagChanges';
import { TagHistoryRepository } from '../../../src/infrastructure/storage/TagHistoryRepository';
import type { ITagManager } from '../../../src/domain/interfaces/ITagManager';
import type {
  IAppConfig,
  ICustomTag,
} from '../../../src/infrastructure/interfaces/IConfigRepository';
import type { Tag } from '../../../src/shared/types/ProviderTypes';
import {
  createMockLogger,
  createMockConfigRepository,
  createMockClock,
  createMockRandom,
} from '../../helpers/mock-factories';

// ============================================================================
// Test Fixtures
// ============================================================================

const _createMockTag = (overrides: Partial<Tag> = {}): Tag => ({
  key: 'business',
  name: 'Business',
  color: '#FF0000',
  prompt: 'Test prompt',
  ...overrides,
});

/**
 * Known custom tags (the whitelist used by the use case). Tests that apply
 * 'business' / 'personal' / 'newsletter' rely on these being known keys.
 */
const KNOWN_CUSTOM_TAGS: ICustomTag[] = ['business', 'personal', 'newsletter'].map((key) => ({
  key,
  name: key,
  color: '#FF0000',
  prompt: 'Test prompt',
}));

// ============================================================================
// Tests
// ============================================================================

describe('ApplyTagsWithConfidenceUseCase', () => {
  let useCase: ApplyTagsWithConfidenceUseCase;
  let mockTagManager: ITagManager;
  let mockConfigRepository = createMockConfigRepository();
  let mockLogger = createMockLogger();
  let mockHistoryRepository: { recordChange: ReturnType<typeof vi.fn> };

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
      getTagsOnMessage: vi.fn().mockResolvedValue([]),
      setTagsOnMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    mockConfigRepository = createMockConfigRepository();
    mockLogger = createMockLogger();
    mockHistoryRepository = { recordChange: vi.fn().mockResolvedValue({ id: 'history-1' }) };

    useCase = new ApplyTagsWithConfidenceUseCase(
      mockTagManager,
      mockConfigRepository,
      mockHistoryRepository as unknown as TagHistoryRepository,
      mockLogger
    );
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
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

    it('applies provider decision tags (is_scam) that pass the global gate', async () => {
      // Regression (log finding): scam findings arrived with confidence 0% and were
      // dropped by the global gate despite passing the provider's internal threshold.
      const result = await useCase.execute('123', ['is_scam'], 0.9);

      expect(result.appliedTags).toEqual(['is_scam']);
      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_scam']);
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);

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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should log when tags are applied successfully', async () => {
      await useCase.execute('123', ['business'], 0.85);

      expect(mockLogger.debug).toHaveBeenCalledWith('✅ Tags applied successfully', {
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

    it('should warn "Provider returned no tags" when the provider found nothing', async () => {
      await useCase.execute('123', [], 0.9);

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  Provider returned no tags', {
        messageId: '123',
      });
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        '⚠️  No tags met confidence threshold',
        expect.anything()
      );
    });

    it('should log low-confidence flags', async () => {
      await useCase.execute('123', ['business', 'personal'], 0.5);

      expect(mockLogger.debug).toHaveBeenCalledWith('📋 Low-confidence flags created', {
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

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
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
      await useCase.execute('-1', ['business'], 0.85);

      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(-1, ['business']);
    });
  });

  // ==========================================================================
  // DW4: LLM Tag Whitelist - unknown keys are dropped, not errors
  // ==========================================================================

  describe('tag whitelist (DW4)', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);

      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('should drop unknown tag keys and apply only known keys (no error)', async () => {
      const result = await useCase.execute('123', ['business', 'hallucinated_tag_xyz'], 0.85);

      // Only the known key is applied; no throw, no all-or-nothing failure
      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['business']);
      expect(result.appliedTags).toEqual(['business']);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should drop unknown keys before threshold logic (no low-confidence flag)', async () => {
      const result = await useCase.execute('123', ['hallucinated_tag_xyz'], 0.5);

      expect(result.appliedTags).toEqual([]);
      expect(result.lowConfidenceFlags).toEqual([]);
    });

    it('should accept hardcoded tag keys even without custom tags', async () => {
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue([]);

      const result = await useCase.execute('123', ['is_scam'], 0.85);

      expect(result.appliedTags).toEqual(['is_scam']);
      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_scam']);
    });
  });

  // ==========================================================================
  // Tag History Recording (#31) — recordChange() must be wired into the flow
  // ==========================================================================

  describe('tag history recording (#31)', () => {
    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: false,
        minConfidenceThreshold: 70,
      } as IAppConfig);
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();
    });

    it('records the change with previous/added/removed before applying tags', async () => {
      vi.mocked(mockTagManager.getTagsOnMessage).mockResolvedValue(['personal']);

      await useCase.execute('123', ['business', 'personal'], 0.9);

      expect(mockHistoryRepository.recordChange).toHaveBeenCalledTimes(1);
      expect(mockHistoryRepository.recordChange).toHaveBeenCalledWith(
        '123',
        [{ key: 'business', tag: 'business' }], // added (not previously on message)
        [], // removed
        [{ key: 'personal', tag: 'personal' }] // previous state
      );

      // recordChange must run BEFORE setTagsOnMessage so the previous state is captured
      const recordOrder = vi.mocked(mockHistoryRepository.recordChange).mock
        .invocationCallOrder[0];
      const setOrder = vi.mocked(mockTagManager.setTagsOnMessage).mock.invocationCallOrder[0];
      expect(recordOrder).toBeLessThan(setOrder);
    });

    it('records removed tags when nothing meets the threshold (clearing is a change)', async () => {
      vi.mocked(mockTagManager.getTagsOnMessage).mockResolvedValue(['business']);

      const result = await useCase.execute('123', ['business'], 0.1); // 10% < 70%

      expect(result.appliedTags).toEqual([]);
      expect(mockHistoryRepository.recordChange).toHaveBeenCalledWith(
        '123',
        [],
        [{ key: 'business', tag: 'business' }],
        [{ key: 'business', tag: 'business' }]
      );
    });

    it('does not record when tagging is skipped (applyTags=false)', async () => {
      await useCase.execute('123', ['business'], 0.9, 'reason', { applyTags: false });

      expect(mockHistoryRepository.recordChange).not.toHaveBeenCalled();
    });

    it('apply → undo round trip restores the previous tag state (#31)', async () => {
      // Real storage-backed history repository
      const mockStorage: Record<string, unknown> = {};
      (globalThis as Record<string, unknown>).messenger = {
        storage: {
          local: {
            get: vi.fn(async (keys?: string | string[]) => {
              const result: Record<string, unknown> = {};
              const keyArray = typeof keys === 'string' ? [keys] : (keys ?? []);
              for (const key of keyArray) {
                if (mockStorage[key] !== undefined) result[key] = mockStorage[key];
              }
              return result;
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
              Object.assign(mockStorage, items);
            }),
          },
        },
      };

      // Stateful fake of the AI-namespace tags on message 123
      const toInternal = (key: string) => `_ma_${key}`;
      let messageTags = ['_ma_personal'];
      vi.mocked(mockTagManager.getTagsOnMessage).mockImplementation(async () =>
        messageTags.filter((k) => k.startsWith('_ma_')).map((k) => k.slice('_ma_'.length))
      );
      vi.mocked(mockTagManager.setTagsOnMessage).mockImplementation(async (_messageId, keys) => {
        messageTags = keys.map(toInternal);
      });
      vi.mocked(mockTagManager.addTagToMessage).mockImplementation(async (_messageId, key) => {
        if (!messageTags.includes(toInternal(key))) messageTags.push(toInternal(key));
      });
      vi.mocked(mockTagManager.removeTagFromMessage).mockImplementation(async (_messageId, key) => {
        messageTags = messageTags.filter((k) => k !== toInternal(key));
      });

      const historyRepository = new TagHistoryRepository(
        mockLogger,
        createMockClock(1709251200000),
        createMockRandom('history-uuid-1')
      );
      const applyUseCase = new ApplyTagsWithConfidenceUseCase(
        mockTagManager,
        mockConfigRepository,
        historyRepository,
        mockLogger
      );
      const undoUseCase = new UndoTagChanges(mockLogger, mockTagManager, historyRepository);

      // Tag the mail: ['personal'] gets replaced by ['business']
      const result = await applyUseCase.execute('123', ['business'], 0.9);
      expect(result.appliedTags).toEqual(['business']);
      expect(messageTags).toEqual(['_ma_business']);

      // Undo must find history (not report "no history") and restore the previous state
      const undone = await undoUseCase.execute('123');
      expect(undone).toBe(true);
      expect(messageTags).toEqual(['_ma_personal']);
    });
  });

  // ==========================================================================
  // Tag Apply History (Debug) - best-effort recording after setTagsOnMessage
  // ==========================================================================

  describe('tag apply history', () => {
    let mockApplyHistoryRepository: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      vi.mocked(mockConfigRepository.getAppConfig).mockResolvedValue({
        defaultProvider: 'openai',
        minConfidenceThreshold: 70,
      } as IAppConfig);
      vi.mocked(mockConfigRepository.getCustomTags).mockResolvedValue(KNOWN_CUSTOM_TAGS);
      vi.mocked(mockTagManager.setTagsOnMessage).mockResolvedValue();

      mockApplyHistoryRepository = { record: vi.fn().mockResolvedValue(undefined) };
      useCase = new ApplyTagsWithConfidenceUseCase(
        mockTagManager,
        mockConfigRepository,
        mockHistoryRepository as unknown as TagHistoryRepository,
        mockLogger,
        mockApplyHistoryRepository as never
      );
    });

    it('should record applied tags with context after applying', async () => {
      await useCase.execute('123', ['business'], 0.85, undefined, undefined, {
        providerId: 'openai',
        subject: 'Invoice',
      });

      expect(mockApplyHistoryRepository.record).toHaveBeenCalledWith({
        messageId: '123',
        subject: 'Invoice',
        tags: ['business'],
        providerId: 'openai',
      });
    });

    it('should fall back to providerId "unknown" and no subject without context', async () => {
      await useCase.execute('123', ['business'], 0.85);

      expect(mockApplyHistoryRepository.record).toHaveBeenCalledWith({
        messageId: '123',
        subject: undefined,
        tags: ['business'],
        providerId: 'unknown',
      });
    });

    it('should not block tagging when recording fails', async () => {
      mockApplyHistoryRepository.record.mockRejectedValue(new Error('Storage full'));

      const result = await useCase.execute('123', ['business'], 0.85, undefined, undefined, {
        providerId: 'openai',
      });

      expect(result.appliedTags).toEqual(['business']);
      expect(mockTagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['business']);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to record tag apply history',
        expect.objectContaining({ messageId: '123', error: 'Storage full' })
      );
    });

    it('should skip recording when no history repository is available', async () => {
      useCase = new ApplyTagsWithConfidenceUseCase(
        mockTagManager,
        mockConfigRepository,
        mockHistoryRepository as unknown as TagHistoryRepository,
        mockLogger,
        mockApplyHistoryRepository as never
      );

      const result = await useCase.execute('123', ['business'], 0.85);

      expect(result.appliedTags).toEqual(['business']);
    });
  });
});
