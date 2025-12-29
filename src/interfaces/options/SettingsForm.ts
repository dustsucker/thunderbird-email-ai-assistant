/**
 * Settings Form UI Component
 *
 * Manages provider settings, custom tags configuration, and app settings
 * forms for options page. Uses dependency injection for loose coupling.
 *
 * @module interfaces/options/SettingsForm
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import { ProviderFactory } from '../../infrastructure/providers/ProviderFactory';

// ============================================================================
// DOM Element Interfaces
// ============================================================================

/**
 * General Settings DOM Elements
 */
interface GeneralSettingsElements {
  providerSelect: HTMLSelectElement;
  generalForm: HTMLFormElement;
  generalStatusMessage: HTMLSpanElement;
  ollamaApiUrl: HTMLInputElement | null;
  ollamaModel: HTMLInputElement | null;
  openaiApiKey: HTMLInputElement | null;
  geminiApiKey: HTMLInputElement | null;
  claudeApiKey: HTMLInputElement | null;
  mistralApiKey: HTMLInputElement | null;
  deepseekApiKey: HTMLInputElement | null;
  zaiPaasApiKey: HTMLInputElement | null;
  zaiPaasModel: HTMLSelectElement | null;
  zaiCodingApiKey: HTMLInputElement | null;
  zaiCodingModel: HTMLSelectElement | null;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Partial provider config for saving
 */
type PartialProviderConfig = {
  provider: string;
  ollamaApiUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  mistralApiKey?: string;
  deepseekApiKey?: string;
  zaiPaasApiKey?: string;
  zaiPaasModel?: string;
  zaiCodingApiKey?: string;
  zaiCodingModel?: string;
};

/**
 * General settings from storage
 */
interface GeneralSettingsStorage {
  provider?: string;
  ollamaApiUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  mistralApiKey?: string;
  deepseekApiKey?: string;
  zaiPaasApiKey?: string;
  zaiPaasModel?: string;
  zaiCodingApiKey?: string;
  zaiCodingModel?: string;
}

/**
 * Default provider settings
 */
const DEFAULT_PROVIDER = 'openai' as const;

// ============================================================================
// Browser API Declarations
// ============================================================================

declare const messenger: {
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  permissions: {
    request(permissions: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  };
};

// ============================================================================
// Settings Form Implementation
// ============================================================================

/**
 * Settings Form UI Component
 *
 * Manages provider settings forms with validation and persistence.
 * Handles API key storage, model selection, and permission requests.
 *
 * @example
 * ```typescript
 * const settingsForm = container.resolve<SettingsForm>(SettingsForm);
 * await settingsForm.loadSettings();
 * settingsForm.render();
 * await settingsForm.saveSettings();
 * ```
 */
@injectable()
export class SettingsForm {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;
  private readonly configRepository: IConfigRepository;
  private readonly providerFactory: ProviderFactory;
  private elements: GeneralSettingsElements | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ILogger') logger: ILogger,
    @inject('IConfigRepository') configRepository: IConfigRepository
  ) {
    this.logger = logger;
    this.configRepository = configRepository;
    this.providerFactory = new ProviderFactory(logger);
    this.logger.debug('SettingsForm initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Renders settings form to the DOM.
   *
   * Sets up event listeners for form submission and provider selection.
   * Displays/hides provider-specific settings based on selection.
   */
  render(): void {
    this.logger.debug('Rendering settings form');

    this.elements = this.getDOMElements();

    if (!this.elements) {
      return;
    }

    // Setup form submission handler
    this.elements.generalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSettings();
    });

    // Setup provider change handler
    this.elements.providerSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.showRelevantSettings(target.value);
      this.populateModelsForProvider(target.value).catch((error) => {
        this.logger.error('Failed to populate models on provider change', { error });
      });
    });

    this.logger.debug('Settings form rendered');
  }

  /**
   * Loads settings from ConfigRepository and populates form fields.
   *
   * Retrieves provider settings and app config from ConfigRepository,
   * then updates form fields with the loaded values.
   */
  async loadSettings(): Promise<void> {
    this.logger.debug('Loading settings');

    try {
      if (!this.elements) {
        throw new Error('Settings form not initialized. Call render() first.');
      }

      // Load app config from ConfigRepository
      const appConfig = await this.configRepository.getAppConfig();

      // Set default provider
      this.elements.providerSelect.value = appConfig.defaultProvider ?? DEFAULT_PROVIDER;

      // Load provider settings for each provider
      const providers = [
        'ollama',
        'openai',
        'gemini',
        'claude',
        'mistral',
        'deepseek',
        'zai-paas',
        'zai-coding',
      ] as const;

      for (const providerId of providers) {
        try {
          const settings = await this.configRepository.getProviderSettings(providerId);

          // Populate form fields based on provider
          switch (providerId) {
            case 'ollama':
              if (this.elements.ollamaApiUrl) {
                this.elements.ollamaApiUrl.value = settings.apiUrl ?? '';
              }
              if (this.elements.ollamaModel) {
                this.elements.ollamaModel.value = settings.model ?? '';
              }
              break;

            case 'openai':
              if (this.elements.openaiApiKey) {
                this.elements.openaiApiKey.value = settings.apiKey ?? '';
              }
              break;

            case 'gemini':
              if (this.elements.geminiApiKey) {
                this.elements.geminiApiKey.value = settings.apiKey ?? '';
              }
              break;

            case 'claude':
              if (this.elements.claudeApiKey) {
                this.elements.claudeApiKey.value = settings.apiKey ?? '';
              }
              break;

            case 'mistral':
              if (this.elements.mistralApiKey) {
                this.elements.mistralApiKey.value = settings.apiKey ?? '';
              }
              break;

            case 'deepseek':
              if (this.elements.deepseekApiKey) {
                this.elements.deepseekApiKey.value = settings.apiKey ?? '';
              }
              break;

            case 'zai-paas':
              if (this.elements.zaiPaasApiKey) {
                this.elements.zaiPaasApiKey.value = settings.apiKey ?? '';
              }
              if (this.elements.zaiPaasModel) {
                this.elements.zaiPaasModel.value = settings.model ?? 'glm-4.5';
              }
              break;

            case 'zai-coding':
              if (this.elements.zaiCodingApiKey) {
                this.elements.zaiCodingApiKey.value = settings.apiKey ?? '';
              }
              if (this.elements.zaiCodingModel) {
                this.elements.zaiCodingModel.value = settings.model ?? 'glm-4.7';
              }
              break;
          }
        } catch (error) {
          // Provider might not be configured yet, skip
          this.logger.debug(`Skipping provider ${providerId} (not configured)`);
        }
      }

      this.showRelevantSettings(appConfig.defaultProvider ?? DEFAULT_PROVIDER);

      // Populate models for default provider if API key is present
      const defaultProvider = appConfig.defaultProvider ?? DEFAULT_PROVIDER;
      this.populateModelsForProvider(defaultProvider).catch((error) => {
        this.logger.error('Failed to populate models on load', { error });
      });

      this.logger.info('Settings loaded successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load settings', { error: errorMessage });
      throw new Error(`Failed to load settings: ${errorMessage}`);
    }
  }

  /**
   * Saves current form values to ConfigRepository.
   *
   * Validates provider settings, requests necessary permissions,
   * and persists settings to ConfigRepository.
   */
  async saveSettings(): Promise<void> {
    this.logger.debug('Saving settings');

    try {
      if (!this.elements) {
        throw new Error('Settings form not initialized. Call render() first.');
      }

      const provider = this.elements.providerSelect.value;

      const settingsToSave = this.gatherProviderSettings(provider);

      if (!this.validateProviderSettings(settingsToSave)) {
        throw new Error('Invalid provider settings');
      }

      // Request permissions if needed
      const permissionGranted = await this.requestPermissions(provider, settingsToSave);

      if (!permissionGranted) {
        this.setStatusMessage('Permission denied. Settings not saved.');
        return;
      }

      // Save to ConfigRepository
      // 1. Save app config with default provider
      const appConfig = await this.configRepository.getAppConfig();
      appConfig.defaultProvider = provider;
      await this.configRepository.setAppConfig(appConfig);

      // 2. Save provider settings for selected provider
      const providerSettings = this.convertToProviderSettings(settingsToSave);
      await this.configRepository.setProviderSettings(provider, providerSettings);

      this.setStatusMessage('Settings saved!');

      this.logger.info('Settings saved successfully', { provider });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to save settings', { error: errorMessage });
      this.setStatusMessage(`Error saving settings: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validates provider settings.
   *
   * Checks that required fields are present and valid for selected provider.
   *
   * @param settings - Provider settings to validate
   * @returns True if settings are valid, false otherwise
   */
  validateProviderSettings(settings: PartialProviderConfig): boolean {
    this.logger.debug('Validating provider settings', { provider: settings.provider });

    switch (settings.provider) {
      case 'ollama':
        return !!(settings.ollamaApiUrl?.trim() && settings.ollamaModel?.trim());

      case 'openai':
        return !!settings.openaiApiKey?.trim();

      case 'gemini':
        return !!settings.geminiApiKey?.trim();

      case 'claude':
        return !!settings.claudeApiKey?.trim();

      case 'mistral':
        return !!settings.mistralApiKey?.trim();

      case 'deepseek':
        return !!settings.deepseekApiKey?.trim();

      case 'zai-paas':
        return !!settings.zaiPaasApiKey?.trim();

      case 'zai-coding':
        return !!settings.zaiCodingApiKey?.trim();

      default:
        this.logger.warn('Unknown provider', { provider: settings.provider });
        return false;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Retrieves all DOM elements for the settings form.
   *
   * @returns DOM elements object
   * @throws Error if required elements are not found
   */
  private getDOMElements(): GeneralSettingsElements {
    const providerSelect = document.getElementById('provider') as HTMLSelectElement;
    const generalForm = document.getElementById('general-options-form') as HTMLFormElement;
    const generalStatusMessage = document.getElementById(
      'general-status-message'
    ) as HTMLSpanElement;
    const ollamaApiUrl = document.getElementById('ollama-api-url') as HTMLInputElement;
    const ollamaModel = document.getElementById('ollama-model') as HTMLInputElement;
    const openaiApiKey = document.getElementById('openai-api-key') as HTMLInputElement;
    const geminiApiKey = document.getElementById('gemini-api-key') as HTMLInputElement;
    const claudeApiKey = document.getElementById('claude-api-key') as HTMLInputElement;
    const mistralApiKey = document.getElementById('mistral-api-key') as HTMLInputElement;
    const deepseekApiKey = document.getElementById('deepseek-api-key') as HTMLInputElement;
    const zaiPaasApiKey = document.getElementById('zai-paas-api-key') as HTMLInputElement;
    const zaiPaasModel = document.getElementById('zai-paas-model') as HTMLSelectElement;
    const zaiCodingApiKey = document.getElementById('zai-coding-api-key') as HTMLInputElement;
    const zaiCodingModel = document.getElementById('zai-coding-model') as HTMLSelectElement;

    if (!providerSelect || !generalForm || !generalStatusMessage) {
      throw new Error('Required general settings elements not found');
    }

    return {
      providerSelect,
      generalForm,
      generalStatusMessage,
      ollamaApiUrl,
      ollamaModel,
      openaiApiKey,
      geminiApiKey,
      claudeApiKey,
      mistralApiKey,
      deepseekApiKey,
      zaiPaasApiKey,
      zaiPaasModel,
      zaiCodingApiKey,
      zaiCodingModel,
    };
  }

  /**
   * Shows/hides provider-specific settings based on selected provider.
   *
   * @param provider - Selected provider identifier
   */
  private showRelevantSettings(provider: string): void {
    document.querySelectorAll<HTMLElement>('.provider-settings').forEach((div) => {
      div.style.display = 'none';
    });

    const settingsToShow = document.getElementById(`${provider}-settings`);
    if (settingsToShow) {
      settingsToShow.style.display = 'block';
    }
  }

  /**
   * Gathers settings data based on the selected provider.
   *
   * @param provider - Selected provider identifier
   * @returns Partial provider config
   * @throws Error if provider settings elements not found
   */
  private gatherProviderSettings(provider: string): PartialProviderConfig {
    if (!this.elements) {
      throw new Error('Settings form not initialized');
    }

    const baseSettings: PartialProviderConfig = { provider };

    switch (provider) {
      case 'ollama':
        if (!this.elements.ollamaApiUrl || !this.elements.ollamaModel) {
          throw new Error('Ollama settings elements not found');
        }
        return {
          ...baseSettings,
          ollamaApiUrl: this.elements.ollamaApiUrl.value.trim(),
          ollamaModel: this.elements.ollamaModel.value.trim(),
        };

      case 'openai':
        if (!this.elements.openaiApiKey) {
          throw new Error('OpenAI settings element not found');
        }
        return {
          ...baseSettings,
          openaiApiKey: this.elements.openaiApiKey.value.trim(),
        };

      case 'gemini':
        if (!this.elements.geminiApiKey) {
          throw new Error('Gemini settings element not found');
        }
        return {
          ...baseSettings,
          geminiApiKey: this.elements.geminiApiKey.value.trim(),
        };

      case 'claude':
        if (!this.elements.claudeApiKey) {
          throw new Error('Claude settings element not found');
        }
        return {
          ...baseSettings,
          claudeApiKey: this.elements.claudeApiKey.value.trim(),
        };

      case 'mistral':
        if (!this.elements.mistralApiKey) {
          throw new Error('Mistral settings element not found');
        }
        return {
          ...baseSettings,
          mistralApiKey: this.elements.mistralApiKey.value.trim(),
        };

      case 'deepseek':
        if (!this.elements.deepseekApiKey) {
          throw new Error('DeepSeek settings element not found');
        }
        return {
          ...baseSettings,
          deepseekApiKey: this.elements.deepseekApiKey.value.trim(),
        };

      case 'zai-paas':
        if (!this.elements.zaiPaasApiKey || !this.elements.zaiPaasModel) {
          throw new Error('Zai PaaS settings element not found');
        }
        return {
          ...baseSettings,
          zaiPaasApiKey: this.elements.zaiPaasApiKey.value.trim(),
          zaiPaasModel: this.elements.zaiPaasModel.value,
        };

      case 'zai-coding':
        if (!this.elements.zaiCodingApiKey || !this.elements.zaiCodingModel) {
          throw new Error('Zai Coding settings element not found');
        }
        return {
          ...baseSettings,
          zaiCodingApiKey: this.elements.zaiCodingApiKey.value.trim(),
          zaiCodingModel: this.elements.zaiCodingModel.value,
        };

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Requests permissions for the selected provider.
   *
   * @param provider - Selected provider identifier
   * @param settings - Provider settings
   * @returns True if permission granted, false otherwise
   */
  private async requestPermissions(
    provider: string,
    settings: PartialProviderConfig
  ): Promise<boolean> {
    const origin = this.getPermissionOrigin(provider, settings);

    if (!origin) {
      return true;
    }

    try {
      const granted = await messenger.permissions.request({ origins: [origin] });
      this.logger.debug('Permission request result', { provider, origin, granted });
      return granted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error requesting permission', { error: errorMessage });
      return false;
    }
  }

  /**
   * Gets permission origin for a provider.
   *
   * @param provider - Selected provider identifier
   * @param settings - Provider settings
   * @returns Permission origin string or null
   */
  private getPermissionOrigin(provider: string, settings: PartialProviderConfig): string | null {
    switch (provider) {
      case 'ollama':
        if (settings.ollamaApiUrl) {
          try {
            return new URL(settings.ollamaApiUrl).origin + '/*';
          } catch {
            return null;
          }
        }
        return null;

      case 'openai':
        return 'https://api.openai.com/';

      case 'gemini':
        return 'https://generativelanguage.googleapis.com/';

      case 'claude':
        return 'https://api.anthropic.com/';

      case 'mistral':
        return 'https://api.mistral.ai/';

      case 'deepseek':
        return 'https://api.deepseek.com/';

      case 'zai-paas':
        return 'https://api.z.ai/';

      case 'zai-coding':
        return 'https://api.z.ai/';

      default:
        return null;
    }
  }

  /**
   * Populates the model dropdown for a specific provider.
   *
   * Dynamically loads available models from the provider's API if supported.
   *
   * @param providerId - The provider identifier (e.g., 'openai', 'ollama')
   */
  private async populateModelsForProvider(providerId: string): Promise<void> {
    try {
      // Get provider settings from UI
      const settings = this.getProviderSettings(providerId);

      // Only proceed if we have an API key (or apiUrl for Ollama)
      if (!this.hasRequiredCredentials(providerId, settings)) {
        this.logger.debug('Skipping model loading - missing credentials', { providerId });
        return;
      }

      // Get provider instance via ProviderFactory
      const provider = this.providerFactory.getProvider(providerId);

      // Check if provider supports listModels
      if (typeof provider.listModels !== 'function') {
        this.logger.debug('Provider does not support listModels', { providerId });
        return;
      }

      // Load models from provider
      const models = await provider.listModels(settings);

      // Populate the appropriate dropdown
      this.populateModelDropdown(models, providerId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to populate models', { providerId, error: errorMessage });
    }
  }

  /**
   * Gets provider settings from UI elements.
   *
   * Extracts API key, URL, and other settings from the form fields.
   *
   * @param providerId - The provider identifier
   * @returns Provider settings object
   */
  private getProviderSettings(providerId: string): IProviderSettings {
    const settings: IProviderSettings = {};

    switch (providerId) {
      case 'ollama':
        if (this.elements?.ollamaApiUrl?.value) {
          settings.apiUrl = this.elements.ollamaApiUrl.value.trim();
        }
        break;

      case 'openai':
        if (this.elements?.openaiApiKey?.value) {
          settings.apiKey = this.elements.openaiApiKey.value.trim();
        }
        break;

      case 'gemini':
        if (this.elements?.geminiApiKey?.value) {
          settings.apiKey = this.elements.geminiApiKey.value.trim();
        }
        break;

      case 'claude':
        if (this.elements?.claudeApiKey?.value) {
          settings.apiKey = this.elements.claudeApiKey.value.trim();
        }
        break;

      case 'mistral':
        if (this.elements?.mistralApiKey?.value) {
          settings.apiKey = this.elements.mistralApiKey.value.trim();
        }
        break;

      case 'deepseek':
        if (this.elements?.deepseekApiKey?.value) {
          settings.apiKey = this.elements.deepseekApiKey.value.trim();
        }
        break;

      case 'zai-paas':
        if (this.elements?.zaiPaasApiKey?.value) {
          settings.apiKey = this.elements.zaiPaasApiKey.value.trim();
        }
        settings.apiUrl = 'https://api.z.ai/v1';
        break;

      case 'zai-coding':
        if (this.elements?.zaiCodingApiKey?.value) {
          settings.apiKey = this.elements.zaiCodingApiKey.value.trim();
        }
        settings.apiUrl = 'https://api.z.ai/v1';
        break;
    }

    return settings;
  }

  /**
   * Checks if provider has required credentials for model loading.
   *
   * @param providerId - The provider identifier
   * @param settings - Provider settings
   * @returns True if credentials are present
   */
  private hasRequiredCredentials(providerId: string, settings: IProviderSettings): boolean {
    switch (providerId) {
      case 'ollama':
        return !!settings.apiUrl?.trim();
      case 'zai-paas':
      case 'zai-coding':
      case 'openai':
      case 'gemini':
      case 'claude':
      case 'mistral':
      case 'deepseek':
        return !!settings.apiKey?.trim();
      default:
        return false;
    }
  }

  /**
   * Populates a model dropdown with available models.
   *
   * @param models - Array of model names
   * @param providerId - The provider identifier
   */
  private populateModelDropdown(models: string[], providerId: string): void {
    let modelDropdown: HTMLSelectElement | null = null;

    // Find the correct dropdown for the provider
    switch (providerId) {
      case 'zai-paas':
        modelDropdown = this.elements?.zaiPaasModel ?? null;
        break;
      case 'zai-coding':
        modelDropdown = this.elements?.zaiCodingModel ?? null;
        break;
      // Other providers can be added here in the future
    }

    if (!modelDropdown) {
      this.logger.debug('No model dropdown found for provider', { providerId });
      return;
    }

    // Clear existing options
    modelDropdown.innerHTML = '';

    // Add new options
    models.forEach((model: string) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelDropdown!.appendChild(option);
    });

    this.logger.info('Populated model dropdown', { providerId, count: models.length });
  }

  /**
   * Converts partial provider config to IProviderSettings.
   *
   * @param partial - Partial provider config from form
   * @returns IProviderSettings for ConfigRepository
   */
  private convertToProviderSettings(
    partial: PartialProviderConfig
  ): import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings {
    const settings: import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings = {
      apiKey: '',
      model: '',
    };

    switch (partial.provider) {
      case 'ollama':
        settings.apiKey = '';
        settings.model = partial.ollamaModel ?? '';
        settings.apiUrl = partial.ollamaApiUrl;
        break;

      case 'openai':
        settings.apiKey = partial.openaiApiKey ?? '';
        settings.model = 'gpt-4o-mini';
        break;

      case 'gemini':
        settings.apiKey = partial.geminiApiKey ?? '';
        settings.model = 'gemini-2.0-flash-exp';
        break;

      case 'claude':
        settings.apiKey = partial.claudeApiKey ?? '';
        settings.model = 'claude-3-5-sonnet-20241022';
        break;

      case 'mistral':
        settings.apiKey = partial.mistralApiKey ?? '';
        settings.model = 'mistral-large-latest';
        break;

      case 'deepseek':
        settings.apiKey = partial.deepseekApiKey ?? '';
        settings.model = 'deepseek-chat';
        break;

      case 'zai-paas':
        settings.apiKey = partial.zaiPaasApiKey ?? '';
        settings.model = partial.zaiPaasModel ?? 'glm-4.5';
        settings.apiUrl = 'https://api.z.ai/v1';
        break;

      case 'zai-coding':
        settings.apiKey = partial.zaiCodingApiKey ?? '';
        settings.model = partial.zaiCodingModel ?? 'glm-4.7';
        settings.apiUrl = 'https://api.z.ai/v1';
        break;

      default:
        throw new Error(`Unknown provider: ${partial.provider}`);
    }

    return settings;
  }

  /**
   * Sets a status message and clears it after a delay.
   *
   * @param message - Message to display
   * @param delay - Delay before clearing (default: 3000ms)
   */
  private setStatusMessage(message: string, delay: number = 3000): void {
    if (this.elements?.generalStatusMessage) {
      this.elements.generalStatusMessage.textContent = message;
      setTimeout(() => {
        if (this.elements?.generalStatusMessage) {
          this.elements.generalStatusMessage.textContent = '';
        }
      }, delay);
    }
  }
}
