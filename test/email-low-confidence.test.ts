/**
 * Tests for Email entity low-confidence flagging functionality
 */

import { describe, it, expect } from 'vitest';
import { Email, type LowConfidenceFlag } from '@/domain/entities/Email';
import { EmailAddress } from '@/domain/value-objects/EmailAddress';
import { EmailSubject } from '@/domain/value-objects/EmailSubject';
import { EmailBody } from '@/domain/value-objects/EmailBody';

describe('Email Entity - Low Confidence Flagging', () => {
  const createTestEmail = (): Email => {
    const sender = new EmailAddress('test@example.com');
    const recipients = [new EmailAddress('recipient@example.com')];
    const subject = new EmailSubject('Test Subject');
    const body = new EmailBody('Test Body');

    return new Email({
      id: '12345',
      subject,
      sender,
      recipients,
      body,
    });
  };

  describe('flagLowConfidence', () => {
    it('should add a low-confidence flag to an email', () => {
      const email = createTestEmail();
      const flag: LowConfidenceFlag = {
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Confidence 65.0% below threshold 70% (global threshold)',
      };

      email.flagLowConfidence(flag);

      expect(email.hasLowConfidenceFlags()).toBe(true);
      expect(email.getLowConfidenceFlagCount()).toBe(1);
      expect(email.getLowConfidenceFlag('is_business')).toEqual(flag);
    });

    it('should throw error for empty tag key', () => {
      const email = createTestEmail();
      const flag: LowConfidenceFlag = {
        tagKey: '',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      };

      expect(() => email.flagLowConfidence(flag)).toThrow('Tag key cannot be empty');
    });

    it('should throw error for confidence out of range', () => {
      const email = createTestEmail();
      const flag: LowConfidenceFlag = {
        tagKey: 'is_business',
        confidence: 1.5,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      };

      expect(() => email.flagLowConfidence(flag)).toThrow('Confidence must be between 0 and 1');
    });

    it('should throw error for threshold out of range', () => {
      const email = createTestEmail();
      const flag: LowConfidenceFlag = {
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 150,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      };

      expect(() => email.flagLowConfidence(flag)).toThrow('Threshold must be between 0 and 100');
    });

    it('should throw error for empty reasoning', () => {
      const email = createTestEmail();
      const flag: LowConfidenceFlag = {
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: '',
      };

      expect(() => email.flagLowConfidence(flag)).toThrow('Reasoning cannot be empty');
    });

    it('should allow multiple flags for different tags', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Below global threshold',
      });

      email.flagLowConfidence({
        tagKey: 'is_urgent',
        confidence: 0.60,
        threshold: 80,
        thresholdType: 'custom',
        reasoning: 'Below custom threshold',
      });

      expect(email.getLowConfidenceFlagCount()).toBe(2);
      expect(email.hasLowConfidenceFlags()).toBe(true);
    });

    it('should overwrite existing flag for same tag', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'First flag',
      });

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.60,
        threshold: 80,
        thresholdType: 'custom',
        reasoning: 'Second flag',
      });

      expect(email.getLowConfidenceFlagCount()).toBe(1);
      const flag = email.getLowConfidenceFlag('is_business');
      expect(flag?.confidence).toBe(0.60);
      expect(flag?.threshold).toBe(80);
      expect(flag?.thresholdType).toBe('custom');
      expect(flag?.reasoning).toBe('Second flag');
    });
  });

  describe('getLowConfidenceFlags', () => {
    it('should return empty array when no flags', () => {
      const email = createTestEmail();
      expect(email.getLowConfidenceFlags()).toEqual([]);
    });

    it('should return all flags', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Below global threshold',
      });

      email.flagLowConfidence({
        tagKey: 'is_urgent',
        confidence: 0.60,
        threshold: 80,
        thresholdType: 'custom',
        reasoning: 'Below custom threshold',
      });

      const flags = email.getLowConfidenceFlags();
      expect(flags).toHaveLength(2);
      expect(flags.some((f) => f.tagKey === 'is_business')).toBe(true);
      expect(flags.some((f) => f.tagKey === 'is_urgent')).toBe(true);
    });
  });

  describe('removeLowConfidenceFlag', () => {
    it('should remove existing flag', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      });

      expect(email.getLowConfidenceFlagCount()).toBe(1);

      email.removeLowConfidenceFlag('is_business');

      expect(email.getLowConfidenceFlagCount()).toBe(0);
      expect(email.hasLowConfidenceFlags()).toBe(false);
    });

    it('should handle removing non-existent flag gracefully', () => {
      const email = createTestEmail();

      expect(() => email.removeLowConfidenceFlag('nonexistent')).not.toThrow();
      expect(email.getLowConfidenceFlagCount()).toBe(0);
    });
  });

  describe('clearLowConfidenceFlags', () => {
    it('should remove all flags', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      });

      email.flagLowConfidence({
        tagKey: 'is_urgent',
        confidence: 0.60,
        threshold: 80,
        thresholdType: 'custom',
        reasoning: 'Test reasoning',
      });

      expect(email.getLowConfidenceFlagCount()).toBe(2);

      email.clearLowConfidenceFlags();

      expect(email.getLowConfidenceFlagCount()).toBe(0);
      expect(email.hasLowConfidenceFlags()).toBe(false);
    });
  });

  describe('toSummary', () => {
    it('should include low-confidence flag information in summary', () => {
      const email = createTestEmail();

      email.flagLowConfidence({
        tagKey: 'is_business',
        confidence: 0.65,
        threshold: 70,
        thresholdType: 'global',
        reasoning: 'Test reasoning',
      });

      const summary = email.toSummary();

      expect(summary.hasLowConfidenceFlags).toBe(true);
      expect(summary.lowConfidenceFlagCount).toBe(1);
    });

    it('should show no flags when none exist', () => {
      const email = createTestEmail();
      const summary = email.toSummary();

      expect(summary.hasLowConfidenceFlags).toBe(false);
      expect(summary.lowConfidenceFlagCount).toBe(0);
    });
  });
});
