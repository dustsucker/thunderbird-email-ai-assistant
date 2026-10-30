# src/domain/errors/

## Responsibility
Typed domain validation errors for value objects, exported via barrel (`index.ts`). Each class carries the offending value (or provider context) so callers can build precise user-facing messages, and each has a matching type guard for narrowing `unknown` catches.

## Design
- Exception hierarchy: `InvalidEmailAddressError`, `InvalidApiKeyError`, `InvalidTagColorError`, `InvalidTagKeyError` — all extend `Error`, set `this.name` explicitly, and preserve V8 stack traces via `Error.captureStackTrace(this, <Class>)`.
- Context payload: invalid input stored in `value` property; `InvalidApiKeyError` additionally stores `provider` and prefixes it into the message.
- Type guard pattern: `isInvalidEmailAddressError`, `isInvalidApiKeyError`, `isInvalidTagColorError`, `isInvalidTagKeyError` — `instanceof`-based predicates (`error is X`) for try/catch narrowing.

## Flow
1. A value-object constructor detects invalid input (e.g. `EmailAddress` fails `EMAIL_REGEX`, `ApiKey` shorter than `MIN_LENGTH`).
2. Constructor throws the specific error with `(value, reason?)` or `(message, provider?)` arguments.
3. Callers catch, narrow with a type guard, and read `.value`/`.provider`; `ApiKey` and `EmailAddress` static factories (`tryCreate`, `isValid`) swallow these errors and return `null`/`false` instead.

## Integration
- Consumed by: `../value-objects/EmailAddress`, `ApiKey`, `TagColor`; re-exported through `../value-objects/index.ts` barrel alongside the value objects.
- Depends on: nothing — only the ECMAScript `Error` builtin. Pure leaf module of the domain layer.
