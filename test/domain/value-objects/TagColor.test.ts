import { describe, it, expect } from 'vitest';
import { TagColor, InvalidTagColorError, isInvalidTagColorError } from '@/domain/value-objects';

describe('TagColor', () => {
  describe('constructor', () => {
    it('should create a valid 6-digit hex color', () => {
      const color = new TagColor('#FF5733');
      expect(color.value).toBe('#FF5733');
    });

    it('should create a valid 3-digit hex color', () => {
      const color = new TagColor('#F53');
      expect(color.value).toBe('#F53');
    });

    it('should normalize color to uppercase', () => {
      const color = new TagColor('#ff5733');
      expect(color.value).toBe('#FF5733');
    });

    it('should trim whitespace', () => {
      const color = new TagColor('  #FF5733  ');
      expect(color.value).toBe('#FF5733');
    });

    it('should throw InvalidTagColorError for empty string', () => {
      expect(() => new TagColor('')).toThrow(InvalidTagColorError);
      expect(() => new TagColor('   ')).toThrow(InvalidTagColorError);
    });

    it('should throw InvalidTagColorError for color without #', () => {
      expect(() => new TagColor('FF5733')).toThrow(InvalidTagColorError);
    });

    it('should throw InvalidTagColorError for invalid hex characters', () => {
      expect(() => new TagColor('#GG5733')).toThrow(InvalidTagColorError);
    });

    it('should throw InvalidTagColorError for wrong length', () => {
      expect(() => new TagColor('#FF573')).toThrow(InvalidTagColorError);
      expect(() => new TagColor('#FF57333')).toThrow(InvalidTagColorError);
    });

    it('should throw InvalidTagColorError for named colors', () => {
      expect(() => new TagColor('red')).toThrow(InvalidTagColorError);
    });
  });

  describe('to6Digit', () => {
    it('should convert 3-digit to 6-digit', () => {
      const color = new TagColor('#F53');
      const expanded = color.to6Digit();
      expect(expanded.value).toBe('#FF5533');
    });

    it('should return same color for 6-digit input', () => {
      const color = new TagColor('#FF5733');
      const expanded = color.to6Digit();
      expect(expanded.value).toBe('#FF5733');
    });

    it('should properly expand each digit', () => {
      expect(new TagColor('#ABC').to6Digit().value).toBe('#AABBCC');
      expect(new TagColor('#123').to6Digit().value).toBe('#112233');
    });
  });

  describe('toRgb', () => {
    it('should convert hex to RGB array', () => {
      const color = new TagColor('#FF5733');
      expect(color.toRgb()).toEqual([255, 87, 51]);
    });

    it('should work with 3-digit colors', () => {
      const color = new TagColor('#F53');
      expect(color.toRgb()).toEqual([255, 85, 51]);
    });

    it('should handle black', () => {
      const color = new TagColor('#000000');
      expect(color.toRgb()).toEqual([0, 0, 0]);
    });

    it('should handle white', () => {
      const color = new TagColor('#FFFFFF');
      expect(color.toRgb()).toEqual([255, 255, 255]);
    });
  });

  describe('getLuminance', () => {
    it('should return high luminance for light colors', () => {
      const color = new TagColor('#FFFFFF');
      expect(color.getLuminance()).toBe(1);
    });

    it('should return low luminance for dark colors', () => {
      const color = new TagColor('#000000');
      expect(color.getLuminance()).toBe(0);
    });

    it('should return medium luminance for gray', () => {
      const color = new TagColor('#808080');
      const luminance = color.getLuminance();
      expect(luminance).toBeGreaterThan(0.4);
      expect(luminance).toBeLessThan(0.6);
    });
  });

  describe('getContrastColor', () => {
    it('should return black for light colors', () => {
      const color = new TagColor('#FFFFFF');
      expect(color.getContrastColor()).toBe('black');
    });

    it('should return white for dark colors', () => {
      const color = new TagColor('#000000');
      expect(color.getContrastColor()).toBe('white');
    });
  });

  describe('isLight', () => {
    it('should return true for light colors', () => {
      expect(new TagColor('#FFFFFF').isLight()).toBe(true);
      expect(new TagColor('#FFFF00').isLight()).toBe(true);
    });

    it('should return false for dark colors', () => {
      expect(new TagColor('#000000').isLight()).toBe(false);
      expect(new TagColor('#000033').isLight()).toBe(false);
    });
  });

  describe('isDark', () => {
    it('should return true for dark colors', () => {
      expect(new TagColor('#000000').isDark()).toBe(true);
      expect(new TagColor('#330000').isDark()).toBe(true);
    });

    it('should return false for light colors', () => {
      expect(new TagColor('#FFFFFF').isDark()).toBe(false);
      expect(new TagColor('#FFFFCC').isDark()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same color', () => {
      const color1 = new TagColor('#FF5733');
      const color2 = new TagColor('#FF5733');
      expect(color1.equals(color2)).toBe(true);
    });

    it('should return true for same color with different case', () => {
      const color1 = new TagColor('#FF5733');
      const color2 = new TagColor('#ff5733');
      expect(color1.equals(color2)).toBe(true);
    });

    it('should return false for different colors', () => {
      const color1 = new TagColor('#FF5733');
      const color2 = new TagColor('#33FF57');
      expect(color1.equals(color2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the color value', () => {
      const color = new TagColor('#FF5733');
      expect(color.toString()).toBe('#FF5733');
    });
  });

  describe('static isValid', () => {
    it('should return true for valid color', () => {
      expect(TagColor.isValid('#FF5733')).toBe(true);
      expect(TagColor.isValid('#F53')).toBe(true);
    });

    it('should return false for invalid color', () => {
      expect(TagColor.isValid('red')).toBe(false);
      expect(TagColor.isValid('FF5733')).toBe(false);
    });
  });

  describe('static random', () => {
    it('should create a valid random color', () => {
      const color = TagColor.random();
      expect(TagColor.isValid(color.value)).toBe(true);
    });

    it('should create different colors on each call', () => {
      const color1 = TagColor.random();
      const color2 = TagColor.random();
      // Statistically very unlikely to get the same color twice
      expect(color1.value).not.toBe(color2.value);
    });
  });

  describe('static fromPalette', () => {
    it('should return color from palette', () => {
      const color = TagColor.fromPalette(0);
      expect(color.value).toBe('#FF5733');
    });

    it('should cycle through palette', () => {
      const color1 = TagColor.fromPalette(0);
      const color2 = TagColor.fromPalette(10); // Same as index 0 after modulo
      expect(color1.value).toBe(color2.value);
    });

    it('should handle large index', () => {
      const color = TagColor.fromPalette(100);
      expect(TagColor.isValid(color.value)).toBe(true);
    });
  });
});

describe('InvalidTagColorError', () => {
  it('should have correct name', () => {
    try {
      throw new InvalidTagColorError('red');
    } catch (error) {
      expect((error as Error).name).toBe('InvalidTagColorError');
    }
  });

  it('should include invalid value', () => {
    try {
      throw new InvalidTagColorError('red');
    } catch (error) {
      expect((error as InvalidTagColorError).value).toBe('red');
    }
  });

  it('should include custom reason in message', () => {
    try {
      throw new InvalidTagColorError('red', 'must be hex format');
    } catch (error) {
      expect((error as Error).message).toContain('must be hex format');
    }
  });
});

describe('isInvalidTagColorError', () => {
  it('should return true for InvalidTagColorError', () => {
    const error = new InvalidTagColorError('red');
    expect(isInvalidTagColorError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('regular error');
    expect(isInvalidTagColorError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isInvalidTagColorError('string')).toBe(false);
    expect(isInvalidTagColorError(null)).toBe(false);
    expect(isInvalidTagColorError(undefined)).toBe(false);
  });
});
