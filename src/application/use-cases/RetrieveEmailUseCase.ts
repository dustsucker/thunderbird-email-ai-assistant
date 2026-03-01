/**
 * RetrieveEmailUseCase
 *
 * Handles email retrieval from Thunderbird.
 * Encapsulates all logic for fetching email messages via IMailReader.
 *
 * @module application/use-cases/RetrieveEmailUseCase
 */

import { injectable, inject } from 'tsyringe';
import type { IMailReader, IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { ILogger } from '@/domain/interfaces';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of email retrieval.
 */
export interface RetrieveEmailResult {
  /** The retrieved email message */
  email: IEmailMessage;
  /** Message ID as number */
  messageIdNum: number;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * RetrieveEmailUseCase
 *
 * Responsible for retrieving email messages from Thunderbird.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<RetrieveEmailUseCase>(RetrieveEmailUseCase);
 * const result = await useCase.execute('12345');
 * console.log(`Retrieved: ${result.email.subject}`);
 * ```
 */
@injectable()
export class RetrieveEmailUseCase {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('IMailReader') private readonly mailReader: IMailReader,
    @inject('ILogger') private readonly logger: ILogger
  ) {
    this.logger.debug('✅ RetrieveEmailUseCase initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Retrieves an email message from Thunderbird.
   *
   * @param messageId - Message ID as string
   * @returns Promise resolving to email message and parsed ID
   *
   * @throws {Error} If message ID is invalid
   * @throws {Error} If message cannot be retrieved
   * @throws {Error} If message is not found
   *
   * @example
   * ```typescript
   * const result = await useCase.execute('12345');
   * console.log(`Subject: ${result.email.subject}`);
   * ```
   */
  async execute(messageId: string): Promise<RetrieveEmailResult> {
    this.logger.debug('📬 Retrieving email from Thunderbird', { messageId });

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      const email = await this.mailReader.getFullMessage(messageIdNum);

      if (!email) {
        throw new Error(`Email not found: ${messageId}`);
      }

      this.logger.debug('✅ Email retrieved successfully', {
        messageId,
        subject: email.subject,
        from: email.from,
      });

      return { email, messageIdNum };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to retrieve email', { messageId, error: errorMessage });
      throw error;
    }
  }
}
