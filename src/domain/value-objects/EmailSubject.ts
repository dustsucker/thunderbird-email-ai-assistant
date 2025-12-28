/**
 * Value Object for Email Subject
 * Immutable value object representing an email subject line
 */
export class EmailSubject {
	readonly value: string;
	private readonly MAX_LENGTH = 998; // RFC 5322 limit

	constructor(value: string) {
		const trimmed = value.trim();
		this.validate(trimmed);
		this.value = trimmed;
	}

	/** Validates subject line */
	private validate(subject: string): void {
		if (subject.length > this.MAX_LENGTH) {
			throw new Error(
				`Subject line exceeds maximum length of ${this.MAX_LENGTH} characters`
			);
		}
	}

	/** Returns true if subject is empty or only whitespace */
	isEmpty(): boolean {
		return this.value.length === 0;
	}

	/** Returns a truncated version if needed */
	truncate(maxLength: number): EmailSubject {
		if (this.value.length <= maxLength) {
			return this;
		}
		return new EmailSubject(this.value.substring(0, maxLength - 3) + '...');
	}

	/** Checks if subject contains a keyword (case-insensitive) */
	contains(keyword: string): boolean {
		return this.value.toLowerCase().includes(keyword.toLowerCase());
	}

	/** Checks if this subject equals another */
	equals(other: EmailSubject): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}

	/** Static factory method for empty subject */
	static empty(): EmailSubject {
		return new EmailSubject('');
	}

	/** Static factory method for validation */
	static isValid(subject: string): boolean {
		try {
			new EmailSubject(subject);
			return true;
		} catch {
			return false;
		}
	}
}
