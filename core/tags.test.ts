import { describe, it, expect } from 'vitest';
import {
  isThunderbirdTag,
  isThunderbirdTagArray,
  isValidStorageCustomTags,
  checkTagExists,
  findThunderbirdTag,
} from './tags';
import { TAG_KEY_PREFIX, TAG_NAME_PREFIX } from './config';

describe('tags module', () => {
  describe('isThunderbirdTag', () => {
    it('should return true for valid ThunderbirdTag', () => {
      const validTag = {
        key: '$label1',
        tag: 'AI: Business',
        color: '#FF0000',
        ordinal: '1',
      };
      expect(isThunderbirdTag(validTag)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isThunderbirdTag(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isThunderbirdTag('string')).toBe(false);
      expect(isThunderbirdTag(123)).toBe(false);
      expect(isThunderbirdTag(undefined)).toBe(false);
    });

    it('should return false for missing key', () => {
      const invalidTag = {
        tag: 'AI: Business',
        color: '#FF0000',
        ordinal: '1',
      };
      expect(isThunderbirdTag(invalidTag)).toBe(false);
    });

    it('should return false for missing tag', () => {
      const invalidTag = {
        key: '$label1',
        color: '#FF0000',
        ordinal: '1',
      };
      expect(isThunderbirdTag(invalidTag)).toBe(false);
    });

    it('should return false for invalid color format', () => {
      const invalidTag = {
        key: '$label1',
        tag: 'AI: Business',
        color: 'red',
        ordinal: '1',
      };
      expect(isThunderbirdTag(invalidTag)).toBe(false);
    });

    it('should accept 3-digit hex color', () => {
      const validTag = {
        key: '$label1',
        tag: 'AI: Business',
        color: '#F00',
        ordinal: '1',
      };
      expect(isThunderbirdTag(validTag)).toBe(true);
    });

    it('should accept 6-digit hex color', () => {
      const validTag = {
        key: '$label1',
        tag: 'AI: Business',
        color: '#FF0000',
        ordinal: '1',
      };
      expect(isThunderbirdTag(validTag)).toBe(true);
    });
  });

  describe('isThunderbirdTagArray', () => {
    it('should return true for valid tag array', () => {
      const validTags = [
        {
          key: '$label1',
          tag: 'AI: Business',
          color: '#FF0000',
          ordinal: '1',
        },
        {
          key: '$label2',
          tag: 'AI: Newsletter',
          color: '#00FF00',
          ordinal: '2',
        },
      ];
      expect(isThunderbirdTagArray(validTags)).toBe(true);
    });

    it('should return false for non-array', () => {
      expect(isThunderbirdTagArray('not array')).toBe(false);
      expect(isThunderbirdTagArray(null)).toBe(false);
      expect(isThunderbirdTagArray({})).toBe(false);
    });

    it('should return false for array with invalid tag', () => {
      const invalidTags = [
        {
          key: '$label1',
          tag: 'AI: Business',
          color: '#FF0000',
          ordinal: '1',
        },
        {
          key: '$label2',
          tag: 'AI: Newsletter',
          color: 'invalid',
          ordinal: '2',
        },
      ];
      expect(isThunderbirdTagArray(invalidTags)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(isThunderbirdTagArray([])).toBe(true);
    });
  });

  describe('isValidStorageCustomTags', () => {
    it('should return true for valid storage with customTags array', () => {
      const validStorage = {
        customTags: [
          {
            key: 'custom1',
            name: 'Custom Tag',
            color: '#FF0000',
          },
        ],
      };
      expect(isValidStorageCustomTags(validStorage)).toBe(true);
    });

    it('should return true for valid storage without customTags', () => {
      const validStorage = {};
      expect(isValidStorageCustomTags(validStorage)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidStorageCustomTags(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidStorageCustomTags('string')).toBe(false);
      expect(isValidStorageCustomTags(123)).toBe(false);
    });

    it('should return false for non-array customTags', () => {
      const invalidStorage = {
        customTags: 'not an array',
      };
      expect(isValidStorageCustomTags(invalidStorage)).toBe(false);
    });
  });

  describe('checkTagExists', () => {
    const existingTags = [
      {
        key: TAG_KEY_PREFIX + 'business',
        tag: TAG_NAME_PREFIX + 'Business',
        color: '#FF0000',
        ordinal: '1',
      },
      {
        key: TAG_KEY_PREFIX + 'newsletter',
        tag: TAG_NAME_PREFIX + 'Newsletter',
        color: '#00FF00',
        ordinal: '2',
      },
    ];

    it('should return true if tag exists by key', () => {
      const tagToCheck = {
        key: 'business',
        name: 'Business',
        color: '#FF0000',
      };
      expect(checkTagExists(existingTags, tagToCheck)).toBe(true);
    });

    it('should return true if tag exists by name', () => {
      const tagToCheck = {
        key: 'different',
        name: 'Business',
        color: '#FF0000',
      };
      expect(checkTagExists(existingTags, tagToCheck)).toBe(true);
    });

    it('should return false if tag does not exist', () => {
      const tagToCheck = {
        key: 'newTag',
        name: 'New Tag',
        color: '#0000FF',
      };
      expect(checkTagExists(existingTags, tagToCheck)).toBe(false);
    });

    it('should handle empty existingTags array', () => {
      const tagToCheck = {
        key: 'business',
        name: 'Business',
        color: '#FF0000',
      };
      expect(checkTagExists([], tagToCheck)).toBe(false);
    });
  });

  describe('findThunderbirdTag', () => {
    const existingTags = [
      {
        key: TAG_KEY_PREFIX + 'business',
        tag: TAG_NAME_PREFIX + 'Business',
        color: '#FF0000',
        ordinal: '1',
      },
      {
        key: TAG_KEY_PREFIX + 'newsletter',
        tag: TAG_NAME_PREFIX + 'Newsletter',
        color: '#00FF00',
        ordinal: '2',
      },
    ];

    it('should find existing tag by key', () => {
      const tagConfig = {
        key: 'business',
        name: 'Business',
        color: '#FF0000',
      };
      const result = findThunderbirdTag(existingTags, tagConfig);
      expect(result).toBeDefined();
      expect(result?.key).toBe(TAG_KEY_PREFIX + 'business');
    });

    it('should find existing tag by name', () => {
      const tagConfig = {
        key: 'different',
        name: 'Newsletter',
        color: '#00FF00',
      };
      const result = findThunderbirdTag(existingTags, tagConfig);
      expect(result).toBeDefined();
      expect(result?.tag).toBe(TAG_NAME_PREFIX + 'Newsletter');
    });

    it('should return undefined for non-existent tag', () => {
      const tagConfig = {
        key: 'newTag',
        name: 'New Tag',
        color: '#0000FF',
      };
      const result = findThunderbirdTag(existingTags, tagConfig);
      expect(result).toBeUndefined();
    });

    it('should handle empty existingTags array', () => {
      const tagConfig = {
        key: 'business',
        name: 'Business',
        color: '#FF0000',
      };
      const result = findThunderbirdTag([], tagConfig);
      expect(result).toBeUndefined();
    });
  });
});
