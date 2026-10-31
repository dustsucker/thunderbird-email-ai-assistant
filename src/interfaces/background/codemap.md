# src/interfaces/background/

## Responsibility
Runtime entry points: message routing and mail event detection.

## Files
- `MessageHandler.ts` - Runtime message API: type guards per message type
  (start/stop batch analysis, analysis status, settings) and async response handling.
- `EmailEventListener.ts` - Detects new mail events and triggers analysis.
- `index.ts` - Barrel export.

## Patterns
- Handlers resolve use cases from the TSyringe container; no business logic here.
- Listener registration/cleanup is owned by `src/background/BackgroundScript.ts`.

## Integration
- Instantiated by `src/background/BackgroundScript.ts`; tested in
  `test/background/MessageHandler.test.ts`, `test/email-event-listener.test.ts`.
