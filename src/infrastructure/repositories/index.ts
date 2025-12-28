/**
 * Repository exports.
 *
 * Exports configuration repository interfaces and implementations.
 */

export type {
  IConfigRepository,
  IAppConfig,
  IProviderSettings,
  ICustomTag,
} from '../interfaces/IConfigRepository';
export { IndexedDBConfigRepository } from './IndexedDBConfigRepository';
