/**
 * Mail Reader interface for the Thunderbird Email AI Assistant.
 *
 * Defines the contract for reading and parsing email messages from Thunderbird.
 * This interface abstracts the messenger.messages API and provides a clean,
 * type-safe interface for email operations including message retrieval,
 * MIME parsing, attachment extraction, and search.
 *
 * @example
 * ```typescript
 * import { injectable } from 'tsyringe';
 * import { IMailReader } from './infrastructure/interfaces/IMailReader';
 *
 * @injectable()
 * class ThunderbirdMailReader implements IMailReader {
 *   async getFullMessage(messageId: number): Promise<IEmailMessage> {
 *     // Implementation using messenger.messages.getFull()
 *   }
 * }
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Email message structure representing a complete Thunderbird message.
 *
 * Contains message metadata, headers, parsed body content, and attachments.
 * This is the primary data structure for email analysis operations.
 */
export interface IEmailMessage {
  /** Unique message identifier from Thunderbird */
  id: number;
  /** Folder identifier where the message resides */
  folderId?: string;
  /** Account identifier for the message */
  accountId?: number;
  /** Email headers as key-value pairs (multi-value headers joined) */
  headers: Record<string, string>;
  /** Message parts structure for MIME parsing */
  parts?: IEmailPart[];
  /** Plain text body content (extracted from parts) */
  body?: string;
  /** List of email attachments */
  attachments: IEmailAttachment[];
  /** Message tags (Thunderbird tags applied to the message) */
  tags?: string[];
  /** Raw message source (EML format) if available */
  raw?: string;
  /** Message timestamp (Unix epoch in milliseconds) */
  date?: number;
  /** Message subject */
  subject?: string;
  /** Message sender (From header) */
  from?: string;
  /** Message recipients (To header) */
  to?: string[];
  /** CC recipients */
  cc?: string[];
}

/**
 * Email message headers-only variant.
 *
 * Lightweight version of IEmailMessage containing only headers
 * and minimal metadata. Useful for quick lookups without
 * fetching full message content.
 */
export interface IEmailHeaders {
  /** Unique message identifier */
  id: number;
  /** Folder identifier */
  folderId?: string;
  /** Email headers */
  headers: Record<string, string>;
  /** Message timestamp */
  date?: number;
  /** Message subject */
  subject?: string;
  /** Message sender */
  from?: string;
}

/**
 * MIME email part structure.
 *
 * Represents a single part of a MIME email structure, which can be
 * recursively nested. Supports plain text, HTML, and attachments.
 */
export interface IEmailPart {
  /** MIME content type (e.g., 'text/plain', 'text/html', 'application/pdf') */
  contentType: string;
  /** Part content (decoded from base64/quoted-printable) */
  body: string;
  /** Whether this part is an attachment */
  isAttachment: boolean;
  /** Attachment filename (if applicable) */
  name?: string;
  /** Part size in bytes */
  size?: number;
  /** Nested MIME parts (for multipart/* content types) */
  parts?: IEmailPart[];
  /** Content-ID for inline attachments (e.g., images in HTML) */
  contentId?: string;
  /** Content disposition (inline/attachment) */
  contentDisposition?: 'inline' | 'attachment';
  /** Character encoding */
  charset?: string;
}

/**
 * Email attachment metadata.
 *
 * Contains information about email attachments without the actual content.
 * Use getAttachmentContent() to retrieve attachment data.
 */
export interface IEmailAttachment {
  /** Part identifier within the message structure */
  partId?: string;
  /** Original filename */
  name: string;
  /** MIME type of the attachment */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Content-ID for inline attachments */
  contentId?: string;
  /** Content disposition */
  contentDisposition?: 'inline' | 'attachment';
}

/**
 * Email attachment with content.
 *
 * Extended attachment interface including the actual content data.
 */
export interface IEmailAttachmentContent extends IEmailAttachment {
  /** Attachment content as base64 encoded string */
  content: string;
  /** Encoding type (base64, quoted-printable, etc.) */
  encoding?: string;
}

/**
 * Email query parameters for searching messages.
 *
 * Supports filtering messages by various criteria.
 * All parameters are optional; omitting a parameter means no filter.
 */
export interface IEmailQuery {
  /** Folder ID to search within (omit for all folders) */
  folderId?: string;
  /** Account ID to filter by */
  accountId?: number;
  /** Filter by subject (partial match, case-insensitive) */
  subject?: string;
  /** Filter by sender (partial match, case-insensitive) */
  from?: string;
  /** Filter by recipient (partial match, case-insensitive) */
  to?: string;
  /** Minimum timestamp (Unix epoch in milliseconds) */
  dateAfter?: number;
  /** Maximum timestamp (Unix epoch in milliseconds) */
  dateBefore?: number;
  /** Filter by tags (messages must have all specified tags) */
  tags?: string[];
  /** Maximum number of results to return */
  limit?: number;
  /** Skip the first N results (for pagination) */
  offset?: number;
  /** Sort order ('date' | 'subject' | 'from', default: 'date') */
  sortBy?: 'date' | 'subject' | 'from';
  /** Sort direction ('asc' | 'desc', default: 'desc') */
  sortOrder?: 'asc' | 'desc';
}

/**
 * EML file parsing result.
 *
 * Result of parsing an EML file containing message content and metadata.
 */
export interface IEMLParseResult {
  /** Parsed message structure */
  message: IEmailMessage;
  /** Original EML content */
  raw: string;
  /** Parse errors (if any) */
  errors?: string[];
}

// ============================================================================
// Main IMailReader Interface
// ============================================================================

/**
 * Mail Reader interface for Thunderbird email access.
 *
 * Provides a comprehensive API for reading, parsing, and searching emails.
 * All operations are asynchronous and return Promises to support non-blocking
 * operations. Implementations should handle errors gracefully and provide
 * meaningful error messages.
 *
 * @example
 * ```typescript
 * import { container } from 'tsyringe';
 * import { IMailReader } from './IMailReader';
 *
 * const reader = container.resolve<IMailReader>('IMailReader');
 *
 * // Get full message
 * const message = await reader.getFullMessage(12345);
 * console.log(message.subject, message.from);
 *
 * // Get attachments
 * const attachments = await reader.getAttachments(message);
 * for (const attachment of attachments) {
 *   const content = await reader.getAttachmentContent(attachment);
 *   console.log(`Attachment: ${attachment.name}, size: ${content.content.length}`);
 * }
 * ```
 */
export interface IMailReader {
  /**
   * Retrieves a complete email message by ID.
   *
   * Fetches the full message including headers, body, and attachments.
   * This is the most comprehensive message retrieval method and should
   * be used when you need complete message data.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to complete email message
   *
   * @throws {Error} If message does not exist or cannot be accessed
   * @throws {Error} If Thunderbird API is unavailable
   *
   * @example
   * ```typescript
   * const message = await reader.getFullMessage(12345);
   * console.log(`Subject: ${message.subject}`);
   * console.log(`From: ${message.from}`);
   * console.log(`Body: ${message.body}`);
   * ```
   */
  getFullMessage(messageId: number): Promise<IEmailMessage>;

  /**
   * Retrieves message headers only.
   *
   * Returns a lightweight message object containing only headers and
   * minimal metadata. Useful for quick lookups when body content is not needed.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to message headers
   *
   * @throws {Error} If message does not exist or cannot be accessed
   *
   * @example
   * ```typescript
   * const headers = await reader.getMessageHeaders(12345);
   * console.log(`Subject: ${headers.subject}`);
   * console.log(`From: ${headers.headers['from']}`);
   * ```
   */
  getMessageHeaders(messageId: number): Promise<IEmailHeaders>;

  /**
   * Retrieves raw EML content for a message.
   *
   * Returns the original RFC822 message source including all headers,
   * MIME structure, and encoded content. Useful for debugging or
   * re-parsing messages with different parsers.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to raw EML content as string
   *
   * @throws {Error} If message does not exist or cannot be accessed
   *
   * @example
   * ```typescript
   * const eml = await reader.getRawMessage(12345);
   * console.log(eml); // Full EML source
   * ```
   */
  getRawMessage(messageId: number): Promise<string>;

  /**
   * Parses message parts into a structured tree.
   *
   * Takes a message object (or raw message parts) and returns a
   * fully parsed MIME structure. Handles multipart/mixed,
   * multipart/alternative, and nested MIME structures.
   *
   * @param message - Message object or parts to parse
   * @returns Promise resolving to array of parsed email parts
   *
   * @throws {Error} If message structure is invalid
   *
   * @example
   * ```typescript
   * const parts = await reader.parseMessageParts(message);
   * for (const part of parts) {
   *   if (part.isAttachment) {
   *     console.log(`Attachment: ${part.name}`);
   *   } else if (part.contentType === 'text/plain') {
   *     console.log(`Plain text: ${part.body}`);
   *   }
   * }
   * ```
   */
  parseMessageParts(message: IEmailMessage): Promise<IEmailPart[]>;

  /**
   * Extracts plain text body from message.
   *
   * Searches message parts for text/plain content and returns it.
   * If no plain text part exists, converts HTML to text if available.
   *
   * @param message - Message to extract body from
   * @returns Promise resolving to plain text body string
   *
   * @throws {Error} If message has no extractable body content
   *
   * @example
   * ```typescript
   * const body = await reader.getPlainTextBody(message);
   * console.log(body);
   * ```
   */
  getPlainTextBody(message: IEmailMessage): Promise<string>;

  /**
   * Extracts and converts HTML body to plain text.
   *
   * Searches for text/html content and converts it to readable plain text
   * using HTML-to-text conversion. Removes tags, formatting, and extracts
   * readable content.
   *
   * @param message - Message to convert HTML from
   * @returns Promise resolving to HTML content converted to plain text
   *
   * @throws {Error} If message has no HTML content
   *
   * @example
   * ```typescript
   * const htmlAsText = await reader.getHTMLTextBody(message);
   * console.log(htmlAsText); // HTML converted to plain text
   * ```
   */
  getHTMLTextBody(message: IEmailMessage): Promise<string>;

  /**
   * Extracts all attachments from a message.
   *
   * Scans message parts and returns metadata for all attachments.
   * Does not include attachment content; use getAttachmentContent()
   * to retrieve actual attachment data.
   *
   * @param message - Message to extract attachments from
   * @returns Promise resolving to array of attachment metadata
   *
   * @example
   * ```typescript
   * const attachments = await reader.getAttachments(message);
   * console.log(`Found ${attachments.length} attachments`);
   * for (const attachment of attachments) {
   *   console.log(`  - ${attachment.name} (${attachment.mimeType})`);
   * }
   * ```
   */
  getAttachments(message: IEmailMessage): Promise<IEmailAttachment[]>;

  /**
   * Retrieves attachment content.
   *
   * Fetches the actual content of an attachment. Returns base64 encoded
   * content by default. Supports decoding various content transfer
   * encodings (base64, quoted-printable, etc.).
   *
   * @param attachment - Attachment to retrieve content for
   * @param decodeBase64 - Whether to decode base64 content (default: false)
   * @returns Promise resolving to attachment with content
   *
   * @throws {Error} If attachment cannot be accessed or decoded
   *
   * @example
   * ```typescript
   * const attachments = await reader.getAttachments(message);
   * for (const attachment of attachments) {
   *   const content = await reader.getAttachmentContent(attachment);
   *   console.log(`${attachment.name}: ${content.content.length} bytes`);
   *   // Save to file or process content
   * }
   * ```
   */
  getAttachmentContent(
    attachment: IEmailAttachment,
    decodeBase64?: boolean
  ): Promise<IEmailAttachmentContent>;

  /**
   * Retrieves all messages in a folder.
   *
   * Fetches message headers for all messages in the specified folder.
   * Returns an array of message objects with headers only. For full
   * message content, call getFullMessage() on each message ID.
   *
   * @param folderId - Thunderbird folder ID
   * @param includeDeleted - Whether to include deleted/trashed messages (default: false)
   * @returns Promise resolving to array of messages
   *
   * @throws {Error} If folder does not exist or cannot be accessed
   *
   * @example
   * ```typescript
   * const messages = await reader.getMessages('/account/INBOX');
   * console.log(`Folder contains ${messages.length} messages`);
   * ```
   */
  getMessages(folderId: string, includeDeleted?: boolean): Promise<IEmailHeaders[]>;

  /**
   * Queries messages based on search criteria.
   *
   * Searches for messages matching the specified query parameters.
   * Supports filtering by folder, account, date range, sender,
   * subject, tags, and more. Returns message headers only.
   *
   * @param query - Query parameters for filtering messages
   * @returns Promise resolving to array of matching messages
   *
   * @throws {Error} If query parameters are invalid
   *
   * @example
   * ```typescript
   * const results = await reader.queryMessages({
   *   folderId: '/account/INBOX',
   *   subject: 'invoice',
   *   dateAfter: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
   *   limit: 50
   * });
   * console.log(`Found ${results.length} matching messages`);
   * ```
   */
  queryMessages(query: IEmailQuery): Promise<IEmailHeaders[]>;

  /**
   * Parses an EML file into a message object.
   *
   * Parses RFC822 EML format content and returns a structured message
   * object. Handles MIME parsing, header extraction, and attachment
   * identification. Does not interact with Thunderbird API.
   *
   * @param fileContent - Raw EML file content as string
   * @returns Promise resolving to parsed message
   *
   * @throws {Error} If EML content is invalid or cannot be parsed
   *
   * @example
   * ```typescript
   * const emlContent = fs.readFileSync('message.eml', 'utf-8');
   * const parsed = await reader.parseEMLFile(emlContent);
   * console.log(`Subject: ${parsed.message.subject}`);
   * console.log(`Attachments: ${parsed.message.attachments.length}`);
   * ```
   */
  parseEMLFile(fileContent: string): Promise<IEMLParseResult>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a part has nested parts.
 *
 * Useful for distinguishing between leaf nodes and multipart containers
 * in the MIME structure tree.
 *
 * @param part - Email part to check
 * @returns True if part has nested parts
 *
 * @example
 * ```typescript
 * if (hasNestedParts(part)) {
 *   for (const nested of part.parts) {
 *     processPart(nested);
 *   }
 * }
 * ```
 */
export function hasNestedParts(part: IEmailPart): part is IEmailPart & { parts: IEmailPart[] } {
  return part.parts !== undefined && part.parts.length > 0;
}

/**
 * Type guard to check if a part is a plain text body.
 *
 * @param part - Email part to check
 * @returns True if part is a plain text body part
 *
 * @example
 * ```typescript
 * if (isPlainTextBody(part)) {
 *   console.log(part.body);
 * }
 * ```
 */
export function isPlainTextBody(part: IEmailPart): boolean {
  return part.contentType === 'text/plain' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an HTML body.
 *
 * @param part - Email part to check
 * @returns True if part is an HTML body part
 *
 * @example
 * ```typescript
 * if (isHtmlBody(part)) {
 *   const text = htmlToText(part.body);
 *   console.log(text);
 * }
 * ```
 */
export function isHtmlBody(part: IEmailPart): boolean {
  return part.contentType === 'text/html' && !part.isAttachment;
}

/**
 * Type guard to check if a part is an attachment.
 *
 * @param part - Email part to check
 * @returns True if part is an attachment
 *
 * @example
 * ```typescript
 * if (isAttachment(part)) {
 *   console.log(`Attachment: ${part.name}`);
 * }
 * ```
 */
export function isAttachment(part: IEmailPart): boolean {
  return part.isAttachment || part.name !== undefined;
}

/**
 * Type guard to check if attachment has content loaded.
 *
 * @param attachment - Attachment to check
 * @returns True if attachment has content property
 *
 * @example
 * ```typescript
 * if (hasAttachmentContent(attachment)) {
 *   console.log(`Size: ${attachment.content.length} bytes`);
 * }
 * ```
 */
export function hasAttachmentContent(
  attachment: IEmailAttachment | IEmailAttachmentContent
): attachment is IEmailAttachmentContent {
  return 'content' in attachment && typeof (attachment as IEmailAttachmentContent).content === 'string';
}
