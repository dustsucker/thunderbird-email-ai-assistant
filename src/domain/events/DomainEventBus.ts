/**
 * Domain Event Base Interface
 * All domain events must implement this interface
 */
export interface DomainEvent {
	readonly eventType: string;
	readonly occurredAt: Date;
	readonly aggregateId: string;
	readonly version: number;
}

/**
 * Domain Event Bus
 * Publishes and subscribes to domain events
 */
export class DomainEventBus {
	private static instance: DomainEventBus;
	private handlers: Map<string, Set<(event: DomainEvent) => void | Promise<void>>>;

	private constructor() {
		this.handlers = new Map();
	}

	/** Get singleton instance */
	static getInstance(): DomainEventBus {
		if (!DomainEventBus.instance) {
			DomainEventBus.instance = new DomainEventBus();
		}
		return DomainEventBus.instance;
	}

	/** Subscribe to an event type */
	subscribe(
		eventType: string,
		handler: (event: DomainEvent) => void | Promise<void>
	): () => void {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}

		this.handlers.get(eventType)!.add(handler);

		// Return unsubscribe function
		return () => {
			this.handlers.get(eventType)?.delete(handler);
		};
	}

	/** Publish an event to all subscribers */
	async publish(event: DomainEvent): Promise<void> {
		const handlers = this.handlers.get(event.eventType);
		if (handlers) {
			const promises = Array.from(handlers).map((handler) =>
				Promise.resolve(handler(event))
			);
			await Promise.allSettled(promises);
		}
	}

	/** Publish multiple events */
	async publishAll(events: DomainEvent[]): Promise<void> {
		const promises = events.map((event) => this.publish(event));
		await Promise.allSettled(promises);
	}

	/** Clear all handlers (useful for testing) */
	clear(): void {
		this.handlers.clear();
	}
}
