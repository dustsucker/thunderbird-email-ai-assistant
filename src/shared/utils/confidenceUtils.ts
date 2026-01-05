/**
 * Confidence Score Utilities
 *
 * Provides utility functions for confidence score calculations, threshold comparisons,
 * and display formatting. Handles conversion between 0-1 range (from AI providers)
 * and 0-100 percentage range (for display and user configuration).
 *
 * @module shared/utils/confidenceUtils
 */

import type { Tag } from '@/shared/types/ProviderTypes';
import { DEFAULTS } from '@/shared/types/ProviderTypes';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Confidence level categories for UI display and classification
 */
export enum ConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Confidence display format options
 */
export type ConfidenceDisplayFormat = 'percentage' | 'decimal' | 'label';

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Converts confidence from 0-1 range to 0-100 percentage range
 *
 * @param confidence - Confidence value in 0-1 range
 * @returns Confidence value in 0-100 range
 * @throws {Error} If confidence is not between 0 and 1
 *
 * @example
 * confidenceToPercentage(0.75) // Returns 75
 * confidenceToPercentage(1.0) // Returns 100
 * confidenceToPercentage(0.0) // Returns 0
 */
export function confidenceToPercentage(confidence: number): number {
  if (confidence < 0 || confidence > 1) {
    throw new Error(
      `Confidence must be between 0 and 1, got: ${confidence}`
    );
  }
  return Math.round(confidence * 100);
}

/**
 * Converts confidence from 0-100 percentage range to 0-1 range
 *
 * @param percentage - Confidence value in 0-100 range
 * @returns Confidence value in 0-1 range
 * @throws {Error} If percentage is not between 0 and 100
 *
 * @example
 * percentageToConfidence(75) // Returns 0.75
 * percentageToConfidence(100) // Returns 1.0
 * percentageToConfidence(0) // Returns 0.0
 */
export function percentageToConfidence(percentage: number): number {
  if (percentage < 0 || percentage > 100) {
    throw new Error(
      `Percentage must be between 0 and 100, got: ${percentage}`
    );
  }
  return percentage / 100;
}

// ============================================================================
// THRESHOLD COMPARISON FUNCTIONS
// ============================================================================

/**
 * Checks if a confidence score (0-1 range) meets the specified threshold (0-100 range)
 *
 * @param confidence - Confidence value in 0-1 range
 * @param threshold - Threshold value in 0-100 range
 * @returns True if confidence meets or exceeds threshold
 *
 * @example
 * meetsThreshold(0.75, 70) // Returns true (75% >= 70%)
 * meetsThreshold(0.65, 70) // Returns false (65% < 70%)
 * meetsThreshold(0.70, 70) // Returns true (70% >= 70%)
 */
export function meetsThreshold(confidence: number, threshold: number): boolean {
  const percentage = confidenceToPercentage(confidence);
  return percentage >= threshold;
}

/**
 * Gets the effective confidence threshold for a tag
 * Returns the tag's override if set, otherwise returns the global threshold
 *
 * @param tag - Tag configuration object
 * @param globalThreshold - Global confidence threshold (defaults to 70 if not provided)
 * @returns Effective threshold value in 0-100 range
 *
 * @example
 * getEffectiveThreshold({ minConfidenceThreshold: 80 }, 70) // Returns 80
 * getEffectiveThreshold({ minConfidenceThreshold: undefined }, 70) // Returns 70
 * getEffectiveThreshold({}, 70) // Returns 70
 */
export function getEffectiveThreshold(
  tag: Partial<Tag>,
  globalThreshold?: number
): number {
  // Use tag override if specified
  if (tag.minConfidenceThreshold !== undefined) {
    return tag.minConfidenceThreshold;
  }

  // Use provided global threshold or default
  return globalThreshold ?? DEFAULTS.minConfidenceThreshold;
}

/**
 * Checks if a confidence score meets the effective threshold for a tag
 * Combines threshold resolution with comparison in a single operation
 *
 * @param confidence - Confidence value in 0-1 range
 * @param tag - Tag configuration object
 * @param globalThreshold - Global confidence threshold (optional)
 * @returns True if confidence meets the tag's effective threshold
 *
 * @example
 * meetsTagThreshold(0.75, { minConfidenceThreshold: 80 }, 70) // Returns false (75% < 80%)
 * meetsTagThreshold(0.75, {}, 70) // Returns true (75% >= 70%)
 */
export function meetsTagThreshold(
  confidence: number,
  tag: Partial<Tag>,
  globalThreshold?: number
): boolean {
  const threshold = getEffectiveThreshold(tag, globalThreshold);
  return meetsThreshold(confidence, threshold);
}

// ============================================================================
// DISPLAY AND FORMATTING FUNCTIONS
// ============================================================================

/**
 * Formats a confidence value (0-1 range) as a percentage string
 *
 * @param confidence - Confidence value in 0-1 range
 * @param decimals - Number of decimal places to show (default: 0)
 * @returns Formatted percentage string
 *
 * @example
 * formatConfidence(0.756) // Returns "76%"
 * formatConfidence(0.756, 1) // Returns "75.6%"
 * formatConfidence(1.0) // Returns "100%"
 */
export function formatConfidence(confidence: number, decimals: number = 0): string {
  const percentage = confidenceToPercentage(confidence);
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Formats a confidence value with custom display format
 *
 * @param confidence - Confidence value in 0-1 range
 * @param format - Desired output format
 * @returns Formatted confidence string
 *
 * @example
 * formatConfidenceAs(0.75, 'percentage') // Returns "75%"
 * formatConfidenceAs(0.75, 'decimal') // Returns "0.75"
 * formatConfidenceAs(0.75, 'label') // Returns "medium"
 */
export function formatConfidenceAs(
  confidence: number,
  format: ConfidenceDisplayFormat
): string {
  switch (format) {
    case 'percentage':
      return formatConfidence(confidence);
    case 'decimal':
      return confidence.toFixed(2);
    case 'label':
      return getConfidenceLevelLabel(confidence);
  }
}

/**
 * Gets the confidence level category based on the score
 *
 * @param confidence - Confidence value in 0-1 range
 * @returns Confidence level category
 *
 * @example
 * getConfidenceLevel(0.85) // Returns ConfidenceLevel.HIGH
 * getConfidenceLevel(0.75) // Returns ConfidenceLevel.MEDIUM
 * getConfidenceLevel(0.65) // Returns ConfidenceLevel.LOW
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  const percentage = confidenceToPercentage(confidence);

  if (percentage >= 80) {
    return ConfidenceLevel.HIGH;
  } else if (percentage >= 70) {
    return ConfidenceLevel.MEDIUM;
  } else {
    return ConfidenceLevel.LOW;
  }
}

/**
 * Gets a human-readable label for the confidence level
 *
 * @param confidence - Confidence value in 0-1 range
 * @returns Human-readable confidence label
 *
 * @example
 * getConfidenceLevelLabel(0.85) // Returns "High"
 * getConfidenceLevelLabel(0.75) // Returns "Medium"
 * getConfidenceLevelLabel(0.65) // Returns "Low"
 */
export function getConfidenceLevelLabel(confidence: number): string {
  const level = getConfidenceLevel(confidence);

  switch (level) {
    case ConfidenceLevel.HIGH:
      return 'High';
    case ConfidenceLevel.MEDIUM:
      return 'Medium';
    case ConfidenceLevel.LOW:
      return 'Low';
  }
}

/**
 * Gets a color code for the confidence level (useful for UI indicators)
 *
 * @param confidence - Confidence value in 0-1 range
 * @returns Hex color code for the confidence level
 *
 * @example
 * getConfidenceColor(0.85) // Returns "#4CAF50" (green)
 * getConfidenceColor(0.75) // Returns "#FFC107" (yellow/amber)
 * getConfidenceColor(0.65) // Returns "#F44336" (red)
 */
export function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);

  switch (level) {
    case ConfidenceLevel.HIGH:
      return '#4CAF50'; // Green
    case ConfidenceLevel.MEDIUM:
      return '#FFC107'; // Amber/Yellow
    case ConfidenceLevel.LOW:
      return '#F44336'; // Red
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that a confidence value is within the valid range (0-1)
 *
 * @param confidence - Confidence value to validate
 * @returns True if confidence is valid
 *
 * @example
 * isValidConfidence(0.5) // Returns true
 * isValidConfidence(0.0) // Returns true
 * isValidConfidence(1.0) // Returns true
 * isValidConfidence(1.5) // Returns false
 * isValidConfidence(-0.1) // Returns false
 */
export function isValidConfidence(confidence: number): boolean {
  return typeof confidence === 'number' && confidence >= 0 && confidence <= 1;
}

/**
 * Validates that a threshold value is within the valid range (0-100)
 *
 * @param threshold - Threshold value to validate
 * @returns True if threshold is valid
 *
 * @example
 * isValidThreshold(70) // Returns true
 * isValidThreshold(0) // Returns true
 * isValidThreshold(100) // Returns true
 * isValidThreshold(101) // Returns false
 * isValidThreshold(-1) // Returns false
 */
export function isValidThreshold(threshold: number): boolean {
  return (
    typeof threshold === 'number' &&
    Number.isInteger(threshold) &&
    threshold >= 0 &&
    threshold <= 100
  );
}

/**
 * Validates a tag's threshold configuration
 *
 * @param tag - Tag configuration to validate
 * @returns Object with validation result and error message if invalid
 *
 * @example
 * validateTagThreshold({ minConfidenceThreshold: 75 })
 * // Returns { valid: true, error: null }
 *
 * validateTagThreshold({ minConfidenceThreshold: 101 })
 * // Returns { valid: false, error: "Threshold must be between 0 and 100" }
 */
export function validateTagThreshold(tag: Partial<Tag>): {
  valid: boolean;
  error: string | null;
} {
  if (tag.minConfidenceThreshold === undefined) {
    return { valid: true, error: null };
  }

  if (!isValidThreshold(tag.minConfidenceThreshold)) {
    return {
      valid: false,
      error: `Tag threshold must be an integer between 0 and 100, got: ${tag.minConfidenceThreshold}`,
    };
  }

  return { valid: true, error: null };
}

// ============================================================================
// COMPARISON UTILITIES
// ============================================================================

/**
 * Compares two confidence values and returns their relationship
 *
 * @param confidence1 - First confidence value (0-1 range)
 * @param confidence2 - Second confidence value (0-1 range)
 * @returns 'greater', 'equal', or 'less'
 *
 * @example
 * compareConfidence(0.8, 0.7) // Returns 'greater'
 * compareConfidence(0.7, 0.7) // Returns 'equal'
 * compareConfidence(0.6, 0.7) // Returns 'less'
 */
export function compareConfidence(
  confidence1: number,
  confidence2: number
): 'greater' | 'equal' | 'less' {
  if (Math.abs(confidence1 - confidence2) < 0.001) {
    return 'equal';
  }
  return confidence1 > confidence2 ? 'greater' : 'less';
}

/**
 * Calculates the difference between two confidence values in percentage points
 *
 * @param confidence1 - First confidence value (0-1 range)
 * @param confidence2 - Second confidence value (0-1 range)
 * @returns Absolute difference in percentage points
 *
 * @example
 * getConfidenceDifference(0.8, 0.7) // Returns 10
 * getConfidenceDifference(0.75, 0.75) // Returns 0
 */
export function getConfidenceDifference(confidence1: number, confidence2: number): number {
  return Math.abs(confidenceToPercentage(confidence1) - confidenceToPercentage(confidence2));
}
