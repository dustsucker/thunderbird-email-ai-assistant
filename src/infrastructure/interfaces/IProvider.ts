/**
 * Provider interfaces for the Thunderbird Email AI Assistant.
 *
 * Defines the contract for AI providers that analyze emails and assign tags.
 * This interface bridges the legacy BaseProvider implementation with the new
 * dependency injection architecture.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Provider settings interface.
 *
 * Extensible settings object for AI provider configuration.
 * Specific providers can add custom properties.
 */
export interface IProviderSettings {
  /** API authentication key */
  apiKey?: string;
  /** API endpoint URL */
  apiUrl?: string;
  /** Model identifier for the AI service */
  model?: string;
  /** Additional provider-specific settings */
  [key: string]: unknown;
}

/**
 * Email attachment metadata.
 */
export interface IAttachment {
  /** Original filename */
  name: string;
  /** MIME type of the attachment */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

/**
 * Structured email data for AI analysis.
 *
 * Contains parsed email content with headers, body text, and attachment metadata.
 */
export interface IStructuredEmailData {
  /** Email headers as key-value pairs */
  headers: Record<string, string>;
  /** Plain text body content */
  body: string;
  /** List of email attachments */
  attachments: IAttachment[];
}

/**
 * Custom tag configuration.
 *
 * Defines a custom tag that can be applied to emails by the AI analysis.
 */
export interface ICustomTag {
  /** Unique tag identifier */
  key: string;
  /** Human-readable tag name */
  name: string;
  /** Description for the AI model */
  description: string;
}

/**
 * AI analysis response with assigned tags.
 *
 * Result of email analysis containing tags, confidence score, and reasoning.
 */
export interface ITagResponse {
  /** List of tag keys that apply to this email */
  tags: string[];
  /** Overall confidence score (0.0 to 1.0) */
  confidence: number;
  /** AI reasoning for the tag assignment */
  reasoning: string;
  /** Whether the email appears to be a scam */
  is_scam?: boolean;
  /** Detected sender name */
  sender?: string;
  /** Whether sender is consistent with headers */
  sender_consistent?: boolean | null;
  /** SPF authentication result */
  spf_pass?: boolean | null;
  /** DKIM authentication result */
  dkim_pass?: boolean | null;
  /** Additional provider-specific response data */
  [key: string]: unknown;
}

/**
 * Input for email analysis.
 *
 * Combines provider settings, email data, and custom tag configurations.
 */
export interface IAnalyzeInput {
  /** Provider configuration settings */
  settings: IProviderSettings;
  /** Structured email data to analyze */
  data: IStructuredEmailData;
  /** Custom tag configurations for analysis */
  tags: ICustomTag[];
}

// ============================================================================
// Main Provider Interface
// ============================================================================

/**
 * AI Provider interface.
 *
 * Defines the contract for AI providers that analyze emails and assign tags.
 * Implementations should handle communication with external AI services,
 * retry logic, error handling, and response validation.
 *
 * @example
 * ```typescript
 * const provider: IProvider = container.resolve<IProvider>('Provider');
 * const isValid = await provider.validateSettings({ apiKey: 'sk-...' });
 * if (isValid) {
 *   const result = await provider.analyze({
 *     settings: { apiKey: 'sk-...', model: 'gpt-4' },
 *     data: { headers: {}, body: '...', attachments: [] },
 *     tags: [{ key: 'is_advertise', name: 'Ad', description: '...' }]
 *   });
 *   console.log(result.tags);
 * }
 * ```
 */
export interface IProvider {
  /**
   * Validates provider settings.
   *
   * Checks that required settings (API key, model, etc.) are present and valid.
   *
   * @param settings - Provider settings to validate
   * @returns Promise resolving to true if settings are valid
   *
   * @throws {Error} If settings validation fails (implementation-specific)
   */
  validateSettings(settings: IProviderSettings): Promise<boolean>;

  /**
   * Analyzes an email and assigns tags.
   *
   * Main entry point for email analysis. Sends email data to the AI provider
   * and returns a structured response with assigned tags and metadata.
   *
   * @param input - Analysis input containing settings, email data, and tags
   * @returns Promise resolving to tag analysis response
   *
   * @throws {Error} If analysis fails (invalid settings, API error, timeout, etc.)
   */
  analyze(input: IAnalyzeInput): Promise<ITagResponse>;

  /**
   * Lists available models for this provider.
   * Optional - providers without model selection should return empty array.
   *
   * @param settings - Provider settings (API key, etc.)
   * @returns Promise resolving to array of available model names
   */
  listModels?(settings: IProviderSettings): Promise<string[]>;

  /**
   * Unique provider identifier.
   *
   * Used for provider registration and dependency injection resolution.
   * Should be a stable identifier that uniquely identifies the provider type.
   *
   * @example
   * ```typescript
   * console.log(provider.providerId); // "openai" or "ollama" or "claude"
   * ```
   */
  readonly providerId: string;
}
