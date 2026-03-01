# Interface Layer

This directory contains UI adapters and Thunderbird WebExtension API integration. It serves as the entry point layer connecting the application to Thunderbird and providing user interface components.

## Purpose

- **Adapters**: Bridge between Thunderbird WebExtension API and application interfaces
- **Background**: Service workers handling runtime events and message passing
- **Options**: UI components for the extension's options page
- **Shared**: Reusable UI components and styles

---

## Files

### adapters/

| File                       | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `ThunderbirdTagManager.ts` | Adapter implementing `ITagManager` for Thunderbird message tags CRUD    |
| `ThunderbirdMailReader.ts` | Adapter implementing `IMailReader` for reading emails via messenger API |
| `index.ts`                 | Barrel export for adapters                                              |

### background/

| File                    | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `MessageHandler.ts`     | Handles runtime messaging between extension components |
| `EmailEventListener.ts` | Listens for new mail events and triggers analysis      |
| `index.ts`              | Barrel export for background services                  |

### options/

| File                   | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `OptionsScript.ts`     | Main entry point - DI container setup and UI orchestration |
| `SettingsForm.ts`      | Provider settings form with validation and persistence     |
| `TagManagementUI.ts`   | CRUD operations for custom tags with modal dialog          |
| `BatchAnalysisUI.ts`   | Batch email analysis with progress tracking                |
| `AnalysisResultsUI.ts` | Displays cached analysis results with confidence badges    |
| `ManualReviewPanel.ts` | Reviews low-confidence email classifications               |
| `index.ts`             | Barrel export for options components                       |

### shared/components/

| File                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `ConfidenceBadge.ts`        | Reusable confidence score badge with color coding    |
| `LowConfidenceIndicator.ts` | Visual indicators for low-confidence classifications |
| `index.ts`                  | Barrel export for shared components                  |

### shared/styles/

| File             | Description                          |
| ---------------- | ------------------------------------ |
| `confidence.css` | Styles for confidence badges         |
| `indicators.css` | Styles for low-confidence indicators |

---

## Rules

### General Principles

1. **Entry Points**: This layer is the only place that directly interacts with Thunderbird's `messenger` API
2. **Adapter Pattern**: Adapters implement core interfaces (`ITagManager`, `IMailReader`) and delegate to domain/application layer
3. **Dependency Injection**: All components use TSyringe `@injectable()` and `@inject()` decorators
4. **Type Safety**: Declare minimal `messenger` API types locally - do not import external Thunderbird types
5. **Error Handling**: Wrap Thunderbird API calls in try/catch with descriptive error messages via logger

### When Adding New Components

- **UI Components**: Extend `BaseUIComponent` pattern (if exists) or follow existing component structure
- **Adapters**: Implement the corresponding interface from `infrastructure/interfaces/`
- **Event Handlers**: Register/unregister in `start()`/`stop()` methods for proper cleanup

### Code Style

- Use section comments (`// ===`) to organize code blocks
- Include JSDoc comments with `@example` for public methods
- Use type guards for runtime validation (see `isThunderbirdTag()` pattern)

---

## Patterns

### Adapter Pattern

```typescript
@injectable()
export class ThunderbirdTagManager implements ITagManager {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  async createTag(name: string, color?: string): Promise<ThunderbirdTag> {
    // Bridge to Thunderbird API
    return messenger.messages.tags.create(key, name, color);
  }
}
```

### Message Handler Pattern

```typescript
// In MessageHandler.ts
private handleMessage(message: unknown, sender: unknown, sendResponse: Function): boolean {
  if (isStartBatchAnalysisMessage(message)) {
    this.handleStartBatchAnalysis(message).then(sendResponse);
    return true; // Async response
  }
  return false;
}
```

### UI Component Pattern

```typescript
@injectable()
export class SettingsForm {
  private elements: DOMElements | null = null;

  render(): void {
    this.elements = this.getDOMElements();
    this.setupEventListeners();
  }

  async loadSettings(): Promise<void> {
    const config = await this.configRepository.getAppConfig();
    this.updateUI(config);
  }
}
```

---

## Examples

### Adding a New Adapter

1. Create interface in `infrastructure/interfaces/INewAdapter.ts`
2. Create adapter in `interfaces/adapters/ThunderbirdNewAdapter.ts`:

```typescript
@injectable()
export class ThunderbirdNewAdapter implements INewAdapter {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  async doSomething(): Promise<void> {
    try {
      await messenger.newApi.method();
    } catch (error) {
      this.logger.error('Failed', { error });
      throw error;
    }
  }
}
```

3. Register in DI container (`OptionsScript.ts` or background script)
4. Export from `adapters/index.ts`

### Adding a New UI Component

1. Create component in `interfaces/options/NewComponent.ts`:

```typescript
@injectable()
export class NewComponent {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  render(): void {
    const container = document.getElementById('new-component-container');
    if (!container) return;
    this.setupEventListeners();
  }

  async refresh(): Promise<void> {
    // Reload data and update UI
  }
}
```

2. Register in DI container: `container.registerSingleton('NewComponent', NewComponent);`
3. Export from `options/index.ts`
4. Initialize in `OptionsScript.initialize()`

### Adding a Runtime Message Handler

1. Define message type and type guard in `MessageHandler.ts`
2. Add handler method following existing patterns
3. Route message in `handleMessage()` switch statement
