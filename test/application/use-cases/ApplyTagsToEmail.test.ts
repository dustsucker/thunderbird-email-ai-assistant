/**
 * Unit Tests: ApplyTagsToEmail — real current-tag reads (Issue #32)
 *
 * Regression tests for the getCurrentTags() placeholder that always returned
 * []. Verifies that:
 * - removeTags() computes keysToRemove from the real current tags
 * - Append mode (replaceTags: false) preserves existing tags instead of
 *   replacing them with the new ones alone
 *
 * @module test/application/use-cases/ApplyTagsToEmail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import type { ITagManager, ILogger } from '@/domain/interfaces';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';

describe('ApplyTagsToEmail - real current-tag reads (Issue #32)', () => {
  let logger: ILogger;
  let configRepository: IConfigRepository;
  let tagManager: ITagManager;
  let useCase: ApplyTagsToEmail;

  beforeEach(() => {
    vi.clearAllMocks();

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
    };

    tagManager = {
      getAllTags: vi.fn().mockResolvedValue([]),
      createTag: vi.fn(),
      getTag: vi.fn(),
      getTagById: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn().mockImplementation(async (key: string, name: string) => ({
        key,
        tag: name,
        color: '#9E9E9E',
        ordinal: '0',
      })),
      getTagsOnMessage: vi.fn().mockResolvedValue([]),
      setTagsOnMessage: vi.fn().mockResolvedValue(undefined),
      addTagToMessage: vi.fn(),
      removeTagFromMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    configRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getAppConfig: vi.fn(),
      getCustomTags: vi.fn().mockResolvedValue([]),
      setCustomTags: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    } as unknown as IConfigRepository;

    useCase = new ApplyTagsToEmail(tagManager, logger, configRepository);
  });

  describe('removeTags()', () => {
    it('removes only the requested tags based on real current tags', async () => {
      (tagManager.getTagsOnMessage as ReturnType<typeof vi.fn>).mockResolvedValue([
        'is_scam',
        'tagged',
      ]);

      await useCase.removeTags('123', ['is_scam']);

      expect(tagManager.getTagsOnMessage).toHaveBeenCalledWith(123);
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['tagged']);
    });

    it('does not write when none of the requested tags are present (no false success)', async () => {
      (tagManager.getTagsOnMessage as ReturnType<typeof vi.fn>).mockResolvedValue([
        'is_scam',
        'tagged',
      ]);

      await useCase.removeTags('123', ['spf_fail']);

      expect(tagManager.setTagsOnMessage).not.toHaveBeenCalled();
    });

    it('does not write when the message has no tags at all', async () => {
      (tagManager.getTagsOnMessage as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await useCase.removeTags('123', ['is_scam']);

      expect(tagManager.setTagsOnMessage).not.toHaveBeenCalled();
    });
  });

  describe('execute() append mode (replaceTags: false)', () => {
    it('appends to existing tags instead of replacing them', async () => {
      (tagManager.getTagsOnMessage as ReturnType<typeof vi.fn>).mockResolvedValue(['is_scam']);

      const result = await useCase.execute('123', ['tagged'], { createMissingTags: true });

      expect(tagManager.getTagsOnMessage).toHaveBeenCalledWith(123);
      // Regression: with the [] placeholder this was called with ['tagged'] only,
      // silently dropping the pre-existing 'is_scam'
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_scam', 'tagged']);
      expect(result.appliedTags).toEqual(['tagged']);
    });

    it('deduplicates tags already present on the message', async () => {
      (tagManager.getTagsOnMessage as ReturnType<typeof vi.fn>).mockResolvedValue(['tagged']);

      await useCase.execute('123', ['tagged'], { createMissingTags: true });

      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['tagged']);
    });

    it('does not read current tags in replace mode', async () => {
      await useCase.execute('123', ['tagged'], { replaceTags: true, createMissingTags: true });

      expect(tagManager.getTagsOnMessage).not.toHaveBeenCalled();
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['tagged']);
    });
  });
});
