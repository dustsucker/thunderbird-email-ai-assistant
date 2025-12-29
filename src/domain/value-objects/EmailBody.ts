/**
 * Value Object for Email Body
 * Immutable value object representing email body content
 */
export class EmailBody {
	readonly value: string;
	private readonly MAX_LENGTH = 1000000; // 1MB limit

	constructor(value: string) {
		this.value = value;
		this.validate();
	}

	/** Validates body content */
	private validate(): void {
		if (this.value.length > this.MAX_LENGTH) {
			throw new Error(
				`Email body exceeds maximum length of ${this.MAX_LENGTH} characters`
			);
		}
	}

	/** Returns true if body is empty */
	isEmpty(): boolean {
		return this.value.trim().length === 0;
	}

	/** Returns body length in characters */
	getLength(): number {
		return this.value.length;
	}

	/** Extracts plain text (strips HTML if present) */
	getPlainText(): string {
		if (this.isHtml()) {
			return this.stripHtml(this.value);
		}
		return this.value;
	}

	/** Checks if body contains HTML */
	isHtml(): boolean {
		return /<[^>]+>/.test(this.value);
	}

	/** Strips HTML tags from content */
	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.trim();
	}

	/** Extracts all URLs from body */
	extractUrls(): string[] {
		const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[]]+/g;
		return this.value.match(urlRegex) || [];
	}

	/** Extracts all email addresses from body */
	extractEmails(): string[] {
		const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
		return this.value.match(emailRegex) || [];
	}

	/** Checks if body contains a keyword (case-insensitive) */
	contains(keyword: string): boolean {
		return this.value.toLowerCase().includes(keyword.toLowerCase());
	}

	/** Checks if this body equals another */
	equals(other: EmailBody): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}

	/** Static factory method for empty body */
	static empty(): EmailBody {
		return new EmailBody('');
	}

	/** Static factory method from HTML */
	static fromHtml(html: string): EmailBody {
		return new EmailBody(html);
	}

	/** Static factory method from plain text */
	static fromText(text: string): EmailBody {
		return new EmailBody(text);
	}
}
