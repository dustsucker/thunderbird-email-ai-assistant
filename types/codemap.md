# types/

## Responsibility
Ambient TypeScript declarations for the Thunderbird WebExtension (`messenger`) API.

## Files
- `thunderbird.d.ts` - Global `messenger` namespace declarations used by the
  interfaces layer; declared locally on purpose (no external Thunderbird type packages).

## Integration
- Loaded via `tsconfig.json`; consumed implicitly wherever `messenger.*` is referenced
  (mainly `src/interfaces/adapters/`, `src/interfaces/background/`).
