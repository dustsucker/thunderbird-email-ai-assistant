# src/background/

## Responsibility
Module-level background orchestration: builds the TSyringe container and registers
Thunderbird event listeners, the runtime message API, and lifecycle handling.
The root `background.ts` is only a bootstrap that delegates here.

## Design
- `DIContainer.ts` - Single wiring point: registers infrastructure implementations under
  interface tokens (`ILogger`, `ICache`, `IQueue`, `IMailReader`, `ITagManager`,
  `IConfigRepository`, `IClock`, `IRandom`), repositories, use cases, and background
  handlers; creates the shared `DebugLogBuffer` instance.
- `BackgroundScript.ts` - Main class: starts/stops handlers, owns graceful cleanup.
- `ContextMenuHandler.ts` - Context-menu entries for per-mail analysis.
- `ToolbarHandler.ts` - Toolbar button interactions (single/batch analysis entry).
- `InstallHandler.ts` - install/update lifecycle: initializes default configuration.
- `index.ts` - Barrel export.

## Flow
1. `background.ts` imports this module; `DIContainer.ts` registers everything.
2. `BackgroundScript` instantiates handlers (`EmailEventListener`, `MessageHandler`,
   `ContextMenuHandler`, `ToolbarHandler`, `InstallHandler`) from the container and starts them.
3. Handlers resolve use cases (`AnalyzeEmail`, `AnalyzeBatchEmails`) via the container.

## Integration
- Consumes use cases from `src/application/use-cases/`.
- Only this layer plus `src/interfaces/` may touch the `messenger` API.
- Tested in `test/integration/DIContainer.test.ts` and `test/background/`.
