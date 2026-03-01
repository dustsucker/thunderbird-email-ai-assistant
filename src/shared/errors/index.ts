/**
 * Barrel export for unified error hierarchy.
 *
 * Provides consistent error handling across the application with:
 * - Layered error classes (Domain, Infrastructure, Application)
 * - Provider-specific errors
 * - Analysis-specific errors
 *
 * @module errors
 */

// Base error classes for layered architecture
export { DomainError, InfrastructureError, ApplicationError } from './BaseErrors';

// Provider-specific infrastructure errors
export {
  ProviderInitializationError,
  ProviderRequestError,
  ProviderResponseError,
  ProviderRateLimitError,
  PROVIDER_ERROR_CODES,
} from './ProviderErrors';

// Analysis-specific application errors
export {
  EmailAnalysisError,
  EmailRetrievalError,
  TagApplicationError,
  CacheError,
  BatchAnalysisError,
  ConfigurationError,
  DependencyInjectionError,
  ANALYSIS_ERROR_CODES,
} from './AnalysisErrors';

// Re-export the legacy EmailAnalysisError for backward compatibility
// (the new one extends ApplicationError and is more flexible)
