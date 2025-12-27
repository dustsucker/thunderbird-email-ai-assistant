# Agent Guidelines for Thunderbird Email AI Assistant

## Commands
- Test: `npm test` (all tests), `npx vitest run <test-file>` (single test), `npm run test:watch`
- Build: `npm run build`, type-check: `npm run type-check`
- Lint: `npm run lint` / `npm run lint:fix`, format: `npm run format`

## Code Style
- TypeScript strict mode with comprehensive type definitions and JSDoc comments
- Prettier: single quotes, semicolons, 100 char width, 2-space indentation
- ESLint: no unused vars (prefix with `_` to ignore), warn on `any`, warn on `console`
- Organize imports: external libs first, then internal modules (core/, providers/)
- Use type guards for runtime checks (e.g., `hasNestedParts(part): part is EmailPart & { parts: EmailPart[] }`)
- Error handling: throw descriptive errors with logging via `logger.error/info/debug`
- Structure code with section comments (===) and interfaces for type definitions
- Avoid `any` - prefer `unknown` with type guards when type is uncertain
