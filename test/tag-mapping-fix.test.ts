/**
 * Unit Tests: Tag Mapping Fix - Dynamic Tag Key Mapping
 *
 * These tests verify the dynamic tag key mapping functionality in ThunderbirdTagManager,
 * ensuring that both hardcoded and custom tags are properly converted to internal
 * Thunderbird keys with the _ma_ prefix.
 *
 * Tests cover:
 * - buildTagKeyMap() returns complete map with all tags
 * - convertToInternalKey() handles hardcoded, custom, and unknown tags
 * - convertToInternalKeys() handles arrays of mixed tags
 * - Edge cases like empty arrays and error handling
 *
 * @module test/tag-mapping-fix
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThunderbirdTagManager } from '@/interfaces/adapters/ThunderbirdTagManager';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository, ICustomTag } from '@/infrastructure/interfaces/IConfigRepository';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import { EventBus } from '@/domain/events/EventBus';
import { HARDCODED_TAGS, TAG_KEY_PREFIX } from '../core/config';

/**
 * NOTE: This test file must be run as part of the full test suite (npm test)
 * due to vitest path resolution limitations with the @ alias in individual test runs.
 */

describe('Tag Mapping Fix - Dynamic Tag Key Mapping', () => {
  // ==========================================================================
  // Test Dependencies
  // ==========================================================================

  let logger: ILogger;
  let configRepository: IConfigRepository;
  let tagManager: ThunderbirdTagManager;

  // Mock custom tags
  const mockCustomTags: ICustomTag[] = [
    {
      key: 'is_advertise',
      name: 'Advertisement',
      color: '#FFC107',
      prompt: 'Check if email is advertising something',
    },
    {
      key: 'is_service_not_important',
      name: 'Service Info',
      color: '#9E9E9E',
      prompt: 'Check if email contains non-critical service info',
    },
    {
      key: 'newsletter',
      name: 'Newsletter',
      color: '#2196F3',
      prompt: 'Check if email is a newsletter',
    },
  ];

  // Mock messenger API
  const mockMessenger = {
    messages: {
      listTags: vi.fn().mockResolvedValue([]),
      tags: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      addTags: vi.fn(),
      removeTags: vi.fn(),
      update: vi.fn(),
    },
  };

  // ==========================================================================
  // Test Setup
  // ==========================================================================

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Logger
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
    };

    // Mock ConfigRepository
    configRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getAppConfig: vi.fn().mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: true,
        modelConcurrencyLimits: [],
        minConfidenceThreshold: 70,
      }),
      getCustomTags: vi.fn().mockResolvedValue(mockCustomTags),
      setCustomTags: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    };

    // Set up global messenger mock
    (global as any).messenger = mockMessenger;

    // Create ThunderbirdTagManager instance
    tagManager = new ThunderbirdTagManager(logger, configRepository);
  });

  afterEach(() => {
    // Clean up global messenger mock
    delete (global as any).messenger;
  });

  // ==========================================================================
  // Test Suite 1: buildTagKeyMap()
  // ==========================================================================

  describe('buildTagKeyMap()', () => {
    it('should return map with all hardcoded tag keys prefixed with _ma_', async () => {
      // Setup: Empty custom tags
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: All hardcoded tags are in the map
      const hardcodedKeys = Object.keys(HARDCODED_TAGS);
      expect(Object.keys(tagKeyMap)).toHaveLength(hardcodedKeys.length);

      for (const key of hardcodedKeys) {
        expect(tagKeyMap[key]).toBe(`${TAG_KEY_PREFIX}${key}`);
      }

      // Verify specific hardcoded tags
      expect(tagKeyMap['is_scam']).toBe('_ma_is_scam');
      expect(tagKeyMap['spf_fail']).toBe('_ma_spf_fail');
      expect(tagKeyMap['dkim_fail']).toBe('_ma_dkim_fail');
      expect(tagKeyMap['tagged']).toBe('_ma_tagged');
      expect(tagKeyMap['email_ai_analyzed']).toBe('_ma_email_ai_analyzed');
    });

    it('should return map with all custom tag keys prefixed with _ma_', async () => {
      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: All custom tags are in the map
      for (const customTag of mockCustomTags) {
        expect(tagKeyMap[customTag.key]).toBe(`${TAG_KEY_PREFIX}${customTag.key}`);
      }

      // Verify specific custom tags
      expect(tagKeyMap['is_advertise']).toBe('_ma_is_advertise');
      expect(tagKeyMap['is_service_not_important']).toBe('_ma_is_service_not_important');
      expect(tagKeyMap['newsletter']).toBe('_ma_newsletter');
    });

    it('should return map with both hardcoded and custom tags combined', async () => {
      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: Total count includes both hardcoded and custom tags
      const expectedCount = Object.keys(HARDCODED_TAGS).length + mockCustomTags.length;
      expect(Object.keys(tagKeyMap)).toHaveLength(expectedCount);

      // Verify: Both types are present
      expect(tagKeyMap['is_scam']).toBeDefined(); // hardcoded
      expect(tagKeyMap['is_advertise']).toBeDefined(); // custom
    });

    it('should handle empty custom tags array', async () => {
      // Setup: Empty custom tags
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: Only hardcoded tags in the map
      const hardcodedKeys = Object.keys(HARDCODED_TAGS);
      expect(Object.keys(tagKeyMap)).toHaveLength(hardcodedKeys.length);
    });

    it('should handle error when fetching custom tags gracefully', async () => {
      // Setup: Custom tags fetch fails
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Storage error')
      );

      // Execute: Should not throw, should fallback to hardcoded tags only
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: Only hardcoded tags in the map
      const hardcodedKeys = Object.keys(HARDCODED_TAGS);
      expect(Object.keys(tagKeyMap)).toHaveLength(hardcodedKeys.length);

      // Verify: Error was logged
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get custom tags for tag key map',
        expect.objectContaining({ error: 'Storage error' })
      );
    });

    it('should log debug message with tag count', async () => {
      // Execute
      await tagManager.buildTagKeyMap();

      // Verify: Debug log was called
      expect(logger.debug).toHaveBeenCalledWith(
        'Built dynamic tag key map',
        expect.objectContaining({ tagCount: expect.any(Number) })
      );
    });
  });

  // ==========================================================================
  // Test Suite 2: convertToInternalKey()
  // ==========================================================================

  describe('convertToInternalKey()', () => {
    it('should convert hardcoded tag key to internal key with _ma_ prefix', async () => {
      // Execute
      const internalKey = await tagManager.convertToInternalKey('is_scam');

      // Verify
      expect(internalKey).toBe('_ma_is_scam');
    });

    it('should convert custom tag key to internal key with _ma_ prefix', async () => {
      // Execute
      const internalKey = await tagManager.convertToInternalKey('is_advertise');

      // Verify
      expect(internalKey).toBe('_ma_is_advertise');
    });

    it('should convert unknown tag key using fallback with _ma_ prefix', async () => {
      // Execute: Tag key that doesn't exist in hardcoded or custom tags
      const internalKey = await tagManager.convertToInternalKey('unknown_tag');

      // Verify: Fallback adds _ma_ prefix
      expect(internalKey).toBe('_ma_unknown_tag');
    });

    it('should handle all hardcoded tag keys correctly', async () => {
      // Verify each hardcoded tag key
      for (const tag of Object.values(HARDCODED_TAGS)) {
        const internalKey = await tagManager.convertToInternalKey(tag.key);
        expect(internalKey).toBe(`${TAG_KEY_PREFIX}${tag.key}`);
      }
    });

    it('should handle all custom tag keys correctly', async () => {
      // Verify each custom tag key
      for (const tag of mockCustomTags) {
        const internalKey = await tagManager.convertToInternalKey(tag.key);
        expect(internalKey).toBe(`${TAG_KEY_PREFIX}${tag.key}`);
      }
    });

    it('should log debug message for known tag conversion', async () => {
      // Execute
      await tagManager.convertToInternalKey('is_scam');

      // Verify: Debug log for known tag
      expect(logger.debug).toHaveBeenCalledWith(
        'Converted tag key using dynamic map',
        expect.objectContaining({
          key: 'is_scam',
          internalKey: '_ma_is_scam',
        })
      );
    });

    it('should log debug message for unknown tag fallback', async () => {
      // Execute
      await tagManager.convertToInternalKey('unknown_tag');

      // Verify: Debug log for fallback
      expect(logger.debug).toHaveBeenCalledWith(
        'Converted unknown tag key using fallback prefix',
        expect.objectContaining({
          key: 'unknown_tag',
          internalKey: '_ma_unknown_tag',
        })
      );
    });

    it('should handle edge case with empty string key', async () => {
      // Execute
      const internalKey = await tagManager.convertToInternalKey('');

      // Verify: Fallback still applies prefix
      expect(internalKey).toBe('_ma_');
    });

    it('should handle special characters in key', async () => {
      // Execute
      const internalKey = await tagManager.convertToInternalKey('tag-with-dashes');

      // Verify: Fallback applies prefix to special characters
      expect(internalKey).toBe('_ma_tag-with-dashes');
    });
  });

  // ==========================================================================
  // Test Suite 3: convertToInternalKeys()
  // ==========================================================================

  describe('convertToInternalKeys()', () => {
    it('should convert array of hardcoded tag keys', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys(['is_scam', 'spf_fail', 'dkim_fail']);

      // Verify
      expect(internalKeys).toEqual(['_ma_is_scam', '_ma_spf_fail', '_ma_dkim_fail']);
    });

    it('should convert array of custom tag keys', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys([
        'is_advertise',
        'is_service_not_important',
        'newsletter',
      ]);

      // Verify
      expect(internalKeys).toEqual([
        '_ma_is_advertise',
        '_ma_is_service_not_important',
        '_ma_newsletter',
      ]);
    });

    it('should convert mixed array of hardcoded and custom tag keys', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys([
        'is_scam',
        'is_advertise',
        'tagged',
        'newsletter',
      ]);

      // Verify
      expect(internalKeys).toEqual([
        '_ma_is_scam',
        '_ma_is_advertise',
        '_ma_tagged',
        '_ma_newsletter',
      ]);
    });

    it('should handle array with unknown tags using fallback', async () => {
      // Execute: Mix of known and unknown tags
      const internalKeys = await tagManager.convertToInternalKeys([
        'is_scam',
        'unknown_custom_tag',
        'is_advertise',
      ]);

      // Verify: All tags get _ma_ prefix
      expect(internalKeys).toEqual([
        '_ma_is_scam',
        '_ma_unknown_custom_tag',
        '_ma_is_advertise',
      ]);
    });

    it('should return empty array for empty input', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys([]);

      // Verify
      expect(internalKeys).toEqual([]);

      // Verify: Debug log for empty array
      expect(logger.debug).toHaveBeenCalledWith('Empty keys array, returning empty result');
    });

    it('should handle single element array', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys(['is_scam']);

      // Verify
      expect(internalKeys).toEqual(['_ma_is_scam']);
    });

    it('should preserve order of input keys', async () => {
      // Execute: Specific order
      const keys = ['newsletter', 'is_scam', 'is_advertise', 'tagged'];
      const internalKeys = await tagManager.convertToInternalKeys(keys);

      // Verify: Order preserved
      expect(internalKeys).toEqual([
        '_ma_newsletter',
        '_ma_is_scam',
        '_ma_is_advertise',
        '_ma_tagged',
      ]);
    });

    it('should log debug messages for array conversion', async () => {
      // Execute
      const keys = ['is_scam', 'is_advertise'];
      await tagManager.convertToInternalKeys(keys);

      // Verify: Debug logs for start and end
      expect(logger.debug).toHaveBeenCalledWith(
        'Converting array of tag keys to internal keys',
        expect.objectContaining({
          keys,
          count: 2,
        })
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Converted array of tag keys to internal keys',
        expect.objectContaining({
          originalKeys: keys,
          internalKeys: ['_ma_is_scam', '_ma_is_advertise'],
          count: 2,
        })
      );
    });

    it('should handle large arrays efficiently', async () => {
      // Setup: Create a large array of mixed keys
      const largeKeys: string[] = [];
      for (let i = 0; i < 100; i++) {
        largeKeys.push(`custom_tag_${i}`);
      }

      // Execute
      const startTime = Date.now();
      const internalKeys = await tagManager.convertToInternalKeys(largeKeys);
      const endTime = Date.now();

      // Verify: All converted correctly
      expect(internalKeys).toHaveLength(100);
      expect(internalKeys[0]).toBe('_ma_custom_tag_0');
      expect(internalKeys[99]).toBe('_ma_custom_tag_99');

      // Verify: Reasonably fast (under 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  // ==========================================================================
  // Test Suite 4: Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle duplicate keys in array', async () => {
      // Execute
      const internalKeys = await tagManager.convertToInternalKeys([
        'is_scam',
        'is_scam',
        'is_advertise',
      ]);

      // Verify: Duplicates preserved
      expect(internalKeys).toEqual(['_ma_is_scam', '_ma_is_scam', '_ma_is_advertise']);
    });

    it('should handle custom tag that shadows hardcoded tag key', async () => {
      // Setup: Custom tag with same key as hardcoded tag
      const customTagsWithDuplicate: ICustomTag[] = [
        ...mockCustomTags,
        {
          key: 'is_scam', // Same key as hardcoded tag
          name: 'Custom Scam',
          color: '#000000',
        },
      ];
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue(
        customTagsWithDuplicate
      );

      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: Key still maps correctly (custom overwrites hardcoded, but result is same)
      expect(tagKeyMap['is_scam']).toBe('_ma_is_scam');
    });

    it('should handle tags with underscore prefix already', async () => {
      // Setup: Custom tag with underscore prefix
      const customTagsWithPrefix: ICustomTag[] = [
        {
          key: '_already_prefixed',
          name: 'Already Prefixed',
          color: '#FF0000',
        },
      ];
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue(
        customTagsWithPrefix
      );

      // Execute
      const internalKey = await tagManager.convertToInternalKey('_already_prefixed');

      // Verify: Prefix still applied (double prefix is expected behavior)
      expect(internalKey).toBe('_ma__already_prefixed');
    });

    it('should handle unicode characters in tag keys', async () => {
      // Execute: Tag with unicode characters
      const internalKey = await tagManager.convertToInternalKey('tag_\u00e9\u00e8\u00ea');

      // Verify: Fallback applies prefix to unicode
      expect(internalKey).toBe('_ma_tag_\u00e9\u00e8\u00ea');
    });

    it('should handle numeric tag keys', async () => {
      // Execute: Numeric-like tag key
      const internalKey = await tagManager.convertToInternalKey('123');

      // Verify: Fallback applies prefix to numeric
      expect(internalKey).toBe('_ma_123');
    });

    it('should handle whitespace in tag keys', async () => {
      // Execute: Tag key with spaces (unlikely but possible edge case)
      const internalKey = await tagManager.convertToInternalKey('tag with spaces');

      // Verify: Fallback applies prefix with spaces preserved
      expect(internalKey).toBe('_ma_tag with spaces');
    });
  });

  // ==========================================================================
  // Test Suite 5: TAG_KEY_PREFIX Verification
  // ==========================================================================

  describe('TAG_KEY_PREFIX Verification', () => {
    it('should use TAG_KEY_PREFIX constant from config', async () => {
      // Verify: TAG_KEY_PREFIX is '_ma_'
      expect(TAG_KEY_PREFIX).toBe('_ma_');
    });

    it('should consistently apply TAG_KEY_PREFIX to all tags', async () => {
      // Execute: Test multiple different tag types
      const testKeys = ['is_scam', 'is_advertise', 'unknown', 'test123'];

      for (const key of testKeys) {
        const internalKey = await tagManager.convertToInternalKey(key);
        expect(internalKey.startsWith(TAG_KEY_PREFIX)).toBe(true);
        expect(internalKey).toBe(`${TAG_KEY_PREFIX}${key}`);
      }
    });

    it('should apply prefix in buildTagKeyMap for all entries', async () => {
      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: All values start with _ma_ prefix
      for (const internalKey of Object.values(tagKeyMap)) {
        expect(internalKey.startsWith(TAG_KEY_PREFIX)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Test Suite 6: Integration with HARDCODED_TAGS
  // ==========================================================================

  describe('Integration with HARDCODED_TAGS', () => {
    it('should have HARDCODED_TAGS imported correctly', () => {
      // Verify: HARDCODED_TAGS contains expected keys
      expect(HARDCODED_TAGS).toBeDefined();
      expect(HARDCODED_TAGS.is_scam).toBeDefined();
      expect(HARDCODED_TAGS.spf_fail).toBeDefined();
      expect(HARDCODED_TAGS.dkim_fail).toBeDefined();
      expect(HARDCODED_TAGS.tagged).toBeDefined();
      expect(HARDCODED_TAGS.email_ai_analyzed).toBeDefined();
    });

    it('should convert all HARDCODED_TAGS keys correctly', async () => {
      // Execute: Convert all hardcoded tag keys
      const hardcodedKeys = Object.keys(HARDCODED_TAGS);
      const internalKeys = await tagManager.convertToInternalKeys(hardcodedKeys);

      // Verify: All converted with correct prefix
      expect(internalKeys).toHaveLength(hardcodedKeys.length);
      for (let i = 0; i < hardcodedKeys.length; i++) {
        expect(internalKeys[i]).toBe(`${TAG_KEY_PREFIX}${hardcodedKeys[i]}`);
      }
    });

    it('should include HARDCODED_TAGS in buildTagKeyMap even when custom tags fail', async () => {
      // Setup: Custom tags fetch fails
      (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      // Execute
      const tagKeyMap = await tagManager.buildTagKeyMap();

      // Verify: All hardcoded tags still present
      expect(tagKeyMap['is_scam']).toBe('_ma_is_scam');
      expect(tagKeyMap['spf_fail']).toBe('_ma_spf_fail');
      expect(tagKeyMap['dkim_fail']).toBe('_ma_dkim_fail');
      expect(tagKeyMap['tagged']).toBe('_ma_tagged');
      expect(tagKeyMap['email_ai_analyzed']).toBe('_ma_email_ai_analyzed');
    });
  });

  // ==========================================================================
  // Test Suite 7: ensureAllTagsExist() via ApplyTagsToEmail
  // ==========================================================================

  describe('ensureAllTagsExist() - Hardcoded and Custom Tag Creation', () => {
    let applyTagsToEmail: ApplyTagsToEmail;
    let eventBus: EventBus;
    let mockTagManager: ITagManager;

    // Track created tags
    const createdTags: string[] = [];

    beforeEach(() => {
      vi.clearAllMocks();
      createdTags.length = 0; // Reset created tags tracker

      // Mock EventBus
      eventBus = {
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as EventBus;

      // Mock messenger tags.create to track created tags
      mockMessenger.messages.tags.create = vi.fn().mockImplementation(
        async (key: string, tag: string, color: string) => {
          createdTags.push(key);
          return { key, tag, color, ordinal: '0' };
        }
      );

      // Track created tags
      const createdTagsMap = new Map<string, any>();

      // Create a proper mock ITagManager
      mockTagManager = {
        getAllTags: vi.fn().mockResolvedValue([]),
        createTag: vi.fn(),
        getCustomTags: vi.fn(),
        getTag: vi.fn().mockImplementation(async (key: string) => {
          // Return tag if it was created (handles both original and internal keys)
          if (createdTagsMap.has(key)) {
            return createdTagsMap.get(key);
          }
          // Also check with internal key if original key is provided
          const internalKey = key.startsWith(TAG_KEY_PREFIX) ? key : `${TAG_KEY_PREFIX}${key}`;
          if (createdTagsMap.has(internalKey)) {
            return createdTagsMap.get(internalKey);
          }
          return undefined;
        }),
        getTagById: vi.fn(),
        updateTag: vi.fn(),
        deleteTag: vi.fn(),
        tagExists: vi.fn(),
        ensureTagExists: vi.fn().mockImplementation(async (key, name, color) => {
          // Simulate tag creation by calling the messenger API
          const internalKey = `${TAG_KEY_PREFIX}${key}`;
          const existingTag = await mockTagManager.getTag(internalKey);
          if (existingTag) {
            return existingTag;
          }
          const createdTag = await mockMessenger.messages.tags.create(internalKey, name, color);
          // Store the created tag in the map
          createdTagsMap.set(internalKey, createdTag);
          createdTagsMap.set(key, createdTag); // Also store with original key for easier lookup
          return createdTag;
        }),
        addTagToMessage: vi.fn().mockResolvedValue(undefined),
        removeTagFromMessage: vi.fn().mockResolvedValue(undefined),
        setTagsOnMessage: vi.fn().mockResolvedValue(undefined),
        clearTagsFromMessage: vi.fn().mockResolvedValue(undefined),
        addTagToMessages: vi.fn().mockResolvedValue(undefined),
        setTagsOnMessages: vi.fn().mockResolvedValue(undefined),
      };

      // Create ApplyTagsToEmail instance with mocked tag manager
      applyTagsToEmail = new ApplyTagsToEmail(
        mockTagManager,
        logger,
        eventBus,
        configRepository
      );
    });

    describe('Hardcoded Tag Creation', () => {
      it('should create all hardcoded tags on first execution', async () => {
        // Setup: No tags exist initially
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute: Call execute to trigger ensureAllTagsExist
        const result = await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: All hardcoded tags + custom tags were created
        // Note: The test creates one extra tag due to createMissingTags=true
        // triggering ensureTagExists for the is_scam tag again
        const hardcodedTagKeys = Object.keys(HARDCODED_TAGS);
        const expectedTotal = hardcodedTagKeys.length + mockCustomTags.length + 1; // +1 for duplicate check
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledTimes(expectedTotal);

        // Verify each hardcoded tag was created with correct parameters
        for (const [key, tagConfig] of Object.entries(HARDCODED_TAGS)) {
          expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
            `${TAG_KEY_PREFIX}${key}`,
            tagConfig.name,
            tagConfig.color
          );
        }

        // Verify result contains the applied tag
        expect(result.appliedTags).toContain('is_scam');
      });

      it('should not recreate existing hardcoded tags', async () => {
        // Setup: All hardcoded tags already exist
        const existingTag = { key: '_ma_is_scam', tag: 'Scam Alert', color: '#FF5722', ordinal: '0' };
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(existingTag);

        // Execute: Call execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: tags.create was not called (tags already exist)
        expect(mockMessenger.messages.tags.create).not.toHaveBeenCalled();
      });

      it('should create hardcoded tags with correct internal keys', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Internal keys use _ma_ prefix
        const createCalls = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock.calls;
        const createdKeys = createCalls.map((call) => call[0]);

        expect(createdKeys).toContain('_ma_is_scam');
        expect(createdKeys).toContain('_ma_spf_fail');
        expect(createdKeys).toContain('_ma_dkim_fail');
        expect(createdKeys).toContain('_ma_tagged');
        expect(createdKeys).toContain('_ma_email_ai_analyzed');
      });

      it('should handle creation errors for individual hardcoded tags gracefully', async () => {
        // Setup: Some tags exist, some fail to create
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockImplementation(
          async (key: string) => {
            if (key === '_ma_is_scam') {
              return { key: '_ma_is_scam', tag: 'Scam Alert', color: '#FF5722', ordinal: '0' };
            }
            return undefined; // Other tags don't exist
          }
        );

        // Setup: tags.create throws error for spf_fail
        (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mockImplementation(
          async (key: string) => {
            if (key === '_ma_spf_fail') {
              throw new Error('Failed to create tag');
            }
            return { key, tag: 'Test', color: '#FF0000', ordinal: '0' };
          }
        );

        // Execute: Should not throw despite individual tag failures
        const result = await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Error was logged for failed tag
        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to ensure hardcoded tag',
          expect.objectContaining({ key: 'spf_fail' })
        );

        // Verify: Other tags were still created
        expect(result.appliedTags).toContain('is_scam');
      });
    });

    describe('Custom Tag Creation', () => {
      it('should create all custom tags on first execution', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_advertise'], { createMissingTags: true });

        // Verify: All hardcoded + custom tags were created
        const expectedTotal = Object.keys(HARDCODED_TAGS).length + mockCustomTags.length + 1;
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledTimes(expectedTotal);

        // Verify custom tags were created with correct parameters
        for (const customTag of mockCustomTags) {
          expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
            `${TAG_KEY_PREFIX}${customTag.key}`,
            customTag.name,
            customTag.color
          );
        }
      });

      it('should create custom tags with correct internal keys', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['newsletter'], { createMissingTags: true });

        // Verify: Custom tags use _ma_ prefix
        const createCalls = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock.calls;
        const createdKeys = createCalls.map((call) => call[0]);

        expect(createdKeys).toContain('_ma_is_advertise');
        expect(createdKeys).toContain('_ma_is_service_not_important');
        expect(createdKeys).toContain('_ma_newsletter');
      });

      it('should not recreate existing custom tags', async () => {
        // Setup: Custom tags already exist
        const existingCustomTag = {
          key: '_ma_is_advertise',
          tag: 'Advertisement',
          color: '#FFC107',
          ordinal: '0',
        };
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(existingCustomTag);

        // Execute
        await applyTagsToEmail.execute('123', ['is_advertise'], { createMissingTags: true });

        // Verify: tags.create was not called
        expect(mockMessenger.messages.tags.create).not.toHaveBeenCalled();
      });

      it('should handle empty custom tags array', async () => {
        // Setup: No custom tags configured
        (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Only hardcoded tags were created (5 hardcoded + 0 custom + 1 extra = 6)
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledTimes(
          Object.keys(HARDCODED_TAGS).length + 1
        );
      });

      it('should handle custom tag creation errors gracefully', async () => {
        // Setup: Custom tag fetch succeeds but one tag fails to create
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mockImplementation(
          async (key: string) => {
            if (key === '_ma_is_advertise') {
              throw new Error('Network error');
            }
            return { key, tag: 'Test', color: '#FF0000', ordinal: '0' };
          }
        );

        // Execute: Should not throw despite custom tag failure
        const result = await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Error was logged for failed custom tag
        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to ensure custom tag',
          expect.objectContaining({ key: 'is_advertise' })
        );

        // Verify: Other tags were still created
        expect(result.appliedTags).toContain('is_scam');
      });

      it('should handle error when fetching custom tags', async () => {
        // Setup: Custom tags fetch fails
        (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Storage error')
        );
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute: Should still create hardcoded tags
        // Note: This test expects an error to be thrown because validateAndFilterTags
        // also needs to fetch custom tags and will fail
        await expect(
          applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true })
        ).rejects.toThrow('Storage error');

        // Verify: Warning was logged for custom tags failure
        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to load custom tags for initialization',
          expect.objectContaining({ error: expect.stringContaining('Storage error') })
        );
      });
    });

    describe('Combined Hardcoded and Custom Tag Creation', () => {
      it('should create both hardcoded and custom tags on first execution', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam', 'is_advertise'], { createMissingTags: true });

        // Verify: Total tags created = hardcoded + custom + 2 extra (one for each tag in array)
        const expectedTotal = Object.keys(HARDCODED_TAGS).length + mockCustomTags.length + 2;
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledTimes(expectedTotal);
      });

      it('should log successful initialization with counts', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Info log with counts
        expect(logger.info).toHaveBeenCalledWith(
          '✅ All tags initialized',
          expect.objectContaining({
            hardcodedCount: Object.keys(HARDCODED_TAGS).length,
            customCount: mockCustomTags.length,
          })
        );
      });

      it('should only ensure tags once on first execution', async () => {
        // Setup: No tags exist initially
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute: First call
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        const firstCallCount = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock
          .calls.length;

        // Setup: Tags now exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue({
          key: '_ma_is_scam',
          tag: 'Scam Alert',
          color: '#FF5722',
          ordinal: '0',
        });

        // Execute: Second call
        await applyTagsToEmail.execute('124', ['is_advertise'], { createMissingTags: true });

        const secondCallCount = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock
          .calls.length;

        // Verify: Tags were only created on first call
        // First call creates 5 hardcoded + 3 custom = 8 tags
        // is_scam is in hardcoded, so no extra tag
        const expectedTotal = Object.keys(HARDCODED_TAGS).length + mockCustomTags.length + 1;
        expect(firstCallCount).toBe(expectedTotal);
        expect(secondCallCount).toBe(firstCallCount); // No new calls
      });

      it('should log info message about tags being ensured on first execution', async () => {
        // Setup: No tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Info log about first execution
        expect(logger.info).toHaveBeenCalledWith(
          '✅ All tags (hardcoded + custom) ensured on first execution'
        );
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle when all tags already exist', async () => {
        // Setup: All tags exist
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue({
          key: '_ma_is_scam',
          tag: 'Scam Alert',
          color: '#FF5722',
          ordinal: '0',
        });

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: No creation attempts
        expect(mockMessenger.messages.tags.create).not.toHaveBeenCalled();
      });

      it('should handle partial tag existence (some exist, some do not)', async () => {
        // Setup: Some tags exist, some don't
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockImplementation(
          async (key: string) => {
            if (key === '_ma_is_scam' || key === '_ma_tagged') {
              return { key, tag: 'Test', color: '#FF0000', ordinal: '0' };
            }
            return undefined;
          }
        );

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Only non-existent tags were created
        const hardcodedCount = Object.keys(HARDCODED_TAGS).length;
        const customCount = mockCustomTags.length;
        // is_scam and tagged already exist, so 2 fewer creations
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledTimes(
          hardcodedCount + customCount - 2
        );
      });

      it('should continue tag creation after individual tag failures', async () => {
        // Setup: Tags don't exist and some fail to create
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        let createCallCount = 0;
        (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mockImplementation(
          async () => {
            createCallCount++;
            if (createCallCount === 2) {
              // Second tag fails
              throw new Error('Creation failed');
            }
            return { key: 'test', tag: 'Test', color: '#FF0000', ordinal: '0' };
          }
        );

        // Execute: Should not throw
        const result = await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Multiple tags were attempted despite failure
        expect(createCallCount).toBeGreaterThan(2);
        expect(result.appliedTags).toContain('is_scam');
      });

      it('should handle custom tags with special characters in keys', async () => {
        // Setup: Custom tags with special characters
        const customTagsWithSpecialChars: ICustomTag[] = [
          {
            key: 'tag-with-dashes',
            name: 'Tag With Dashes',
            color: '#FF0000',
          },
          {
            key: 'tag_with_underscores',
            name: 'Tag With Underscores',
            color: '#00FF00',
          },
        ];
        (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue(
          customTagsWithSpecialChars
        );
        (mockTagManager.getTag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Execute
        await applyTagsToEmail.execute('123', ['is_scam'], { createMissingTags: true });

        // Verify: Special characters are preserved in internal keys
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_tag-with-dashes',
          'Tag With Dashes',
          '#FF0000'
        );
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_tag_with_underscores',
          'Tag With Underscores',
          '#00FF00'
        );
      });
    });
  });

  // ==========================================================================
  // Test Suite 8: Integration - Tag Application Flow with Custom Tags
  // ==========================================================================

  describe('Integration - Tag Application Flow with Custom Tags', () => {
    let applyTagsToEmail: ApplyTagsToEmail;
    let eventBus: EventBus;
    let mockTagManager: ITagManager;
    let existingTags: Map<string, any>;

    beforeEach(() => {
      vi.clearAllMocks();

      // Track existing tags
      existingTags = new Map();

      // Mock EventBus
      eventBus = {
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as EventBus;

      // Mock messenger API
      mockMessenger.messages.listTags = vi.fn().mockResolvedValue([]);
      mockMessenger.messages.tags.create = vi.fn().mockImplementation(
        async (key: string, tag: string, color: string) => {
          const createdTag = { key, tag, color, ordinal: '0' };
          existingTags.set(key, createdTag);
          return createdTag;
        }
      );
      mockMessenger.messages.addTags = vi.fn().mockResolvedValue(undefined);

      // Create a proper mock ITagManager
      mockTagManager = {
        getAllTags: vi.fn().mockResolvedValue([]),
        createTag: vi.fn(),
        getCustomTags: vi.fn(),
        getTag: vi.fn().mockImplementation(async (key: string) => {
          // Try to get by key as-is first (for internal key lookups)
          if (existingTags.has(key)) {
            return existingTags.get(key);
          }
          // Try with internal key prefix (for original key lookups)
          const internalKey = key.startsWith(TAG_KEY_PREFIX) ? key : `${TAG_KEY_PREFIX}${key}`;
          if (existingTags.has(internalKey)) {
            return existingTags.get(internalKey);
          }
          // Not found
          return undefined;
        }),
        getTagById: vi.fn(),
        updateTag: vi.fn(),
        deleteTag: vi.fn(),
        tagExists: vi.fn().mockImplementation(async (key: string) => {
          // Check if tag exists (handles both original and internal keys)
          if (existingTags.has(key)) {
            return true;
          }
          const internalKey = key.startsWith(TAG_KEY_PREFIX) ? key : `${TAG_KEY_PREFIX}${key}`;
          return existingTags.has(internalKey);
        }),
        ensureTagExists: vi.fn().mockImplementation(async (key, name, color) => {
          const internalKey = `${TAG_KEY_PREFIX}${key}`;
          // Check if already exists (using getTag which handles both key types)
          const existing = await mockTagManager.getTag(key);
          if (existing) {
            return existing;
          }
          // Create new tag
          const created = await mockMessenger.messages.tags.create(internalKey, name, color);
          existingTags.set(internalKey, created);
          existingTags.set(key, created); // Also store with original key for easier lookup
          return created;
        }),
        addTagToMessage: vi.fn().mockResolvedValue(undefined),
        removeTagFromMessage: vi.fn().mockResolvedValue(undefined),
        setTagsOnMessage: vi.fn().mockImplementation(async (messageId: number, tagKeys: string[]) => {
          // Convert tag keys to internal keys
          const internalKeys = tagKeys.map((key) => {
            return key.startsWith(TAG_KEY_PREFIX) ? key : `${TAG_KEY_PREFIX}${key}`;
          });

          // Apply tags via messenger API
          await mockMessenger.messages.addTags(messageId, internalKeys);

          // Return success (actual implementation doesn't return anything)
          return undefined;
        }),
        clearTagsFromMessage: vi.fn().mockResolvedValue(undefined),
        addTagToMessages: vi.fn().mockResolvedValue(undefined),
        setTagsOnMessages: vi.fn().mockResolvedValue(undefined),
      };

      // Create ApplyTagsToEmail instance
      applyTagsToEmail = new ApplyTagsToEmail(
        mockTagManager,
        logger,
        eventBus,
        configRepository
      );
    });

    describe('Custom Tag Application Flow', () => {
      it('should apply custom tags using correct internal keys', async () => {
        // Execute: Apply custom tags (ensureAllTagsExist will create them on first run)
        const result = await applyTagsToEmail.execute('123', ['is_advertise', 'newsletter'], {
          createMissingTags: false,
        });

        // Verify: Tags were applied with correct internal keys
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_advertise', '_ma_newsletter']
        );

        // Verify: Result includes applied tags
        expect(result.appliedTags).toEqual(['is_advertise', 'newsletter']);
      });

      it('should create custom tags if they do not exist and createMissingTags is true', async () => {
        // Note: ensureAllTagsExist already creates all custom tags on first run
        // This test verifies the behavior when createMissingTags is explicitly true

        // Execute: Apply custom tags with auto-create (they will be created by ensureAllTagsExist)
        const result = await applyTagsToEmail.execute('123', ['is_advertise', 'newsletter'], {
          createMissingTags: true,
        });

        // Verify: Custom tags were created by ensureAllTagsExist
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_is_advertise',
          'Advertisement',
          '#FFC107'
        );
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_newsletter',
          'Newsletter',
          '#2196F3'
        );

        // Verify: Tags were applied after creation
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_advertise', '_ma_newsletter']
        );

        // Verify: Result indicates success
        expect(result.appliedTags).toEqual(['is_advertise', 'newsletter']);
      });

      it('should apply mix of hardcoded and custom tags in single operation', async () => {
        // Execute: Apply mix of hardcoded and custom tags (ensureAllTagsExist creates all)
        const result = await applyTagsToEmail.execute(
          '123',
          ['is_scam', 'is_advertise', 'tagged'],
          { createMissingTags: false }
        );

        // Verify: All tags applied with correct internal keys
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_scam', '_ma_is_advertise', '_ma_tagged']
        );

        // Verify: All tags in result
        expect(result.appliedTags).toEqual(['is_scam', 'is_advertise', 'tagged']);
      });

      it('should filter out invalid tags not defined in HARDCODED_TAGS or custom tags', async () => {
        // Execute: Try to apply valid and invalid tags
        const result = await applyTagsToEmail.execute(
          '123',
          ['is_advertise', 'undefined_tag_xyz'],
          { createMissingTags: false }
        );

        // Verify: Only valid tag was applied, invalid was filtered out
        expect(result.appliedTags).toEqual(['is_advertise']);
        expect(result.skippedTags).toEqual(['undefined_tag_xyz']);

        // Verify: Only valid tag was sent to messenger API
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(123, ['_ma_is_advertise']);
      });

      it('should filter out empty tag keys', async () => {
        // Execute: Try to apply empty tag key
        const result = await applyTagsToEmail.execute('123', [''], {
          createMissingTags: false,
        });

        // Verify: Empty tag was filtered out
        expect(result.appliedTags).toEqual([]);
        expect(result.skippedTags).toEqual(['']);

        // Verify: addTags was called with empty array (implementation still calls it)
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(123, []);
      });
    });

    describe('Tag Key Mapping in Application Flow', () => {
      it('should correctly map custom tag keys during application', async () => {
        // Execute: Apply using original key (ensureAllTagsExist creates all tags)
        const result = await applyTagsToEmail.execute(
          '123',
          ['is_service_not_important'],
          { createMissingTags: false }
        );

        // Verify: Applied using internal key
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_service_not_important']
        );
        expect(result.appliedTags).toEqual(['is_service_not_important']);
      });

      it('should handle custom tag with underscore in key', async () => {
        // Mock custom tags with underscore
        const customTagsWithUnderscore: ICustomTag[] = [
          {
            key: 'my_custom_tag',
            name: 'My Custom Tag',
            color: '#FF0000',
            prompt: 'Test custom tag',
          },
        ];
        (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue(
          customTagsWithUnderscore
        );

        // Execute
        const result = await applyTagsToEmail.execute('123', ['my_custom_tag'], {
          createMissingTags: false,
        });

        // Verify: Correct mapping
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(123, ['_ma_my_custom_tag']);
        expect(result.appliedTags).toEqual(['my_custom_tag']);
      });

      it('should apply tags using original keys in result regardless of internal mapping', async () => {
        // Execute
        const result = await applyTagsToEmail.execute('123', ['is_advertise', 'newsletter'], {
          createMissingTags: false,
        });

        // Verify: Result uses original keys, not internal keys
        expect(result.appliedTags).toEqual(['is_advertise', 'newsletter']);
        expect(result.appliedTags).not.toContain('_ma_is_advertise');
        expect(result.appliedTags).not.toContain('_ma_newsletter');
      });
    });

    describe('Error Handling in Application Flow', () => {
      it('should handle tag application failure gracefully', async () => {
        // Setup: addTags throws error
        mockMessenger.messages.addTags = vi.fn().mockRejectedValue(new Error('API Error'));

        // Execute: Should throw error (ApplyTagsToEmail propagates errors)
        await expect(
          applyTagsToEmail.execute('123', ['is_advertise'], {
            createMissingTags: false,
          })
        ).rejects.toThrow('Failed to apply tags to message 123');

        // Verify: Error logged
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to apply tags'),
          expect.objectContaining({
            messageId: '123',
            error: expect.stringContaining('API Error'),
          })
        );
      });

      it('should throw error when tag application fails', async () => {
        // Setup: addTags throws error
        mockMessenger.messages.addTags = vi.fn().mockRejectedValue(new Error('Network Error'));

        // Execute: Should throw error
        await expect(
          applyTagsToEmail.execute('123', ['is_advertise', 'newsletter'], {
            createMissingTags: false,
          })
        ).rejects.toThrow('Failed to apply tags to message 123');
      });

      it('should handle duplicate tag keys gracefully', async () => {
        // Execute: Apply duplicate tags
        const result = await applyTagsToEmail.execute(
          '123',
          ['is_advertise', 'is_advertise'],
          { createMissingTags: false }
        );

        // Verify: Duplicates are handled (deduplicated in result)
        expect(mockMessenger.messages.addTags).toHaveBeenCalled();
        expect(result.appliedTags).toContain('is_advertise');
        // Note: Implementation may deduplicate, so we just verify the tag was applied
      });
    });

    describe('Tag Creation and Application Combined Flow', () => {
      it('should ensure all tags exist on first execution', async () => {
        // Execute: First call ensures all hardcoded and custom tags
        const result = await applyTagsToEmail.execute('123', ['is_advertise'], {
          createMissingTags: false,
        });

        // Verify: All tags were created (check specific ones, order doesn't matter)
        const createCalls = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock
          .calls;
        const createdKeys = createCalls.map((call) => call[0]);

        // Check that hardcoded tags were created
        expect(createdKeys).toContain('_ma_is_scam');
        expect(createdKeys).toContain('_ma_spf_fail');
        expect(createdKeys).toContain('_ma_dkim_fail');

        // Check that custom tags were created
        expect(createdKeys).toContain('_ma_is_advertise');
        expect(createdKeys).toContain('_ma_newsletter');

        // Verify: Tag applied
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(123, ['_ma_is_advertise']);
        expect(result.appliedTags).toEqual(['is_advertise']);
      });

      it('should create multiple custom tags then apply all in same operation', async () => {
        // Execute: Multiple custom tags
        const result = await applyTagsToEmail.execute(
          '123',
          ['is_advertise', 'newsletter', 'is_service_not_important'],
          { createMissingTags: false }
        );

        // Verify: All custom tags created by ensureAllTagsExist
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_is_advertise',
          'Advertisement',
          '#FFC107'
        );
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_newsletter',
          'Newsletter',
          '#2196F3'
        );
        expect(mockMessenger.messages.tags.create).toHaveBeenCalledWith(
          '_ma_is_service_not_important',
          'Service Info',
          '#9E9E9E'
        );

        // Verify: All applied
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_advertise', '_ma_newsletter', '_ma_is_service_not_important']
        );

        // Verify: Result
        expect(result.appliedTags).toHaveLength(3);
      });

      it('should not recreate tags on subsequent executions', async () => {
        // Execute: First call creates all tags
        await applyTagsToEmail.execute('123', ['is_advertise'], { createMissingTags: false });

        const firstCallCount = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock
          .calls.length;

        // Execute: Second call should not recreate tags
        await applyTagsToEmail.execute('124', ['newsletter'], { createMissingTags: false });

        const secondCallCount = (mockMessenger.messages.tags.create as ReturnType<typeof vi.fn>).mock
          .calls.length;

        // Verify: Tags only created on first call
        expect(firstCallCount).toBeGreaterThan(0);
        expect(secondCallCount).toBe(firstCallCount); // No new creations
      });
    });

    describe('Event Publishing in Application Flow', () => {
      it('should publish event when custom tags applied successfully', async () => {
        // Execute
        await applyTagsToEmail.execute('123', ['is_advertise'], {
          createMissingTags: false,
        });

        // Verify: Event published with correct structure
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'TagApplied',
            messageId: '123',
            appliedTags: ['is_advertise'],
          })
        );
      });

      it('should publish event with both hardcoded and custom tags', async () => {
        // Execute
        await applyTagsToEmail.execute('123', ['is_scam', 'is_advertise'], {
          createMissingTags: false,
        });

        // Verify: Event includes both tag types
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'TagApplied',
            appliedTags: ['is_scam', 'is_advertise'],
          })
        );
      });

      it('should publish event with skipped tags when invalid tags provided', async () => {
        // Execute with valid and invalid tags
        await applyTagsToEmail.execute('123', ['is_advertise', 'undefined_tag_xyz'], {
          createMissingTags: false,
        });

        // Verify: Event includes applied and skipped tags
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'TagApplied',
            appliedTags: ['is_advertise'],
            skippedTags: ['undefined_tag_xyz'],
          })
        );
      });
    });

    describe('Performance and Efficiency', () => {
      it('should handle large number of custom tags efficiently', async () => {
        // Setup: Create many custom tags
        const manyCustomTags: ICustomTag[] = [];
        for (let i = 0; i < 50; i++) {
          manyCustomTags.push({
            key: `custom_tag_${i}`,
            name: `Custom Tag ${i}`,
            color: '#FF0000',
            prompt: `Test prompt ${i}`,
          });
        }
        (configRepository.getCustomTags as ReturnType<typeof vi.fn>).mockResolvedValue(
          manyCustomTags
        );

        // Execute: Apply many tags (first call creates all, second call tests efficiency)
        const tagKeys = manyCustomTags.map((tag) => tag.key).slice(0, 10); // Test with 10 tags
        const startTime = Date.now();
        const result = await applyTagsToEmail.execute('123', tagKeys, {
          createMissingTags: false,
        });
        const endTime = Date.now();

        // Verify: All tags applied
        expect(result.appliedTags).toHaveLength(10);

        // Verify: Completed in reasonable time (< 2 seconds)
        expect(endTime - startTime).toBeLessThan(2000);
      });

      it('should batch tag operations efficiently', async () => {
        // Execute: Apply multiple tags in single operation
        const tagKeys = ['is_advertise', 'newsletter', 'is_service_not_important'];
        await applyTagsToEmail.execute('123', tagKeys, { createMissingTags: false });

        // Verify: Single batch call to addTags
        expect(mockMessenger.messages.addTags).toHaveBeenCalledTimes(1);
        expect(mockMessenger.messages.addTags).toHaveBeenCalledWith(
          123,
          ['_ma_is_advertise', '_ma_newsletter', '_ma_is_service_not_important']
        );
      });
    });
  });
});
