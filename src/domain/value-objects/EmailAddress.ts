/**
 * Value Object for Email Address
 * Immutable value object representing a valid email address
 */
export class EmailAddress {
	readonly value: string;

	constructor(value: string) {
		const trimmed = value.trim();
		this.validate(trimmed);
		this.value = trimmed;
	}

	/** Validates email format */
	private validate(email: string): void {
		if (!email) {
			throw new Error('Email address cannot be empty');
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			throw new Error(`Invalid email address format: ${email}`);
		}
	}

	/** Gets the local part of the email (before @) */
	getLocalPart(): string {
		return this.value.split('@')[0];
	}

	/** Gets the domain part of the email (after @) */
	getDomain(): string {
		return this.value.split('@')[1];
	}

	/** Checks if this email equals another */
	equals(other: EmailAddress): boolean {
		return this.value.toLowerCase() === other.value.toLowerCase();
	}

	/** Returns lowercase version for comparison */
	toString(): string {
		return this.value.toLowerCase();
	}

	/** Static factory method for validation */
	static isValid(email: string): boolean {
		try {
			new EmailAddress(email);
			return true;
		} catch {
			return false;
		}
	}
}
