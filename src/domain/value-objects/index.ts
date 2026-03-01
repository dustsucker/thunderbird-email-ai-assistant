/**
 * Value Objects Barrel Export
 * Re-exports all value objects and their related errors
 */

// Value Objects
export { EmailAddress } from './EmailAddress';
export { ApiKey } from './ApiKey';
export { TagColor } from './TagColor';
export { TagKey } from './TagKey';
export { EmailSubject } from './EmailSubject';
export { EmailBody } from './EmailBody';

// Errors
export {
  InvalidEmailAddressError,
  InvalidApiKeyError,
  InvalidTagColorError,
  InvalidTagKeyError,
  isInvalidEmailAddressError,
  isInvalidApiKeyError,
  isInvalidTagColorError,
  isInvalidTagKeyError,
} from '../errors/ValueObjectErrors';
