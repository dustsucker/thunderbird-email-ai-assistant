import type { EmailAddress } from '../value-objects/EmailAddress';
import type { EmailSubject } from '../value-objects/EmailSubject';
import type { EmailBody } from '../value-objects/EmailBody';

/**
 * Attachment Value Object
 */
export interface Attachment {
	readonly fileName: string;
	readonly mimeType: string;
	readonly size: number; // in bytes
	readonly contentId?: string;
}

/**
 * Email Entity
 * Represents an email with business logic for tagging and querying
 */
export class Email {
	readonly id: string;
	readonly subject: EmailSubject;
	readonly sender: EmailAddress;
	readonly recipients: readonly EmailAddress[];
	readonly body: EmailBody;
	readonly attachments: readonly Attachment[];
	readonly tags: Set<string>;
	readonly timestamp: Date;

	constructor({
		id,
		subject,
		sender,
		recipients,
		body,
		attachments = [],
		tags = [],
		timestamp = new Date(),
	}: {
		id: string;
		subject: EmailSubject;
		sender: EmailAddress;
		recipients: EmailAddress[];
		body: EmailBody;
		attachments?: Attachment[];
		tags?: string[];
		timestamp?: Date;
	}) {
		if (!id || id.trim().length === 0) {
			throw new Error('Email ID cannot be empty');
		}

		this.id = id;
		this.subject = subject;
		this.sender = sender;
		this.recipients = recipients;
		this.body = body;
		this.attachments = attachments;
		this.tags = new Set(tags);
		this.timestamp = timestamp;
	}

	/**
	 * Checks if email has a specific attachment by file name
	 */
	hasAttachment(fileName: string): boolean {
		return this.attachments.some(
			(attachment) => attachment.fileName.toLowerCase() === fileName.toLowerCase()
		);
	}

	/**
	 * Gets all attachments matching a specific MIME type
	 */
	getAttachmentsByMimeType(mimeType: string): Attachment[] {
		return this.attachments.filter(
			(attachment) => attachment.mimeType.toLowerCase() === mimeType.toLowerCase()
		);
	}

	/**
	 * Gets all PDF attachments
	 */
	getPdfAttachments(): Attachment[] {
		return this.getAttachmentsByMimeType('application/pdf');
	}

	/**
	 * Gets all image attachments
	 */
	getImageAttachments(): Attachment[] {
		const imageMimeTypes = [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'image/svg+xml',
		];
		return this.attachments.filter((attachment) =>
			imageMimeTypes.includes(attachment.mimeType.toLowerCase())
		);
	}

	/**
	 * Checks if email is from a specific sender
	 */
	isFromSender(email: string): boolean {
		return this.sender.toString().toLowerCase() === email.toLowerCase();
	}

	/**
	 * Checks if sender is in a specific domain
	 */
	isFromDomain(domain: string): boolean {
		return this.sender.getDomain().toLowerCase() === domain.toLowerCase();
	}

	/**
	 * Checks if email is older than specified number of days
	 */
	isOlderThan(days: number): boolean {
		const ageInMs = Date.now() - this.timestamp.getTime();
		const daysInMs = days * 24 * 60 * 60 * 1000;
		return ageInMs > daysInMs;
	}

	/**
	 * Checks if email is newer than specified number of days
	 */
	isNewerThan(days: number): boolean {
		const ageInMs = Date.now() - this.timestamp.getTime();
		const daysInMs = days * 24 * 60 * 60 * 1000;
		return ageInMs < daysInMs;
	}

	/**
	 * Applies a tag to the email
	 */
	applyTag(tagKey: string): void {
		if (!tagKey || tagKey.trim().length === 0) {
			throw new Error('Tag key cannot be empty');
		}
		this.tags.add(tagKey.trim().toLowerCase());
	}

	/**
	 * Removes a tag from the email
	 */
	removeTag(tagKey: string): void {
		if (!tagKey || tagKey.trim().length === 0) {
			throw new Error('Tag key cannot be empty');
		}
		this.tags.delete(tagKey.trim().toLowerCase());
	}

	/**
	 * Checks if email has a specific tag
	 */
	hasTag(tagKey: string): boolean {
		return this.tags.has(tagKey.trim().toLowerCase());
	}

	/**
	 * Gets all tags as an array
	 */
	getTags(): string[] {
		return Array.from(this.tags);
	}

	/**
	 * Checks if email has any attachments
	 */
	hasAttachments(): boolean {
		return this.attachments.length > 0;
	}

	/**
	 * Gets total size of all attachments in bytes
	 */
 getTotalAttachmentSize(): number {
		return this.attachments.reduce((total, attachment) => total + attachment.size, 0);
	}

	/**
	 * Checks if body contains a keyword
	 */
	bodyContains(keyword: string): boolean {
		return this.body.contains(keyword);
	}

	/**
	 * Checks if subject contains a keyword
	 */
	subjectContains(keyword: string): boolean {
		return this.subject.contains(keyword);
	}

	/**
	 * Gets the age of the email in days
	 */
	getAgeInDays(): number {
		const ageInMs = Date.now() - this.timestamp.getTime();
		return ageInMs / (24 * 60 * 60 * 1000);
	}

	/**
	 * Checks if recipient list contains an email address
	 */
	hasRecipient(email: string): boolean {
		const lowerEmail = email.toLowerCase();
		return this.recipients.some(
			(recipient) => recipient.toString().toLowerCase() === lowerEmail
		);
	}

	/**
	 * Returns a summary object
	 */
	toSummary() {
		return {
			id: this.id,
			subject: this.subject.toString(),
			sender: this.sender.toString(),
			recipients: this.recipients.map((r) => r.toString()),
			hasAttachments: this.hasAttachments(),
			tags: this.getTags(),
			timestamp: this.timestamp.toISOString(),
		};
	}
}
