/**
 * Thunderbird Mail Reader Adapter
 *
 * Adapter implementation for reading email messages from Thunderbird's messenger API.
 * Implements the IMailReader interface using Thunderbird WebExtension API.
 *
 * This adapter:
 * - Fetches messages from Thunderbird via messenger.messages API
 * - Parses MIME message parts structure
 * - Extracts plain text and HTML bodies
 * - Handles attachment metadata extraction
 * - Provides typed interfaces for email operations
 *
 * @module interfaces/adapters/ThunderbirdMailReader
 */

import { injectable, inject } from 'tsyringe';
import type {
  IMailReader,
  IEmailMessage,
  IEmailHeaders,
  IEmailPart,
  IEmailAttachment,
  IEmailAttachmentContent,
  IEmailQuery,
  IEMLParseResult,
} from '@/infrastructure/interfaces/IMailReader';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

declare const messenger: {
  messages: {
    getFull(messageId: number): Promise<ThunderbirdFullMessage>;
    get(messageId: number): Promise<ThunderbirdMessageDetails>;
    list(folderId?: string): Promise<ThunderbirdMessageListResult>;
  };
};

/**
 * Thunderbird Full Message structure from messenger.messages.getFull().
 */
interface ThunderbirdFullMessage {
  id: number;
  headers: Record<string, string[]>;
  parts: ThunderbirdMessagePart[];
}

/**
 * Thunderbird Message Details from messenger.messages.get().
 */
interface ThunderbirdMessageDetails {
  id: number;
  folderAccountId?: number;
  folderId?: string;
  subject?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  date?: number;
  tags?: string[];
}

/**
 * Thunderbird Message List Result from messenger.messages.list().
 */
interface ThunderbirdMessageListResult {
  messages: Array<{
    id: number;
    folderAccountId?: number;
    folderId?: string;
  }>;
}

/**
 * Thunderbird Message Part structure.
 */
interface ThunderbirdMessagePart {
  contentType: string;
  body: string;
  isAttachment: boolean;
  name?: string;
  size?: number;
  parts?: ThunderbirdMessagePart[];
  contentId?: string;
  contentDisposition?: string;
  charset?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// ThunderbirdMailReader Implementation
// ============================================================================

/**
 * Thunderbird Mail Reader Adapter
 *
 * Implements IMailReader interface using Thunderbird's messenger.messages API.
 * Provides type-safe email reading operations for the Thunderbird Email AI Assistant.
 *
 * @example
 * ```typescript
 * const mailReader = container.resolve<IMailReader>('IMailReader');
 *
 * // Get full message
 * const message = await mailReader.getFullMessage(12345);
 * console.log(message.subject, message.from);
 *
 * // Get attachments
 * const attachments = await mailReader.getAttachments(message);
 * for (const attachment of attachments) {
 *   console.log(`Attachment: ${attachment.name}`);
 * }
 * ```
 */
@injectable()
export class ThunderbirdMailReader implements IMailReader {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.logger.debug('ThunderbirdMailReader adapter initialized');
  }

  // ==========================================================================
  // Public Methods - Message Retrieval
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async getFullMessage(messageId: number): Promise<IEmailMessage> {
    this.logger.debug('Retrieving full message', { messageId });

    try {
      const thunderbirdMessage = await messenger.messages.getFull(messageId);
      const messageDetails = await messenger.messages.get(messageId);

      // Convert Thunderbird parts to IEmailPart
      const parts = this.convertMessageParts(thunderbirdMessage.parts);

      // Extract headers as Record<string, string> (join multi-value headers)
      const headers: Record<string, string> = {};
      for (const [key, values] of Object.entries(thunderbirdMessage.headers)) {
        headers[key] = values.length > 0 ? values[0] : '';
      }

      const message: IEmailMessage = {
        id: thunderbirdMessage.id,
        folderId: messageDetails.folderId?.toString(),
        accountId: messageDetails.folderAccountId,
        headers,
        parts,
        subject: messageDetails.subject,
        from: messageDetails.from,
        to: messageDetails.to,
        cc: messageDetails.cc,
        date: messageDetails.date,
        tags: messageDetails.tags,
        attachments: this.extractAttachmentsFromParts(parts),
      };

      // Extract plain text body if available
      const bodyPart = parts.find((p) => p.contentType === 'text/plain' && !p.isAttachment);
      if (bodyPart) {
        message.body = bodyPart.body;
      }

      this.logger.debug('Full message retrieved', {
        messageId: message.id,
        subject: message.subject,
        from: message.from,
        partsCount: parts.length,
        attachmentsCount: message.attachments.length,
      });

      return message;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve full message', { messageId, error: errorMessage });
      throw new Error(`Failed to retrieve message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async getMessageHeaders(messageId: number): Promise<IEmailHeaders> {
    this.logger.debug('Retrieving message headers', { messageId });

    try {
      const messageDetails = await messenger.messages.get(messageId);

      // Get full message to extract headers
      const thunderbirdMessage = await messenger.messages.getFull(messageId);

      // Convert headers to Record<string, string>
      const headers: Record<string, string> = {};
      for (const [key, values] of Object.entries(thunderbirdMessage.headers)) {
        headers[key] = values.length > 0 ? values[0] : '';
      }

      const headersOnly: IEmailHeaders = {
        id: messageDetails.id,
        folderId: messageDetails.folderId?.toString(),
        headers,
        date: messageDetails.date,
        subject: messageDetails.subject,
        from: messageDetails.from,
      };

      this.logger.debug('Message headers retrieved', { messageId, subject: headersOnly.subject });

      return headersOnly;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve message headers', { messageId, error: errorMessage });
      throw new Error(`Failed to retrieve headers for message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async getRawMessage(messageId: number): Promise<string> {
    this.logger.debug('Retrieving raw message', { messageId });

    try {
      const thunderbirdMessage = await messenger.messages.getFull(messageId);

      // Thunderbird doesn't provide raw EML directly
      // We'll return a string representation of the message
      const raw = JSON.stringify(thunderbirdMessage);

      this.logger.debug('Raw message retrieved', { messageId });

      return raw;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve raw message', { messageId, error: errorMessage });
      throw new Error(`Failed to retrieve raw message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async parseMessageParts(message: IEmailMessage): Promise<IEmailPart[]> {
    this.logger.debug('Parsing message parts', { messageId: message.id });

    // Parts are already parsed in getFullMessage, just return them
    if (message.parts) {
      return message.parts;
    }

    // If no parts exist, try to get them again
    const fullMessage = await messenger.messages.getFull(message.id);
    const parts = this.convertMessageParts(fullMessage.parts);

    this.logger.debug('Message parts parsed', { count: parts.length });

    return parts;
  }

  /**
   * @inheritdoc
   */
  async getPlainTextBody(message: IEmailMessage): Promise<string> {
    this.logger.debug('Extracting plain text body', { messageId: message.id });

    // If body is already extracted, return it
    if (message.body) {
      return message.body;
    }

    // Otherwise, extract from parts
    const parts = message.parts || (await this.parseMessageParts(message));
    const plainTextPart = parts.find((p) => p.contentType === 'text/plain' && !p.isAttachment);

    if (!plainTextPart) {
      this.logger.warn('No plain text body found', { messageId: message.id });
      return '';
    }

    return plainTextPart.body;
  }

  /**
   * @inheritdoc
   */
  async getHTMLTextBody(message: IEmailMessage): Promise<string> {
    this.logger.debug('Extracting HTML body as text', { messageId: message.id });

    const parts = message.parts || (await this.parseMessageParts(message));
    const htmlPart = parts.find((p) => p.contentType === 'text/html' && !p.isAttachment);

    if (!htmlPart) {
      this.logger.warn('No HTML body found', { messageId: message.id });
      return '';
    }

    // Simple HTML to text conversion (strip HTML tags)
    // In production, use a proper library like html-to-text
    const text = htmlPart.body
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Convert non-breaking spaces
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();

    return text;
  }

  /**
   * @inheritdoc
   */
  async getAttachments(message: IEmailMessage): Promise<IEmailAttachment[]> {
    this.logger.debug('Extracting attachments', { messageId: message.id });

    const parts = message.parts || (await this.parseMessageParts(message));
    const attachments = this.extractAttachmentsFromParts(parts);

    this.logger.debug('Attachments extracted', {
      messageId: message.id,
      count: attachments.length,
    });

    return attachments;
  }

  /**
   * @inheritdoc
   */
  async getAttachmentContent(
    attachment: IEmailAttachment,
    _decodeBase64: boolean = false
  ): Promise<IEmailAttachmentContent> {
    this.logger.debug('Retrieving attachment content', {
      name: attachment.name,
      mimeType: attachment.mimeType,
    });

    try {
      // Note: Thunderbird WebExtension API doesn't provide direct attachment content access
      // In a full implementation, you would need to use a different approach
      // For now, return empty content with metadata

      const content: IEmailAttachmentContent = {
        ...attachment,
        content: '', // Thunderbird API limitation
        encoding: 'base64',
      };

      this.logger.debug('Attachment content retrieved', {
        name: attachment.name,
        size: content.content.length,
      });

      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve attachment content', {
        name: attachment.name,
        error: errorMessage,
      });
      throw new Error(`Failed to retrieve attachment '${attachment.name}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async getMessages(folderId: string, includeDeleted: boolean = false): Promise<IEmailHeaders[]> {
    this.logger.debug('Retrieving messages from folder', { folderId, includeDeleted });

    try {
      const result = await messenger.messages.list(folderId);

      const messages: IEmailHeaders[] = await Promise.all(
        result.messages.map(async (msg) => {
          const messageDetails = await messenger.messages.get(msg.id);
          // Get full message for headers
          const thunderbirdMessage = await messenger.messages.getFull(msg.id);
          const headers: Record<string, string> = {};
          for (const [key, values] of Object.entries(thunderbirdMessage.headers)) {
            headers[key] = values.length > 0 ? values[0] : '';
          }

          return {
            id: messageDetails.id,
            folderId: messageDetails.folderId?.toString(),
            headers,
            date: messageDetails.date,
            subject: messageDetails.subject,
            from: messageDetails.from,
          };
        })
      );

      this.logger.debug('Messages retrieved', {
        folderId,
        count: messages.length,
      });

      return messages;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve messages', {
        folderId,
        error: errorMessage,
      });
      throw new Error(`Failed to retrieve messages from folder '${folderId}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async queryMessages(query: IEmailQuery): Promise<IEmailHeaders[]> {
    this.logger.debug('Querying messages', { query });

    // Thunderbird WebExtension API has limited query support
    // For now, just return all messages from folder and filter in-memory
    let messages: IEmailHeaders[] = [];

    try {
      if (query.folderId) {
        messages = await this.getMessages(query.folderId);
      } else {
        // No folder specified - would need to iterate all folders
        this.logger.warn('Query without folderId not fully supported');
        return [];
      }

      // Apply in-memory filters (simplified implementation)
      let filtered = messages;

      if (query.subject) {
        const subjectLower = query.subject.toLowerCase();
        filtered = filtered.filter(
          (m) => m.subject && m.subject.toLowerCase().includes(subjectLower)
        );
      }

      if (query.from) {
        const fromLower = query.from.toLowerCase();
        filtered = filtered.filter((m) => m.from && m.from.toLowerCase().includes(fromLower));
      }

      if (query.dateAfter) {
        filtered = filtered.filter((m) => m.date && m.date >= query.dateAfter!);
      }

      if (query.dateBefore) {
        filtered = filtered.filter((m) => m.date && m.date <= query.dateBefore!);
      }

      if (query.limit) {
        filtered = filtered.slice(0, query.limit);
      }

      this.logger.debug('Messages queried', {
        total: messages.length,
        filtered: filtered.length,
      });

      return filtered;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to query messages', { query, error: errorMessage });
      throw new Error(`Failed to query messages: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async parseEMLFile(fileContent: string): Promise<IEMLParseResult> {
    this.logger.debug('Parsing EML file', { length: fileContent.length });

    try {
      // Simplified EML parsing
      // In production, use a proper EML parser library
      const lines = fileContent.split('\n');
      const headers: Record<string, string> = {};
      let body = '';
      let inHeaders = true;

      for (const line of lines) {
        if (inHeaders && line.trim() === '') {
          inHeaders = false;
          continue;
        }

        if (inHeaders) {
          const match = line.match(/^([^:]+):\s*(.*)$/);
          if (match) {
            headers[match[1].trim().toLowerCase()] = match[2].trim();
          }
        } else {
          body += line + '\n';
        }
      }

      const message: IEmailMessage = {
        id: 0,
        headers,
        body: body.trim(),
        attachments: [],
        subject: headers.subject || '',
        from: headers.from || '',
      };

      const result: IEMLParseResult = {
        message,
        raw: fileContent,
      };

      this.logger.debug('EML file parsed', {
        subject: message.subject,
        from: message.from,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to parse EML file', { error: errorMessage });
      throw new Error(`Failed to parse EML file: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Converts Thunderbird message parts to IEmailPart format.
   *
   * @param parts - Thunderbird message parts
   * @returns Converted email parts
   */
  private convertMessageParts(parts: ThunderbirdMessagePart[]): IEmailPart[] {
    const convert = (part: ThunderbirdMessagePart): IEmailPart => {
      // Map contentDisposition to valid types
      const validDisposition =
        part.contentDisposition === 'inline'
          ? 'inline'
          : part.contentDisposition === 'attachment'
            ? 'attachment'
            : undefined;

      const converted: IEmailPart = {
        contentType: part.contentType,
        body: part.body,
        isAttachment: part.isAttachment,
        size: part.size,
        name: part.name,
        contentId: part.contentId,
        contentDisposition: validDisposition,
        charset: part.charset,
      };

      if (part.parts && part.parts.length > 0) {
        converted.parts = part.parts.map(convert);
      }

      return converted;
    };

    return parts.map(convert);
  }

  /**
   * Extracts attachment metadata from message parts.
   *
   * @param parts - Email parts
   * @returns Array of attachment metadata
   */
  private extractAttachmentsFromParts(parts: IEmailPart[]): IEmailAttachment[] {
    const attachments: IEmailAttachment[] = [];

    const extract = (part: IEmailPart): void => {
      if (part.isAttachment && part.name) {
        attachments.push({
          name: part.name,
          mimeType: part.contentType,
          size: part.size || 0,
          contentId: part.contentId,
          contentDisposition: part.contentDisposition,
        });
      }

      // Recursively extract from nested parts
      if (part.parts) {
        for (const nested of part.parts) {
          extract(nested);
        }
      }
    };

    for (const part of parts) {
      extract(part);
    }

    return attachments;
  }
}
