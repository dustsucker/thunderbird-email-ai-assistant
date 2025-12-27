/**
 * BaseProviderAdapter bridges the legacy BaseProvider implementation with the IProvider interface.
 *
 * This adapter enables dependency injection for existing BaseProvider implementations
 * by wrapping them in the IProvider interface contract.
 */

import { injectable } from 'tsyringe';
import type { BaseProvider } from './BaseProvider';
import type {
  BaseProviderSettings,
  AnalyzeInput as LegacyAnalyzeInput,
} from './BaseProvider';
import type {
  IProvider,
  IProviderSettings,
  IStructuredEmailData,
  ICustomTag,
  ITagResponse,
  IAnalyzeInput,
} from '../interfaces/IProvider';
import type { ILogger } from '../interfaces/ILogger';
import type { Tag } from '@/shared/types/ProviderTypes';
import 'reflect-metadata';

// ============================================================================
// Type Guards and Helpers
// ============================================================================

/**
 * Type guard to check if value is valid IProviderSettings
 */
function isIProviderSettings(value: unknown): value is IProviderSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('apiKey' in value || 'apiUrl' in value || 'model' in value)
  );
}

/**
 * Type guard to check if value is valid IAttachment
 */
function isIAttachment(value: unknown): value is { name: string; mimeType: string; size: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'mimeType' in value &&
    'size' in value
  );
}

/**
 * Type guard to check if value is valid ICustomTag
 */
function isICustomTag(value: unknown): value is { key: string; name: string; description: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'key' in value &&
    'name' in value &&
    'description' in value
  );
}

// ============================================================================
// Adapter Implementation
// ============================================================================

/**
 * Adapter class that wraps BaseProvider to implement IProvider interface.
 *
 * This adapter enables the legacy BaseProvider implementations to be used
 * with the new dependency injection system. It handles type conversions between
 * the new IProvider interfaces and the legacy BaseProvider types.
 *
 * @template T - The BaseProvider implementation type
 *
 * @example
 * ```typescript
 * const adapter = new BaseProviderAdapter<OpenAIProvider>(
 *   'openai',
 *   new OpenAIProvider()
 * );
 * await container.registerInstance<IProvider>('IProvider', adapter);
 * ```
 */
@injectable()
export class BaseProviderAdapter<T extends BaseProvider> implements IProvider {
  private readonly logger: ILogger;
  /** Unique provider identifier */
  public readonly providerId: string;

  /**
   * Creates a new BaseProviderAdapter instance.
   *
   * @param providerId - Unique identifier for this provider
   * @param provider - The BaseProvider implementation to wrap
   * @param logger - Logger instance for logging operations
   */
  constructor(
    providerId: string,
    private readonly provider: T,
    logger: ILogger
  ) {
    this.providerId = providerId;
    this.logger = logger;
    this.logger.debug('BaseProviderAdapter initialized', { providerId });
  }

  // ========================================================================
  // IProvider Implementation
  // ========================================================================

  /**
   * Validates provider settings.
   *
   * Delegates to the wrapped BaseProvider's validateSettings method.
   *
   * @param settings - Provider settings to validate
   * @returns Promise resolving to true if settings are valid
   * @throws {Error} If settings validation fails
   *
   * @example
   * ```typescript
   * const isValid = await adapter.validateSettings({
   *   apiKey: 'sk-proj-123456'
   * });
   * ```
   */
  async validateSettings(settings: IProviderSettings): Promise<boolean> {
    this.logger.debug('Validating provider settings', {
      providerId: this.providerId,
      hasApiKey: !!settings.apiKey,
      hasModel: !!settings.model,
    });

    try {
      // Convert IProviderSettings to BaseProviderSettings
      const baseSettings: BaseProviderSettings = this.convertSettings(settings);

      // Access protected method via type assertion (BaseProvider instances have this method)
      const result = (
        this.provider as {
          validateSettings(settings: BaseProviderSettings): boolean;
        }
      ).validateSettings(baseSettings);

      if (result) {
        this.logger.debug('Settings validation succeeded', { providerId: this.providerId });
      } else {
        this.logger.warn('Settings validation failed', { providerId: this.providerId });
      }

      return result;
    } catch (error) {
      this.logger.error('Settings validation error', {
        providerId: this.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyzes an email and assigns tags.
   *
   * Delegates to the wrapped BaseProvider's analyze method after converting
   * the input format from IAnalyzeInput to LegacyAnalyzeInput.
   *
   * @param input - Analysis input containing settings, email data, and tags
   * @returns Promise resolving to tag analysis response
   * @throws {Error} If analysis fails (invalid settings, API error, timeout, etc.)
   *
   * @example
   * ```typescript
   * const result = await adapter.analyze({
   *   settings: { apiKey: 'sk-...', model: 'gpt-4' },
   *   data: { headers: {}, body: 'Hello...', attachments: [] },
   *   tags: [{ key: 'is_advertise', name: 'Ad', description: '...' }]
   * });
   * console.log(result.tags);
   * ```
   */
  async analyze(input: IAnalyzeInput): Promise<ITagResponse> {
    this.logger.debug('Starting email analysis', {
      providerId: this.providerId,
      tagCount: input.tags.length,
      hasBody: !!input.data.body,
    });

    try {
      // Convert IAnalyzeInput to LegacyAnalyzeInput
      const legacyInput: LegacyAnalyzeInput = this.convertAnalyzeInput(input);

      // Delegate to BaseProvider
      const legacyResponse = await this.provider.analyze(legacyInput);

      // Convert legacy TagResponse to ITagResponse
      const response: ITagResponse = this.convertTagResponse(legacyResponse);

      this.logger.info('Email analysis completed', {
        providerId: this.providerId,
        tagCount: response.tags.length,
        confidence: response.confidence,
      });

      return response;
    } catch (error) {
      this.logger.error('Email analysis failed', {
        providerId: this.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ========================================================================
  // Type Conversion Methods
  // ========================================================================

  /**
   * Converts IProviderSettings to BaseProviderSettings.
   *
   * @param settings - IProviderSettings to convert
   * @returns BaseProviderSettings
   */
  private convertSettings(settings: IProviderSettings): BaseProviderSettings {
    if (!isIProviderSettings(settings)) {
      throw new Error('Invalid settings provided');
    }

    const baseSettings: BaseProviderSettings = {
      apiKey: settings.apiKey,
      apiUrl: settings.apiUrl,
      model: settings.model,
    };

    // Copy any additional properties
    for (const [key, value] of Object.entries(settings)) {
      if (!['apiKey', 'apiUrl', 'model'].includes(key)) {
        baseSettings[key as keyof BaseProviderSettings] = value as never;
      }
    }

    return baseSettings;
  }

  /**
   * Converts IAnalyzeInput to LegacyAnalyzeInput.
   *
   * @param input - IAnalyzeInput to convert
   * @returns LegacyAnalyzeInput
   */
  private convertAnalyzeInput(input: IAnalyzeInput): LegacyAnalyzeInput {
    if (!isIProviderSettings(input.settings)) {
      throw new Error('Invalid settings provided in analyze input');
    }

    // Convert IStructuredEmailData to StructuredEmailData
    const structuredData = this.convertStructuredEmailData(input.data);

    // Convert ICustomTag[] to CustomTags
    const customTags = this.convertCustomTags(input.tags);

    return {
      settings: this.convertSettings(input.settings),
      structuredData,
      customTags,
    };
  }

  /**
   * Converts IStructuredEmailData to StructuredEmailData from legacy.
   *
   * @param data - IStructuredEmailData to convert
   * @returns Legacy StructuredEmailData
   */
  private convertStructuredEmailData(data: IStructuredEmailData): {
    headers: Record<string, string>;
    body: string;
    attachments: Array<{ name: string; mimeType: string; size: number }>;
  } {
    return {
      headers: { ...data.headers },
      body: data.body,
      attachments: data.attachments.map((attachment) => {
        if (!isIAttachment(attachment)) {
          throw new Error('Invalid attachment provided');
        }
        return {
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
        };
      }),
    };
  }

  /**
   * Converts ICustomTag[] to CustomTags from legacy.
   *
   * @param tags - ICustomTag array to convert
   * @returns Legacy CustomTags
   */
  private convertCustomTags(tags: ICustomTag[]): Tag[] {
    return tags.map((tag) => {
      if (!isICustomTag(tag)) {
        throw new Error('Invalid custom tag provided');
      }
      return {
        key: tag.key,
        name: tag.name,
        color: '#9E9E9E', // Default gray color for custom tags
        prompt: tag.description, // description maps to prompt in legacy
      };
    });
  }

  /**
   * Converts legacy TagResponse to ITagResponse.
   *
   * @param response - Legacy TagResponse
   * @returns ITagResponse
   */
  private convertTagResponse(response: {
    tags: string[];
    confidence: number;
    reasoning: string;
    [key: string]: unknown;
  }): ITagResponse {
    return {
      tags: response.tags,
      confidence: response.confidence,
      reasoning: response.reasoning,
      // Extract known optional fields if present
      is_scam: response.is_scam as boolean | undefined,
      sender: response.sender as string | undefined,
      sender_consistent: response.sender_consistent as boolean | null | undefined,
      spf_pass: response.spf_pass as boolean | null | undefined,
      dkim_pass: response.dkim_pass as boolean | null | undefined,
    };
  }
}
