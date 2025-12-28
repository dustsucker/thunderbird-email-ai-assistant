/**
 * Value Object for Tag Key
 * Immutable value object representing a tag identifier
 */
export class TagKey {
	readonly value: string;
	private readonly MAX_LENGTH = 50;

	constructor(value: string) {
		const trimmed = value.trim().toLowerCase();
		this.validate(trimmed);
		this.value = trimmed;
	}

	/** Validates tag key format */
	private validate(key: string): void {
		if (!key) {
			throw new Error('Tag key cannot be empty');
		}

		if (key.length > this.MAX_LENGTH) {
			throw new Error(
				`Tag key exceeds maximum length of ${this.MAX_LENGTH} characters`
			);
		}

		// Allow alphanumeric, hyphens, and underscores
		const keyRegex = /^[a-z0-9_-]+$/;
		if (!keyRegex.test(key)) {
			throw new Error(
				`Tag key must contain only lowercase letters, numbers, hyphens, and underscores: ${key}`
			);
		}

		// Cannot start with number or hyphen
		if (/^[0-9-]/.test(key)) {
			throw new Error(
				`Tag key cannot start with a number or hyphen: ${key}`
			);
		}
	}

	/** Checks if key is reserved */
	isReserved(): boolean {
		const reservedKeys = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'];
		return reservedKeys.includes(this.value);
	}

	/** Checks if this key equals another */
	equals(other: TagKey): boolean {
		return this.value === other.value;
	}

	toString(): string {
		return this.value;
	}

	/** Static factory method for validation */
	static isValid(key: string): boolean {
		try {
			new TagKey(key);
			return true;
		} catch {
			return false;
		}
	}

	/** Creates a tag key from display name (converts to kebab-case) */
	static fromDisplayName(displayName: string): TagKey {
		const key = displayName
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
		return new TagKey(key);
	}
}
