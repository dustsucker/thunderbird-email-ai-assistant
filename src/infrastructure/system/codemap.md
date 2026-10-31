# src/infrastructure/system/

## Responsibility
Platform services implementing the domain environment ports.

## Files
- `SystemClock.ts` - Implements `IClock` (domain `../interfaces/IClock.ts`).
- `CryptoRandom.ts` - Implements `IRandom` (domain `../interfaces/IRandom.ts`)
  using Web Crypto.
- `index.ts` - Barrel export.

## Integration
- Registered as `'IClock'`/`'IRandom'` in `src/background/DIContainer.ts`.
- Tested in `test/infrastructure/system/`.
