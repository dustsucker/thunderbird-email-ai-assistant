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
 * Low confidence flag information
 */
export interface LowConfidenceFlag {
	/** Tag key that was below threshold */
	tagKey: string;
	/** Confidence score (0-1 range) */
	confidence: number;
	/** Threshold that was not met (0-100 range) */
	threshold: number;
	/** Threshold type (custom or global) */
	thresholdType: 'custom' | 'global';
	/** Reasoning explaining why classification was low confidence */
	reasoning: string;
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
	/** Low confidence flags for tags that didn't meet threshold */
	private lowConfidenceFlags: Map<string, LowConfidenceFlag>;

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
		this.lowConfidenceFlags = new Map();
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
			hasLowConfidenceFlags: this.hasLowConfidenceFlags(),
			lowConfidenceFlagCount: this.getLowConfidenceFlagCount(),
		};
	}

	/**
	 * Adds a low confidence flag for a tag
	 *
	 * @param flag - Low confidence flag information
	 * @throws {Error} If flag data is invalid
	 */
	flagLowConfidence(flag: LowConfidenceFlag): void {
		if (!flag.tagKey || flag.tagKey.trim().length === 0) {
			throw new Error('Tag key cannot be empty');
		}
		if (flag.confidence < 0 || flag.confidence > 1) {
			throw new Error('Confidence must be between 0 and 1');
		}
		if (flag.threshold < 0 || flag.threshold > 100) {
			throw new Error('Threshold must be between 0 and 100');
		}
		if (!flag.reasoning || flag.reasoning.trim().length === 0) {
			throw new Error('Reasoning cannot be empty');
		}

		this.lowConfidenceFlags.set(flag.tagKey, flag);
	}

	/**
	 * Checks if email has any low confidence flags
	 *
	 * @returns True if email has low confidence flags
	 */
	hasLowConfidenceFlags(): boolean {
		return this.lowConfidenceFlags.size > 0;
	}

	/**
	 * Gets all low confidence flags
	 *
	 * @returns Array of low confidence flags
	 */
	getLowConfidenceFlags(): LowConfidenceFlag[] {
		return Array.from(this.lowConfidenceFlags.values());
	}

	/**
	 * Gets low confidence flag for a specific tag
	 *
	 * @param tagKey - Tag key to get flag for
	 * @returns Low confidence flag or undefined if not found
	 */
	getLowConfidenceFlag(tagKey: string): LowConfidenceFlag | undefined {
		return this.lowConfidenceFlags.get(tagKey);
	}

	/**
	 * Removes a low confidence flag
	 *
	 * @param tagKey - Tag key to remove flag for
	 */
	removeLowConfidenceFlag(tagKey: string): void {
		this.lowConfidenceFlags.delete(tagKey);
	}

	/**
	 * Clears all low confidence flags
	 */
	clearLowConfidenceFlags(): void {
		this.lowConfidenceFlags.clear();
	}

	/**
	 * Gets count of low confidence flags
	 *
	 * @returns Number of low confidence flags
	 */
	getLowConfidenceFlagCount(): number {
		return this.lowConfidenceFlags.size;
	}
}
