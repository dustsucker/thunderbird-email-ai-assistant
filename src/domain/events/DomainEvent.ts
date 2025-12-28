/**
 * Domain Event Module
 *
 * Base interface for all domain events in the system.
 *
 * Domain events represent significant business events that occur within
 * the application. They are immutable, type-safe, and carry metadata about
 * when and where the event occurred.
 *
 * @module domain/events
 */

// ============================================================================
// Base Domain Event Interface
// ============================================================================

/**
 * Base interface for all domain events.
 *
 * All domain events must extend this interface and provide:
 * - eventType: Unique identifier for the event type
 * - timestamp: ISO 8601 timestamp when the event occurred
 * - metadata: Optional additional context about the event
 *
 * @example
 * ```typescript
 * interface EmailAnalyzedEvent extends DomainEvent {
 *   eventType: 'EmailAnalyzed';
 *   messageId: string;
 *   result: AnalysisResult;
 * }
 * ```
 */
export interface DomainEvent {
  /** Unique identifier for the event type (e.g., 'EmailAnalyzed') */
  readonly eventType: string;
  /** ISO 8601 timestamp when the event occurred */
  readonly timestamp: string;
  /** Optional additional context about the event */
  readonly metadata?: Record<string, unknown>;
}
