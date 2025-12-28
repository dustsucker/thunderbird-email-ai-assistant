import { TagKey } from '../value-objects/TagKey';
import { TagColor } from '../value-objects/TagColor';

/**
 * Thunderbird Tag Interface
 * Represents how tags are stored in Thunderbird
 */
export interface ThunderbirdTag {
	key: string;
	tagName: string;
	color: string;
	sortKey?: string;
}

/**
 * Tag Entity
 * Represents a tag with business logic for validation and conversion
 */
export class Tag {
	readonly id: string;
	readonly key: TagKey;
	readonly name: string;
	readonly color: TagColor;
	readonly sortKey?: string;
	readonly description?: string;
	readonly isEnabled: boolean;

	constructor({
		id,
		key,
		name,
		color,
		sortKey,
		description,
		isEnabled = true,
	}: {
		id: string;
		key: TagKey;
		name: string;
		color: TagColor;
		sortKey?: string;
		description?: string;
		isEnabled?: boolean;
	}) {
		if (!id || id.trim().length === 0) {
			throw new Error('Tag ID cannot be empty');
		}

		if (!name || name.trim().length === 0) {
			throw new Error('Tag name cannot be empty');
		}

		this.id = id;
		this.key = key;
		this.name = name.trim();
		this.color = color;
		this.sortKey = sortKey?.trim();
		this.description = description?.trim();
		this.isEnabled = isEnabled;
	}

	/**
	 * Validates the tag
	 */
	isValid(): boolean {
		return (
			this.key.value.length > 0 &&
			this.name.length > 0 &&
			TagColor.isValid(this.color.value) &&
			!this.key.isReserved()
		);
	}

	/**
	 * Checks if this is a custom tag (not a reserved system tag)
	 */
	isCustom(): boolean {
		return !this.key.isReserved();
	}

	/**
	 * Checks if this tag equals another tag
	 */
	equals(other: Tag): boolean {
		return (
			this.id === other.id ||
			this.key.equals(other.key)
		);
	}

	/**
	 * Converts to Thunderbird tag format
	 */
	toThunderbirdTag(): ThunderbirdTag {
		return {
			key: this.key.toString(),
			tagName: this.name,
			color: this.color.to6Digit().toString(),
			sortKey: this.sortKey,
		};
	}

	/**
	 * Gets the display color (returns appropriate contrast color)
	 */
	getContrastColor(): 'black' | 'white' {
		return this.color.getContrastColor();
	}

	/**
	 * Checks if color is light
	 */
	isLightColor(): boolean {
		return this.color.isLight();
	}

	/**
	 * Enables the tag
	 */
	enable(): Tag {
		if (this.isEnabled) {
			return this;
		}
		return new Tag({
			...this,
			isEnabled: true,
		});
	}

	/**
	 * Disables the tag
	 */
	disable(): Tag {
		if (!this.isEnabled) {
			return this;
		}
		return new Tag({
			...this,
			isEnabled: false,
		});
	}

	/**
	 * Updates the tag name
	 */
	withName(name: string): Tag {
		if (!name || name.trim().length === 0) {
			throw new Error('Tag name cannot be empty');
		}
		return new Tag({
			...this,
			name: name.trim(),
		});
	}

	/**
	 * Updates the tag color
	 */
	withColor(color: TagColor): Tag {
		return new Tag({
			...this,
			color,
		});
	}

	/**
	 * Updates the sort key
	 */
	withSortKey(sortKey?: string): Tag {
		return new Tag({
			...this,
			sortKey: sortKey?.trim(),
		});
	}

	/**
	 * Updates the description
	 */
	withDescription(description?: string): Tag {
		return new Tag({
			...this,
			description: description?.trim(),
		});
	}

	/**
	 * Returns a summary object
	 */
	toSummary() {
		return {
			id: this.id,
			key: this.key.toString(),
			name: this.name,
			color: this.color.toString(),
			sortKey: this.sortKey,
			isEnabled: this.isEnabled,
		};
	}

	/**
	 * Creates a Tag from Thunderbird tag format
	 */
	static fromThunderbirdTag(
		thunderbirdTag: ThunderbirdTag,
		id: string
	): Tag {
		return new Tag({
			id,
			key: new TagKey(thunderbirdTag.key),
			name: thunderbirdTag.tagName,
			color: new TagColor(thunderbirdTag.color),
			sortKey: thunderbirdTag.sortKey,
		});
	}

	/**
	 * Creates a default tag
	 */
	static createDefault(
		id: string,
		key: string,
		name: string,
		color: string
	): Tag {
		return new Tag({
			id,
			key: new TagKey(key),
			name,
			color: new TagColor(color),
		});
	}
}
