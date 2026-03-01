/**
 * Repository exports.
 *
 * Exports configuration repository interfaces and implementations.
 *
 * Note: IProviderSettings here is the strict version for persistent storage.
 * For runtime provider settings (flexible), use IRuntimeProviderSettings from IProvider.
 */

export type {
  IConfigRepository,
  IAppConfig,
  IProviderSettings,
  ICustomTag,
  IModelConcurrencyConfig,
} from '../interfaces/IConfigRepository';
export { IndexedDBConfigRepository } from './IndexedDBConfigRepository';
