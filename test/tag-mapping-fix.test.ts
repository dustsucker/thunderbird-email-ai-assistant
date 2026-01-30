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
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository, ICustomTag } from '@/infrastructure/interfaces/IConfigRepository';
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
});
