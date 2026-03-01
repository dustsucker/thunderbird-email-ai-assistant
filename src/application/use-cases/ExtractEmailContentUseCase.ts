/**
 * ExtractEmailContentUseCase
 *
 * Handles extraction of structured content from email messages.
 * Transforms raw email data into a format suitable for AI analysis.
 *
 * @module application/use-cases/ExtractEmailContentUseCase
 */

import { injectable, inject } from 'tsyringe';
import type { IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { IStructuredEmailData, IAttachment } from '@/infrastructure/interfaces/IProvider';
import type { ILogger } from '@/domain/interfaces';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * ExtractEmailContentUseCase
 *
 * Responsible for extracting structured content from email messages
 * for AI analysis.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<ExtractEmailContentUseCase>(ExtractEmailContentUseCase);
 * const data = await useCase.execute(email);
 * console.log(`Body length: ${data.body.length}`);
 * ```
 */
@injectable()
export class ExtractEmailContentUseCase {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject(EmailContentExtractor) private readonly contentExtractor: EmailContentExtractor,
    @inject('ILogger') private readonly logger: ILogger
  ) {
    this.logger.debug('✅ ExtractEmailContentUseCase initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Extracts structured content from an email message.
   *
   * @param email - Email message to extract from
   * @returns Structured email data for AI analysis
   *
   * @throws {Error} If content extraction fails
   *
   * @example
   * ```typescript
   * const structuredData = await useCase.execute(email);
   * console.log(`Attachments: ${structuredData.attachments.length}`);
   * ```
   */
  async execute(email: IEmailMessage): Promise<IStructuredEmailData> {
    this.logger.debug('📄 Extracting email content', { messageId: email.id });

    try {
      // Parse email parts if available
      let body = email.body || '';
      const attachments: IAttachment[] = [];

      if (email.parts && email.parts.length > 0) {
        this.logger.debug('📎 Processing email parts', { partCount: email.parts.length });
        const parsed = this.contentExtractor.findEmailParts(email.parts);
        body = parsed.body;
        parsed.attachments.forEach((att) => {
          attachments.push({
            name: att.name,
            mimeType: att.mimeType,
            size: att.size,
          });
        });
        this.logger.debug('✅ Email parts processed', {
          bodyLength: body.length,
          attachmentCount: attachments.length,
        });
      }

      // Also check direct attachments
      if (email.attachments && email.attachments.length > 0) {
        this.logger.debug('📎 Processing direct attachments', {
          attachmentCount: email.attachments.length,
        });
        email.attachments.forEach((att) => {
          if (!attachments.some((a) => a.name === att.name)) {
            attachments.push({
              name: att.name,
              mimeType: att.mimeType,
              size: att.size,
            });
          }
        });
      }

      const structuredData: IStructuredEmailData = {
        headers: email.headers || {},
        body,
        attachments,
      };

      this.logger.debug('✅ Email content extracted', {
        bodyLength: body.length,
        attachmentsCount: attachments.length,
      });

      return structuredData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to extract email content', {
        messageId: email.id,
        error: errorMessage,
      });
      throw error;
    }
  }
}
