# Thunderbird Email AI Assistant

> AI-powered, multi-provider mail tagging and classification engine for Thunderbird.

Plugin page: https://addons.thunderbird.net/eN-US/thunderbird/addon/email-assistant/

This Thunderbird MailExtension provides a powerful and flexible framework for AI-powered email analysis. It automatically processes incoming emails, sends them to a language model of your choice for analysis, and then applies tags based on the model's response. This allows for sophisticated, automated email classification and sorting.

## Key Features

- **Multi-Provider LLM Support**: Integrates with local models via Ollama and cloud-based models from OpenAI, Google Gemini, Anthropic Claude, Mistral, and DeepSeek.
- **Confidence Score Display**: Shows confidence scores (0-100%) alongside each tag suggestion, providing transparency into AI classification certainty.
- **Configurable Confidence Thresholds**: Allows users to set global and per-tag minimum confidence thresholds, ensuring tags are only applied when the AI is sufficiently confident.
- **Low-Confidence Flagging**: Flags emails with low-confidence classifications for manual review, giving users control over borderline cases.
- **Dynamic Email Analysis**: Intelligently extracts headers, text content (converting HTML to plain text), and attachment details for efficient and accurate analysis by the LLM.
- **Fully Configurable Tagging**: Allows users to define their own custom tags, colors, and LLM prompts for a completely personalized email classification system.
- **Privacy-Focused**: Gives users the choice between maximum privacy with a local Ollama instance or the power of cloud-based models, with clear privacy notices for each.
- **Secure Configuration**: Features a comprehensive options page for managing API keys and provider settings, using Thunderbird's runtime permissions API for security.

## Architecture

This extension follows **Hexagonal Architecture** (also known as Clean Architecture or Ports & Adapters) with **Dependency Injection** using [TSyringe](https://github.com/microsoft/tsyringe). This design ensures:

- **Testability**: Easy mocking of external dependencies
- **Maintainability**: Clear separation of concerns
- **Flexibility**: Easy to swap implementations (e.g., different LLM providers)

### Layer Structure

```
┌─────────────────────────────────────────┐
│           Interfaces (Entry)            │  Thunderbird integration, UI components
├─────────────────────────────────────────┤
│          Application (Use Cases)        │  Orchestration, business workflows
├─────────────────────────────────────────┤
│            Domain (Business)            │  Entities, Value Objects, Events
├─────────────────────────────────────────┤
│        Infrastructure (External)        │  LLM providers, cache, storage
└─────────────────────────────────────────┘
```

**Dependency Rule**: Inner layers never depend on outer layers. Domain has no dependencies.

### Project Structure

```
src/
├── domain/              # Core business logic
│   ├── entities/        # Email, Tag
│   ├── value-objects/   # EmailAddress, ApiKey, TagColor
│   ├── events/          # EmailAnalyzedEvent, TagAppliedEvent
│   ├── services/        # TagService, EmailContentExtractor
│   └── interfaces/      # IClock, IRandom, ILogger, ITagManager
├── application/         # Use cases & orchestration
│   ├── use-cases/       # AnalyzeEmail, ApplyTags, UndoTagChanges
│   └── services/        # PriorityQueue, RateLimiter
├── infrastructure/      # External integrations
│   ├── providers/       # 8 LLM providers with Factory pattern
│   ├── cache/           # MemoryCache, AnalysisCache
│   ├── storage/         # TagHistoryRepository, MetricsRepository
│   └── logger/          # ConsoleLogger
├── interfaces/          # Entry points & adapters
│   ├── background/      # ContextMenuHandler, MessageHandler
│   ├── options/         # Settings UI components
│   └── adapters/        # ThunderbirdTagManager, ThunderbirdMailReader
└── shared/              # Cross-cutting concerns
    ├── types/           # TagTypes, ProviderTypes, Metrics
    ├── errors/          # DomainError, InfrastructureError, ApplicationError
    └── utils/           # loggingUtils, validationUtils
```

### Key Design Patterns

| Pattern          | Implementation                              | Purpose                                        |
| ---------------- | ------------------------------------------- | ---------------------------------------------- |
| **Factory**      | `ProviderFactory`                           | Creates LLM provider instances based on config |
| **Repository**   | `TagHistoryRepository`, `MetricsRepository` | Abstract storage operations                    |
| **Observer**     | `EventBus` + Domain Events                  | Decouple event producers from consumers        |
| **Strategy**     | Provider implementations                    | Swappable LLM backends                         |
| **Value Object** | `EmailAddress`, `ApiKey`                    | Immutable, validated domain concepts           |

### Supported LLM Providers

| Provider       | ID           | Features                       |
| -------------- | ------------ | ------------------------------ |
| **Ollama**     | `ollama`     | Local inference, no API costs  |
| **OpenAI**     | `openai`     | GPT-4, GPT-3.5-turbo           |
| **Anthropic**  | `claude`     | Claude 3 (Opus, Sonnet, Haiku) |
| **Google**     | `gemini`     | Gemini Pro, Gemini 1.5         |
| **Mistral**    | `mistral`    | Mistral Large, Medium          |
| **DeepSeek**   | `deepseek`   | Cost-effective cloud option    |
| **ZAI PaaS**   | `zai-paas`   | Enterprise deployment          |
| **ZAI Coding** | `zai-coding` | Developer-focused              |

### Architecture Features

- **Performance Monitoring**: Track analysis duration, token usage, and estimated costs
- **Undo Mechanism**: Revert tag changes with history tracking
- **Confidence Scores**: Tags include 0-100% confidence with threshold filtering
- **Event-Driven**: Domain events for EmailAnalyzed, TagApplied, ProviderError

For detailed architecture decisions, see [docs/adr/](docs/adr/).

## Configuration and Usage

After installing the add-on, you can configure it by going to `Tools > Add-ons and Themes`, finding "Mail Assistant", and clicking the "..." button to select **Options**.

### General Settings

The General tab allows you to select your preferred LLM provider and enter the necessary credentials (API Key or local URL).

![Ollama Settings](doc/screenshots/settings-ollama.png)
_Ollama provider settings, with fields for a local URL and model name._

![Mistral Settings](doc/screenshots/settings-mistral.png)
_Settings for a cloud provider like Mistral, requiring an API key._

### Custom Tags

The Custom Tags tab is where you can define the categories for email analysis. You can add, edit, or delete tags. Each tag has a name, a unique key, a color, and a specific prompt instruction that tells the LLM what to check for.

![Custom Tags](doc/screenshots/settings-tags.png)
_The interface for managing custom tags._

### Confidence Thresholds

The Confidence Thresholds settings allow you to control when tags are automatically applied based on the AI's certainty level. This feature helps prevent incorrect classifications by only applying tags when the AI is confident enough.

**Global Threshold**: Set a default confidence threshold (0-100%) that applies to all tags. The default is 70%. Tags with confidence below this threshold will not be automatically applied.

**Per-Tag Override**: Override the global threshold for specific tags. For example, you might require a higher confidence (e.g., 85%) for important tags like "Urgent" while allowing lower confidence (e.g., 60%) for less critical tags.

**Visual Indicators**:

- Green badge (≥80%): High confidence
- Yellow badge (70-79%): Medium confidence
- Red badge (<70%): Low confidence

**Manual Review**: Emails with tags below your confidence threshold are flagged for manual review. You can access these via the "Manual Review" (Manuelle Überprüfung) tab in the options page, where you can choose to apply or dismiss each tag suggestion.

### Usage

Once configured, the extension will automatically process new incoming emails. It applies the tags generated by the AI analysis, which can then be used with Thunderbird's built-in Message Filters to organize your inbox.

### Organizing emails

Once automated tagging is working, you may create filters that will move tagged messages to folders or take other actions. You should set those filters to run
periodically, as tagging is executed after initial filtering.

![Tagged Message](doc/screenshots/tagged-message.png)
_An example of an email that has been automatically tagged by the assistant._

## Development

### Prerequisites

- **Node.js and npm**: Required for managing dependencies and running build scripts. You can download them from [nodejs.org](https://nodejs.org/).
- **Thunderbird**: The application this extension is built for.

### Build Instructions

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/mcj-kr/thunderbird-email-ai-assistant.git
    cd thunderbird-email-ai-assistant
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Build the extension:**
    This command runs webpack to bundle the scripts and then uses `web-ext` to package everything into a `.zip` file located in the `web-ext-artifacts/` directory.
    ```bash
    ./build.bash
    ```

## Installation

### Adding plugin

Install plugin from: https://addons.thunderbird.net/eN-US/thunderbird/addon/email-assistant/

### Temporary Installation (for Development)

1.  Build the extension using the instructions above.
2.  In Thunderbird, go to `Tools > Add-ons and Themes`.
3.  Click the gear icon, select `Debug Add-ons`, and then click `Load Temporary Add-on...`.
4.  Select the generated `.zip` file from the `web-ext-artifacts/` directory.
