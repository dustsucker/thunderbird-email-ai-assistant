/**
 * Value Object for Tag Color
 * Immutable value object representing a tag color
 */
export class TagColor {
	readonly value: string;

	constructor(value: string) {
		const trimmed = value.trim();
		this.validate(trimmed);
		this.value = trimmed;
	}

	/** Validates hex color format */
	private validate(color: string): void {
		if (!color) {
			throw new Error('Tag color cannot be empty');
		}

		// Support both 6-digit and 3-digit hex colors
		const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
		if (!hexRegex.test(color)) {
			throw new Error(
				`Tag color must be a valid hex color code (e.g., #FF5733): ${color}`
			);
		}
	}

	/** Converts 3-digit hex to 6-digit */
	to6Digit(): TagColor {
		if (this.value.length === 4) {
			const r = this.value[1];
			const g = this.value[2];
			const b = this.value[3];
			return new TagColor(`#${r}${r}${g}${g}${b}${b}`);
		}
		return this;
	}

	/** Converts to RGB array */
	toRgb(): [number, number, number] {
		const hex = this.to6Digit().value.substring(1);
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		return [r, g, b];
	}

	/** Calculates luminance for determining text color (black or white) */
	getLuminance(): number {
		const [r, g, b] = this.toRgb();
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance;
	}

	/** Returns the best contrasting text color (black or white) */
	getContrastColor(): 'black' | 'white' {
		return this.getLuminance() > 0.5 ? 'black' : 'white';
	}

	/** Checks if color is light */
	isLight(): boolean {
		return this.getLuminance() > 0.5;
	}

	/** Checks if color is dark */
	isDark(): boolean {
		return this.getLuminance() <= 0.5;
	}

	/** Checks if this color equals another */
	equals(other: TagColor): boolean {
		return this.value.toLowerCase() === other.value.toLowerCase();
	}

	toString(): string {
		return this.value;
	}

	/** Static factory method for validation */
	static isValid(color: string): boolean {
		try {
			new TagColor(color);
			return true;
		} catch {
			return false;
		}
	}

	/** Creates a random color */
	static random(): TagColor {
		const randomColor = Math.floor(Math.random() * 16777215)
			.toString(16)
			.padStart(6, '0');
		return new TagColor(`#${randomColor}`);
	}

	/** Creates a color from predefined palette */
	static fromPalette(index: number): TagColor {
		const palette = [
			'#FF5733', // Red-Orange
			'#33FF57', // Green
			'#3357FF', // Blue
			'#FF33A8', // Pink
			'#A833FF', // Purple
			'#33FFF5', // Cyan
			'#FFC300', // Yellow
			'#FF5733', // Orange
			'#C70039', // Dark Red
			'#900C3F', // Burgundy
		];
		const color = palette[index % palette.length];
		return new TagColor(color);
	}
}
