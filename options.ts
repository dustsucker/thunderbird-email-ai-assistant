import 'reflect-metadata';

import {
  DEFAULTS,
  Provider,
  ProviderConfig,
  CustomTags,
  Tag,
  isValidProvider,
  ModelConcurrencyConfig,
} from './core/config';
import {
  ErrorSeverity,
  ErrorType,
  ErrorDisplay,
  ShowErrorRuntimeMessage,
  debounce,
} from './src/infrastructure/providers/ProviderUtils';

/**
 * Batch processing statistics
 */
interface BatchStatistics {
  total: number;
  successful: number;
  failed: number;
  [key: string]: unknown;
}
import { ensureTagsExist } from './core/tags';
import { logger } from './src/infrastructure/providers/ProviderUtils';
import { fetchZaiModels } from './src/infrastructure/providers';

declare const messenger: {
  storage: {
    local: {
      get(
        keys: Partial<ProviderConfig> | { customTags?: CustomTags }
      ): Promise<Partial<ProviderConfig> & { customTags?: CustomTags }>;
      set(items: Partial<ProviderConfig> & { customTags?: CustomTags }): Promise<void>;
      get(keys: unknown): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    reload(): void;
  };
  permissions: {
    request(permissions: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  };
};

interface StorageProviderSettings {
  [providerId: string]: {
    apiKey: string;
    model: string;
    apiUrl?: string;
  };
}

interface AppSettingsStorage {
  appConfig?: {
    defaultProvider?: string;
    enableNotifications?: boolean;
    enableLogging?: boolean;
    minConfidenceThreshold?: number;
  };
  providerSettings?: StorageProviderSettings;
  customTags?: CustomTags;
}

interface BrowserRuntime {
  sendMessage<T = unknown>(message: unknown, callback?: (response: T) => void): void;
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => void
    ): void;
  };
  lastError?: { message: string };
}

interface BrowserExtension {
  runtime: BrowserRuntime;
}

declare global {
  interface Window {
    browser: BrowserExtension;
  }
}

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
  statusMessage: HTMLSpanElement;
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
  minConfidenceThreshold: HTMLInputElement | null;
  minConfidenceThresholdSlider: HTMLInputElement | null;
  confidenceValue: HTMLSpanElement | null;
}

/**
 * Tag Management DOM Elements
 */
interface TagManagementElements {
  tagListContainer: HTMLDivElement;
  modal: HTMLDivElement;
  modalTitle: HTMLHeadingElement;
  tagForm: HTMLFormElement;
  closeModalBtn: HTMLSpanElement;
  addNewTagBtn: HTMLButtonElement;
  tagIndex: HTMLInputElement;
  tagName: HTMLInputElement;
  tagKey: HTMLInputElement;
  tagColor: HTMLInputElement;
  tagPrompt: HTMLTextAreaElement;
}

/**
 * Tab DOM Elements
 */
interface TabElements {
  tabButtons: NodeListOf<HTMLButtonElement>;
  tabContents: NodeListOf<HTMLDivElement>;
}

/**
 * Cache Management DOM Elements
 */
interface CacheManagementElements {
  clearCacheBtn: HTMLButtonElement;
  cacheStatusMessage: HTMLSpanElement;
  cacheStats: HTMLSpanElement;
}

/**
 * All DOM Elements
 */
interface DOMElements
  extends GeneralSettingsElements, TagManagementElements, CacheManagementElements {
  tabs: TabElements['tabButtons'];
  tabContents: TabElements['tabContents'];
}

// ============================================================================
// UI State Interfaces
// ============================================================================

/**
 * Tag Form State
 */
interface TagFormState {
  index: number;
  name: string;
  key: string;
  color: string;
  prompt: string;
}

/**
 * Settings Save Result
 */
interface SettingsSaveResult {
  success: boolean;
  message: string;
}

/**
 * Tag Edit Context
 */
interface TagEditContext {
  tag: Tag | null;
  index: number;
}

// ============================================================================
// Provider Settings Types
// ============================================================================

/**
 * Settings to save for each provider type
 */
type ProviderSettingsData =
  | { provider: Provider.OLLAMA; ollamaApiUrl: string; ollamaModel: string }
  | { provider: Provider.OPENAI; openaiApiKey: string }
  | { provider: Provider.GEMINI; geminiApiKey: string }
  | { provider: Provider.CLAUDE; claudeApiKey: string }
  | { provider: Provider.MISTRAL; mistralApiKey: string }
  | { provider: Provider.DEEPSEEK; deepseekApiKey: string };

/**
 * Partial provider config for saving
 */
type PartialProviderConfig = {
  provider: Provider;
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

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Storage response for general settings
 */
interface GeneralSettingsStorage {
  provider?: Provider;
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
 * Storage response for custom tags
 */
interface CustomTagsStorage {
  customTags?: CustomTags;
}

// ============================================================================
// Event Handler Types
// ============================================================================

/**
 * Tab click event handler
 */
type TabClickHandler = (event: MouseEvent) => void;

/**
 * Form submit event handler for general settings
 */
type GeneralSettingsSubmitHandler = (event: SubmitEvent) => Promise<void>;

/**
 * Provider change event handler
 */
type ProviderChangeHandler = (event: Event) => void;

/**
 * Tag list click event handler
 */
type TagListClickHandler = (event: MouseEvent) => void;

/**
 * Tag form submit event handler
 */
type TagFormSubmitHandler = (event: SubmitEvent) => void;

/**
 * Batch analysis click event handler
 */
type BatchAnalysisClickHandler = (event: MouseEvent) => void;

// ============================================================================
// Batch Analysis Types
// ============================================================================

/**
 * Batch analysis status
 */
type BatchStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

/**
 * Batch analysis progress data
 */
interface BatchProgress {
  status: BatchStatus;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

/**
 * Batch analysis response
 */
interface BatchAnalysisResponse {
  success: boolean;
  statistics?: BatchStatistics;
  error?: string;
  message?: string;
}

/**
 * Batch analysis cancel response
 */
interface BatchCancelResponse {
  success: boolean;
  message: string;
}

/**
 * Runtime message types for batch analysis
 */
type BatchRuntimeMessage =
  | { action: 'startBatchAnalysis'; folderId?: string }
  | { action: 'getBatchProgress' }
  | { action: 'cancelBatchAnalysis' }
  | { action: 'clearQueue'; cancelRunning?: boolean }
  | { action: 'clearCache' }
  | { action: 'getCacheStats' }
  | ShowErrorRuntimeMessage;

/**
 * Runtime message response types
 */
type BatchRuntimeResponse =
  | BatchAnalysisResponse
  | BatchProgress
  | BatchCancelResponse
  | { success: boolean; message: string };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Type guard to check if an element is a valid provider settings element
 */
function isProviderSettingsElement(element: HTMLElement | null): element is HTMLDivElement {
  return element !== null && element.classList.contains('provider-settings');
}

/**
 * Type guard to check if an event target is a button with index data
 */
function isButtonWithIndex(
  target: EventTarget | null
): target is HTMLButtonElement & { dataset: { index: string } } {
  if (target === null || !(target instanceof HTMLButtonElement)) {
    return false;
  }
  return 'index' in target.dataset && typeof target.dataset.index === 'string';
}

/**
 * Validates tag key format
 * Pattern: lowercase letters, numbers, underscores only
 */
function isValidTagKey(key: string): boolean {
  return /^[a-z0-9_]+$/.test(key);
}

/**
 * Validates hex color format
 */
function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Gets permission origin for a provider
 */
function getPermissionOrigin(provider: Provider, settings: PartialProviderConfig): string {
  switch (provider) {
    case Provider.OLLAMA:
      if (settings.ollamaApiUrl) {
        return new URL(settings.ollamaApiUrl).origin + '/*';
      }
      throw new Error('Ollama API URL is required for permission request');
    case Provider.OPENAI:
      return 'https://api.openai.com/';
    case Provider.GEMINI:
      return 'https://generativelanguage.googleapis.com/';
    case Provider.CLAUDE:
      return 'https://api.anthropic.com/';
    case Provider.MISTRAL:
      return 'https://api.mistral.ai/';
    case Provider.DEEPSEEK:
      return 'https://api.deepseek.com/';
    case Provider.ZAI_PAAS:
      return 'https://api.z.ai/';
    case Provider.ZAI_CODING:
      return 'https://api.z.ai/';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ============================================================================
// DOM Element Accessors
// ============================================================================

/**
 * Safely retrieves an element by ID with type assertion
 */
function getElementById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Retrieves all general settings DOM elements
 */
function getGeneralSettingsElements(): GeneralSettingsElements {
  const providerSelect = getElementById<HTMLSelectElement>('provider');
  const generalForm = getElementById<HTMLFormElement>('provider-options-form');
  const generalStatusMessage = getElementById<HTMLSpanElement>('provider-status-message');
  const statusMessage = getElementById<HTMLSpanElement>('provider-status-message');
  const ollamaApiUrl = getElementById<HTMLInputElement>('ollama-api-url');
  const ollamaModel = getElementById<HTMLInputElement>('ollama-model');
  const openaiApiKey = getElementById<HTMLInputElement>('openai-api-key');
  const geminiApiKey = getElementById<HTMLInputElement>('gemini-api-key');
  const claudeApiKey = getElementById<HTMLInputElement>('claude-api-key');
  const mistralApiKey = getElementById<HTMLInputElement>('mistral-api-key');
  const deepseekApiKey = getElementById<HTMLInputElement>('deepseek-api-key');
  const zaiPaasApiKey = getElementById<HTMLInputElement>('zaiPaasApiKey');
  const zaiPaasModel = getElementById<HTMLSelectElement>('zaiPaasModel');
  const zaiCodingApiKey = getElementById<HTMLInputElement>('zaiCodingApiKey');
  const zaiCodingModel = getElementById<HTMLSelectElement>('zaiCodingModel');
  const minConfidenceThreshold = getElementById<HTMLInputElement>('min-confidence-threshold');
  const minConfidenceThresholdSlider = getElementById<HTMLInputElement>('min-confidence-threshold-slider');
  const confidenceValue = getElementById<HTMLSpanElement>('confidence-value');

  if (!providerSelect || !generalForm || !generalStatusMessage || !statusMessage) {
    throw new Error('Required general settings elements not found');
  }

  return {
    providerSelect,
    generalForm,
    generalStatusMessage,
    statusMessage,
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
    minConfidenceThreshold,
    minConfidenceThresholdSlider,
    confidenceValue,
  };
}

/**
 * Retrieves all tag management DOM elements
 */
function getTagManagementElements(): TagManagementElements {
  const tagListContainer = getElementById<HTMLDivElement>('tag-list-container');
  const modal = getElementById<HTMLDivElement>('tag-modal');
  const modalTitle = getElementById<HTMLHeadingElement>('modal-title');
  const tagForm = getElementById<HTMLFormElement>('tag-form');
  const closeModalBtn = document.querySelector<HTMLSpanElement>('.close-button');
  const addNewTagBtn = getElementById<HTMLButtonElement>('add-new-tag-btn');
  const tagIndex = getElementById<HTMLInputElement>('tag-index');
  const tagName = getElementById<HTMLInputElement>('tag-name');
  const tagKey = getElementById<HTMLInputElement>('tag-key');
  const tagColor = getElementById<HTMLInputElement>('tag-color');
  const tagPrompt = getElementById<HTMLTextAreaElement>('tag-prompt');

  if (
    !tagListContainer ||
    !modal ||
    !modalTitle ||
    !tagForm ||
    !closeModalBtn ||
    !addNewTagBtn ||
    !tagIndex ||
    !tagName ||
    !tagKey ||
    !tagColor ||
    !tagPrompt
  ) {
    throw new Error('Required tag management elements not found');
  }

  return {
    tagListContainer,
    modal,
    modalTitle,
    tagForm,
    closeModalBtn,
    addNewTagBtn,
    tagIndex,
    tagName,
    tagKey,
    tagColor,
    tagPrompt,
  };
}

/**
 * Retrieves all DOM elements
 */
function getAllDOMElements(): DOMElements {
  const general = getGeneralSettingsElements();
  const tag = getTagManagementElements();

  const clearCacheBtn = getElementById<HTMLButtonElement>('clear-cache-btn');
  const cacheStatusMessage = getElementById<HTMLSpanElement>('cache-status-message');
  const cacheStats = getElementById<HTMLSpanElement>('cache-stats');

  if (!clearCacheBtn || !cacheStatusMessage || !cacheStats) {
    throw new Error('Required cache management elements not found');
  }

  return {
    ...general,
    ...tag,
    clearCacheBtn,
    cacheStatusMessage,
    cacheStats,
    tabs: document.querySelectorAll('.tab-button'),
    tabContents: document.querySelectorAll('.tab-content'),
  };
}

// ============================================================================
// Tab Management Functions
// ============================================================================

/**
 * Handles tab switching
 */
function handleTabClick(
  tabs: NodeListOf<HTMLButtonElement>,
  tabContents: NodeListOf<HTMLDivElement>
): TabClickHandler {
  return (event: MouseEvent): void => {
    const clickedTab = event.currentTarget as HTMLButtonElement;
    const targetTabId = clickedTab.dataset.tab;

    if (!targetTabId) {
      logger.warn('Tab does not have data-tab attribute', { tab: clickedTab });
      return;
    }

    tabs.forEach((tab) => tab.classList.remove('active'));
    clickedTab.classList.add('active');

    tabContents.forEach((content) => content.classList.remove('active'));

    const targetContent = document.getElementById(targetTabId);
    if (targetContent) {
      targetContent.classList.add('active');
    } else {
      logger.warn('Target tab content not found', { tabId: targetTabId });
    }
  };
}

/**
 * Initializes tab functionality
 */
function initializeTabs(
  tabs: NodeListOf<HTMLButtonElement>,
  tabContents: NodeListOf<HTMLDivElement>
): void {
  tabs.forEach((tab) => {
    tab.addEventListener('click', handleTabClick(tabs, tabContents));
  });
}

// ============================================================================
// General Settings Functions
// ============================================================================

/**
 * Shows/hides provider-specific settings based on selected provider
 */
function showRelevantSettings(provider: string): void {
  logger.info('[DEBUG-options] showRelevantSettings() called', { provider });

  document.querySelectorAll<HTMLElement>('.provider-settings').forEach((div) => {
    div.style.display = 'none';
    div
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[required], select[required]')
      .forEach((field) => {
        field.removeAttribute('required');
      });
  });

  const settingsToShow = document.getElementById(`${provider}-settings`);
  if (settingsToShow && isProviderSettingsElement(settingsToShow)) {
    logger.info('[DEBUG-options] Showing settings for provider', { provider });
    settingsToShow.style.display = 'block';
    settingsToShow
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')
      .forEach((field) => {
        field.setAttribute('required', '');
      });
  } else {
    logger.warn('[DEBUG-options] No settings found for provider', { provider });
  }
}

/**
 * Loads general settings from storage and populates form fields
 */
async function loadGeneralSettings(elements: GeneralSettingsElements): Promise<void> {
  logger.info('[DEBUG-options] loadGeneralSettings() called');

  try {
    const data = (await messenger.storage.local.get({
      appConfig: { defaultProvider: DEFAULTS.provider },
      providerSettings: {},
    })) as AppSettingsStorage;

    const appConfig = data.appConfig || {};
    const providerSettings = data.providerSettings || {};

    logger.info('[DEBUG-options] Storage loaded', {
      appConfig,
      providerSettings,
    });

    elements.providerSelect.value = appConfig.defaultProvider || DEFAULTS.provider;

    // Load min confidence threshold
    const minConfidenceThreshold = appConfig.minConfidenceThreshold ?? DEFAULTS.minConfidenceThreshold;
    if (elements.minConfidenceThreshold) {
      elements.minConfidenceThreshold.value = minConfidenceThreshold.toString();
    }
    if (elements.minConfidenceThresholdSlider) {
      elements.minConfidenceThresholdSlider.value = minConfidenceThreshold.toString();
    }
    if (elements.confidenceValue) {
      elements.confidenceValue.textContent = minConfidenceThreshold.toString();
    }
    logger.info('[DEBUG-options] Loaded minConfidenceThreshold', {
      threshold: minConfidenceThreshold,
    });

    if (elements.ollamaApiUrl && providerSettings.ollama) {
      logger.info('[DEBUG-options] Loaded ollama settings', {
        apiUrl: providerSettings.ollama.apiUrl,
        model: providerSettings.ollama.model,
      });
      elements.ollamaApiUrl.value = providerSettings.ollama.apiUrl || '';
    }
    if (elements.ollamaModel && providerSettings.ollama) {
      elements.ollamaModel.value = providerSettings.ollama.model || '';
    }
    if (elements.openaiApiKey && providerSettings.openai) {
      logger.info('[DEBUG-options] Loaded openai settings', {
        apiKey: providerSettings.openai.apiKey ? '***REDACTED***' : '',
      });
      elements.openaiApiKey.value = providerSettings.openai.apiKey || '';
    }
    if (elements.geminiApiKey && providerSettings.gemini) {
      logger.info('[DEBUG-options] Loaded gemini settings', {
        apiKey: providerSettings.gemini.apiKey ? '***REDACTED***' : '',
      });
      elements.geminiApiKey.value = providerSettings.gemini.apiKey || '';
    }
    if (elements.claudeApiKey && providerSettings.claude) {
      logger.info('[DEBUG-options] Loaded claude settings', {
        apiKey: providerSettings.claude.apiKey ? '***REDACTED***' : '',
      });
      elements.claudeApiKey.value = providerSettings.claude.apiKey || '';
    }
    if (elements.mistralApiKey && providerSettings.mistral) {
      logger.info('[DEBUG-options] Loaded mistral settings', {
        apiKey: providerSettings.mistral.apiKey ? '***REDACTED***' : '',
      });
      elements.mistralApiKey.value = providerSettings.mistral.apiKey || '';
    }
    if (elements.deepseekApiKey && providerSettings.deepseek) {
      logger.info('[DEBUG-options] Loaded deepseek settings', {
        apiKey: providerSettings.deepseek.apiKey ? '***REDACTED***' : '',
      });
      elements.deepseekApiKey.value = providerSettings.deepseek.apiKey || '';
    }
    if (elements.zaiPaasApiKey && providerSettings['zai-paas']) {
      logger.info('[DEBUG-options] Loaded zai-paas settings', {
        apiKey: providerSettings['zai-paas'].apiKey ? '***REDACTED***' : '',
        model: providerSettings['zai-paas'].model,
      });
      elements.zaiPaasApiKey.value = providerSettings['zai-paas'].apiKey || '';
    }
    if (elements.zaiPaasModel && providerSettings['zai-paas']) {
      elements.zaiPaasModel.value = providerSettings['zai-paas'].model || '';
    }
    if (elements.zaiCodingApiKey && providerSettings['zai-coding']) {
      logger.info('[DEBUG-options] Loaded zai-coding settings', {
        apiKey: providerSettings['zai-coding'].apiKey ? '***REDACTED***' : '',
        model: providerSettings['zai-coding'].model,
      });
      elements.zaiCodingApiKey.value = providerSettings['zai-coding'].apiKey || '';
    }
    if (elements.zaiCodingModel && providerSettings['zai-coding']) {
      elements.zaiCodingModel.value = providerSettings['zai-coding'].model || '';
    }

    showRelevantSettings(appConfig.defaultProvider || DEFAULTS.provider);

    // Populate z.ai models if API key is present
    if (elements.zaiPaasApiKey && elements.zaiPaasApiKey.value) {
      logger.info('[DEBUG-options] Populating zaiPaas models on load');
      populateZaiModels('zaiPaas').catch((error) => {
        logger.error('Failed to populate z.ai PaaS models on load', { error });
      });
    }
    if (elements.zaiCodingApiKey && elements.zaiCodingApiKey.value) {
      logger.info('[DEBUG-options] Populating zaiCoding models on load');
      populateZaiModels('zaiCoding').catch((error) => {
        logger.error('Failed to populate z.ai Coding models on load', { error });
      });
    }

    logger.info('[DEBUG-options] loadGeneralSettings() completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error loading general settings', { error: errorMessage });
  }
}

/**
 * Gathers settings data based on selected provider
 */
function gatherProviderSettings(
  provider: string,
  elements: GeneralSettingsElements
): PartialProviderConfig {
  logger.info('[DEBUG-options] gatherProviderSettings() called', { provider });

  const baseSettings: PartialProviderConfig = { provider: provider as Provider };

  switch (provider) {
    case Provider.OLLAMA:
      if (!elements.ollamaApiUrl || !elements.ollamaModel) {
        throw new Error('Ollama settings elements not found');
      }
      const ollamaSettings = {
        ...baseSettings,
        ollamaApiUrl: elements.ollamaApiUrl.value.trim(),
        ollamaModel: elements.ollamaModel.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered ollama settings', {
        apiUrl: ollamaSettings.ollamaApiUrl,
        model: ollamaSettings.ollamaModel,
      });
      return ollamaSettings;

    case Provider.OPENAI:
      if (!elements.openaiApiKey) {
        throw new Error('OpenAI settings element not found');
      }
      const openaiSettings = {
        ...baseSettings,
        openaiApiKey: elements.openaiApiKey.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered openai settings', {
        apiKey: openaiSettings.openaiApiKey ? '***REDACTED***' : '',
      });
      return openaiSettings;

    case Provider.GEMINI:
      if (!elements.geminiApiKey) {
        throw new Error('Gemini settings element not found');
      }
      const geminiSettings = {
        ...baseSettings,
        geminiApiKey: elements.geminiApiKey.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered gemini settings', {
        apiKey: geminiSettings.geminiApiKey ? '***REDACTED***' : '',
      });
      return geminiSettings;

    case Provider.CLAUDE:
      if (!elements.claudeApiKey) {
        throw new Error('Claude settings element not found');
      }
      const claudeSettings = {
        ...baseSettings,
        claudeApiKey: elements.claudeApiKey.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered claude settings', {
        apiKey: claudeSettings.claudeApiKey ? '***REDACTED***' : '',
      });
      return claudeSettings;

    case Provider.MISTRAL:
      if (!elements.mistralApiKey) {
        throw new Error('Mistral settings element not found');
      }
      const mistralSettings = {
        ...baseSettings,
        mistralApiKey: elements.mistralApiKey.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered mistral settings', {
        apiKey: mistralSettings.mistralApiKey ? '***REDACTED***' : '',
      });
      return mistralSettings;

    case Provider.DEEPSEEK:
      if (!elements.deepseekApiKey) {
        throw new Error('DeepSeek settings element not found');
      }
      const deepseekSettings = {
        ...baseSettings,
        deepseekApiKey: elements.deepseekApiKey.value.trim(),
      };
      logger.info('[DEBUG-options] Gathered deepseek settings', {
        apiKey: deepseekSettings.deepseekApiKey ? '***REDACTED***' : '',
      });
      return deepseekSettings;

    case Provider.ZAI_PAAS:
      if (!elements.zaiPaasApiKey || !elements.zaiPaasModel) {
        throw new Error('Zai PaaS settings element not found');
      }
      const zaiPaasSettings = {
        ...baseSettings,
        zaiPaasApiKey: elements.zaiPaasApiKey.value.trim(),
        zaiPaasModel: elements.zaiPaasModel.value,
      };
      logger.info('[DEBUG-options] Gathered zai-paas settings', {
        apiKey: zaiPaasSettings.zaiPaasApiKey ? '***REDACTED***' : '',
        model: zaiPaasSettings.zaiPaasModel,
      });
      return zaiPaasSettings;

    case Provider.ZAI_CODING:
      if (!elements.zaiCodingApiKey || !elements.zaiCodingModel) {
        throw new Error('Zai Coding settings element not found');
      }
      const zaiCodingSettings = {
        ...baseSettings,
        zaiCodingApiKey: elements.zaiCodingApiKey.value.trim(),
        zaiCodingModel: elements.zaiCodingModel.value,
      };
      logger.info('[DEBUG-options] Gathered zai-coding settings', {
        apiKey: zaiCodingSettings.zaiCodingApiKey ? '***REDACTED***' : '',
        model: zaiCodingSettings.zaiCodingModel,
      });
      return zaiCodingSettings;

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Handles general settings form submission
 */
async function handleGeneralSettingsSubmit(
  elements: GeneralSettingsElements
): Promise<SettingsSaveResult> {
  const provider = elements.providerSelect.value;

  logger.info('[DEBUG-options] handleGeneralSettingsSubmit() called', { provider });

  if (!isValidProvider(provider)) {
    logger.warn('[DEBUG-options] Invalid provider selected', { provider });
    return {
      success: false,
      message: 'Invalid provider selected',
    };
  }

  const settingsToSave = gatherProviderSettings(provider, elements);
  logger.info('[DEBUG-options] Gathered settings', { settingsToSave });

  let permissionGranted = true;

  try {
    const permissionOrigin = getPermissionOrigin(provider as Provider, settingsToSave);
    const hasSettings = Object.values(settingsToSave).some((val) => val && val !== '');

    if (hasSettings) {
      try {
        logger.info('[DEBUG-options] Requesting permission for origin', {
          origin: permissionOrigin,
        });
        permissionGranted = await messenger.permissions.request({
          origins: [permissionOrigin],
        });
        logger.info('[DEBUG-options] Permission result', {
          granted: permissionGranted,
          origin: permissionOrigin,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('[DEBUG-options] Error requesting permission', { error: errorMessage });
        return {
          success: false,
          message: 'Error with permission request',
        };
      }
    } else {
      logger.info('[DEBUG-options] No settings to save, skipping permission request');
    }

    if (permissionGranted) {
      const data = (await messenger.storage.local.get({
        appConfig: {
          enableNotifications: DEFAULTS.enableNotifications,
          enableLogging: DEFAULTS.enableLogging,
          modelConcurrencyLimits: DEFAULTS.modelConcurrencyLimits,
        },
        providerSettings: {},
      })) as AppSettingsStorage;

      const providerSettings = data.providerSettings || {};
      const existingAppConfig = data.appConfig || {};

      const convertedSettings = convertToProviderSettings(settingsToSave);
      providerSettings[provider] = convertedSettings;

      existingAppConfig.defaultProvider = provider as Provider;

      // Save min confidence threshold
      if (elements.minConfidenceThreshold && elements.minConfidenceThreshold.value !== '') {
        const threshold = parseInt(elements.minConfidenceThreshold.value, 10);
        if (!isNaN(threshold) && threshold >= 0 && threshold <= 100) {
          existingAppConfig.minConfidenceThreshold = threshold;
          logger.info('[DEBUG-options] Saving minConfidenceThreshold', {
            threshold,
          });
        } else {
          logger.warn('[DEBUG-options] Invalid minConfidenceThreshold, using default', {
            threshold,
          });
          existingAppConfig.minConfidenceThreshold = DEFAULTS.minConfidenceThreshold;
        }
      } else {
        existingAppConfig.minConfidenceThreshold = DEFAULTS.minConfidenceThreshold;
      }

      logger.info('[DEBUG-options] Saving to storage', {
        appConfig: existingAppConfig,
        providerSettings,
      });

      await messenger.storage.local.set({
        appConfig: existingAppConfig,
        providerSettings,
      });

      logger.info('[DEBUG-options] Settings saved successfully');

      return {
        success: true,
        message: 'Settings saved!',
      };
    } else {
      logger.warn('[DEBUG-options] Permission denied, settings not saved');
      return {
        success: false,
        message: 'Permission denied. Settings not saved.',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[DEBUG-options] Save failed', { error: errorMessage });
    return {
      success: false,
      message: 'Error saving settings',
    };
  }
}

function convertToProviderSettings(settings: PartialProviderConfig) {
  logger.info('[DEBUG-options] convertToProviderSettings() called', {
    provider: settings.provider,
    input: settings,
  });

  let result: { apiKey: string; model: string; apiUrl?: string };

  switch (settings.provider) {
    case Provider.OLLAMA:
      result = {
        apiKey: '',
        model: settings.ollamaModel || '',
        apiUrl: settings.ollamaApiUrl || '',
      };
      logger.info('[DEBUG-options] Converted ollama settings', { result });
      return result;

    case Provider.OPENAI:
      result = {
        apiKey: settings.openaiApiKey || '',
        model: 'gpt-4o-mini',
      };
      logger.info('[DEBUG-options] Converted openai settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.GEMINI:
      result = {
        apiKey: settings.geminiApiKey || '',
        model: 'gemini-2.0-flash-exp',
      };
      logger.info('[DEBUG-options] Converted gemini settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.CLAUDE:
      result = {
        apiKey: settings.claudeApiKey || '',
        model: 'claude-3-5-sonnet-20241022',
      };
      logger.info('[DEBUG-options] Converted claude settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.MISTRAL:
      result = {
        apiKey: settings.mistralApiKey || '',
        model: 'mistral-large-latest',
      };
      logger.info('[DEBUG-options] Converted mistral settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.DEEPSEEK:
      result = {
        apiKey: settings.deepseekApiKey || '',
        model: 'deepseek-chat',
      };
      logger.info('[DEBUG-options] Converted deepseek settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.ZAI_PAAS:
      result = {
        apiKey: settings.zaiPaasApiKey || '',
        model: settings.zaiPaasModel || 'glm-4.5',
        apiUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
      };
      logger.info('[DEBUG-options] Converted zai-paas settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
        apiUrl: result.apiUrl,
      });
      return result;

    case Provider.ZAI_CODING:
      result = {
        apiKey: settings.zaiCodingApiKey || '',
        model: settings.zaiCodingModel || 'glm-4.7',
        apiUrl: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
      };
      logger.info('[DEBUG-options] Converted zai-coding settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
        apiUrl: result.apiUrl,
      });
      return result;

    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}

/**
 * Sets a status message and clears it after a delay
 */
function setStatusMessage(element: HTMLSpanElement, message: string, delay: number = 3000): void {
  element.textContent = message;
  setTimeout(() => {
    element.textContent = '';
  }, delay);
}

/**
 * Populates the z.ai model dropdown with available models from the API
 */
async function populateZaiModels(provider: 'zaiPaas' | 'zaiCoding'): Promise<void> {
  const zaiKeyInput = document.getElementById(`${provider}ApiKey`) as HTMLInputElement;
  const zaiModelSelect = document.getElementById(`${provider}Model`) as HTMLSelectElement;

  if (!zaiKeyInput?.value) {
    return; // Kein API-Key, nichts zu tun
  }

  try {
    logger.info(`[DEBUG-options] Fetching ${provider} models`);
    const models = await fetchZaiModels(zaiKeyInput.value);

    // Clear existing options
    zaiModelSelect.innerHTML = '';

    // Add new options
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      zaiModelSelect.appendChild(option);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to populate ${provider} models`, { error: errorMessage });
  }
}

// ============================================================================
// Tag Management Functions
// ============================================================================

/**
 * Renders the tag list to the DOM
 */
function renderTagList(container: HTMLDivElement, customTags: CustomTags): void {
  container.innerHTML = '';

  customTags.forEach((tag, index) => {
    const item = document.createElement('div');
    item.className = 'tag-item';
    item.innerHTML = `
      <div class="tag-color-preview" style="background-color: ${escapeHtml(tag.color)};"></div>
      <div class="tag-details">
        <div class="tag-name">${escapeHtml(tag.name)}</div>
        <div class="tag-key">Key: ${escapeHtml(tag.key)}</div>
        <div class="tag-prompt">Prompt: ${escapeHtml(tag.prompt || '')}</div>
      </div>
      <div class="tag-actions">
        <button class="edit-tag-btn" data-index="${index}">Edit</button>
        <button class="delete-tag-btn" data-index="${index}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * Cleans up resources when the page is unloaded
 */
function cleanupResources(): void {
  // No resources to clean up
}

// ============================================================================
// ERROR DISPLAY FUNCTIONALITY
// ============================================================================

/**
 * Error display element in the options page
 */
let errorDisplayElement: HTMLDivElement | null = null;

/**
 * Creates the error display overlay if it doesn't exist
 */
function ensureErrorDisplay(): HTMLDivElement {
  if (errorDisplayElement) {
    return errorDisplayElement;
  }

  const errorOverlay = document.createElement('div');
  errorOverlay.id = 'error-display-overlay';
  errorOverlay.className = 'error-display-overlay';
  errorOverlay.innerHTML = `
    <div class="error-display-content">
      <div class="error-display-header">
        <span class="error-display-icon"></span>
        <h3 id="error-display-title"></h3>
        <button class="error-display-close">&times;</button>
      </div>
      <p id="error-display-message"></p>
      <div id="error-display-details" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
    </div>
  `;

  const closeButton = errorOverlay.querySelector('.error-display-close') as HTMLButtonElement;
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (errorDisplayElement) {
        errorDisplayElement.remove();
        errorDisplayElement = null;
      }
    });
  }

  document.body.appendChild(errorOverlay);
  errorDisplayElement = errorOverlay;
  return errorOverlay;
}

/**
 * Shows an error message to the user
 * @param error - Error information to display
 */
function showError(error: ErrorDisplay): void {
  const overlay = ensureErrorDisplay();
  const title = overlay.querySelector('#error-display-title') as HTMLElement;
  const message = overlay.querySelector('#error-display-message') as HTMLElement;
  const details = overlay.querySelector('#error-display-details') as HTMLElement;
  const icon = overlay.querySelector('.error-display-icon') as HTMLElement;

  // Set icon based on severity
  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      icon.textContent = '🚨';
      icon.style.fontSize = '24px';
      break;
    case ErrorSeverity.WARNING:
      icon.textContent = '⚠️';
      icon.style.fontSize = '24px';
      break;
    case ErrorSeverity.INFO:
      icon.textContent = 'ℹ️';
      icon.style.fontSize = '24px';
      break;
  }

  // Set title based on type and severity
  const typeTitle = error.type ? error.type.charAt(0).toUpperCase() + error.type.slice(1) : 'Error';
  title.textContent = `${typeTitle} (${error.severity})`;

  // Set message
  message.textContent = error.message;

  // Set details if available
  if (error.context && Object.keys(error.context).length > 0) {
    const detailsText = Object.entries(error.context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    details.textContent = detailsText;
    details.style.display = 'block';
  } else {
    details.style.display = 'none';
  }

  // Style based on severity
  overlay.style.display = 'flex';
  const content = overlay.querySelector('.error-display-content') as HTMLDivElement;

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      content.style.borderLeft = '4px solid #d32f2f';
      content.style.backgroundColor = '#ffebee';
      break;
    case ErrorSeverity.WARNING:
      content.style.borderLeft = '4px solid #ff9800';
      content.style.backgroundColor = '#fff3e0';
      break;
    case ErrorSeverity.INFO:
      content.style.borderLeft = '4px solid #2196f3';
      content.style.backgroundColor = '#e3f2fd';
      break;
  }

  // Auto-hide info and warning errors after 5 seconds
  if (error.severity !== ErrorSeverity.CRITICAL) {
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
        errorDisplayElement = null;
      }
    }, 5000);
  }

  logger.info('Error displayed to user', {
    severity: error.severity,
    type: error.type,
    message: error.message,
  });
}

/**
 * Handles error messages from background script
 */
function handleBackgroundError(message: ShowErrorRuntimeMessage): void {
  showError(message.error);
}

// ============================================================================
// RUNTIME MESSAGE HANDLER
// ============================================================================

/**
 * Enhanced sendMessage function that handles error messages
 */
async function sendMessage<T = unknown>(message: BatchRuntimeMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Type guard to ensure browser.runtime exists
    if (typeof window !== 'undefined' && 'browser' in window && window.browser) {
      window.browser.runtime.sendMessage<T>(message, (response: T) => {
        const lastError = window.browser.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
        } else {
          resolve(response);
        }
      });
    } else {
      reject(new Error('Browser runtime not available'));
    }
  });
}

/**
 * Runtime message listener for error display and other messages
 */
function setupRuntimeMessageListener(): void {
  // Type guard to ensure browser.runtime exists
  if (typeof window !== 'undefined' && 'browser' in window && window.browser) {
    window.browser.runtime.onMessage.addListener(
      (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => {
        // Type guard for BatchRuntimeMessage
        if (typeof message === 'object' && message !== null && 'action' in message) {
          const typedMessage = message as BatchRuntimeMessage;

          // Handle error display messages
          if (typedMessage.action === 'showError') {
            handleBackgroundError(typedMessage as ShowErrorRuntimeMessage);
            sendResponse({ success: true });
            return false;
          }
        }

        return false; // Let other handlers process the message
      }
    );
  }
}

/**
 * Handles kill queue button click
 */
async function handleKillQueueClick(killQueueBtn: HTMLButtonElement): Promise<void> {
  try {
    killQueueBtn.disabled = true;

    const response = await sendMessage<{ success: boolean; message: string }>({
      action: 'clearQueue',
      cancelRunning: true,
    });

    if (response.success) {
      setStatusMessage(killQueueBtn.nextElementSibling as HTMLSpanElement, response.message);
    } else {
      setStatusMessage(killQueueBtn.nextElementSibling as HTMLSpanElement, response.message);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear queue', { error: errorMessage });
    setStatusMessage(killQueueBtn.nextElementSibling as HTMLSpanElement, `Fehler: ${errorMessage}`);
  } finally {
    killQueueBtn.disabled = false;
  }
}

/**
 * Handles clear cache button click
 */
async function handleClearCacheClick(elements: CacheManagementElements): Promise<void> {
  try {
    elements.clearCacheBtn.disabled = true;
    elements.cacheStatusMessage.textContent = 'Cache wird geleert...';

    const response = await sendMessage<{ success: boolean; message: string }>({
      action: 'clearCache',
    });

    if (response.success) {
      elements.cacheStatusMessage.textContent = response.message;
    } else {
      elements.cacheStatusMessage.textContent = response.message;
    }

    // Refresh cache stats after clearing
    await updateCacheStats(elements);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear cache', { error: errorMessage });
    elements.cacheStatusMessage.textContent = `Fehler beim Leeren des Cache: ${errorMessage}`;
  } finally {
    elements.clearCacheBtn.disabled = false;
  }
}

/**
 * Updates cache statistics display
 */
async function updateCacheStats(elements: CacheManagementElements): Promise<void> {
  try {
    const response = await sendMessage<{
      success: boolean;
      totalEntries?: number;
      hitRate?: number;
      message?: string;
    }>({
      action: 'getCacheStats',
    });

    if (response.success && response.totalEntries !== undefined && response.hitRate !== undefined) {
      elements.cacheStats.textContent = `Cache-Einträge: ${response.totalEntries} | Hit-Rate: ${response.hitRate}%`;
    } else {
      elements.cacheStats.textContent = response.message || 'Cache-Statistiken nicht verfügbar';
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get cache stats', { error: errorMessage });
    elements.cacheStats.textContent = 'Fehler beim Laden der Statistiken';
  }
}

/**
 * Checks if provider is configured
 */
async function checkProviderConfigured(): Promise<boolean> {
  try {
    const settings = await messenger.storage.local.get(DEFAULTS);
    const provider = settings.provider;

    if (!provider) {
      return false;
    }

    // Check provider-specific settings
    switch (provider) {
      case 'ollama':
        return !!(settings.ollamaApiUrl && settings.ollamaModel);
      case 'openai':
        return !!settings.openaiApiKey;
      case 'gemini':
        return !!settings.geminiApiKey;
      case 'claude':
        return !!settings.claudeApiKey;
      case 'mistral':
        return !!settings.mistralApiKey;
      case 'deepseek':
        return !!settings.deepseekApiKey;
      case 'zai-paas':
        return !!settings.zaiPaasApiKey;
      case 'zai-coding':
        return !!settings.zaiCodingApiKey;
      default:
        return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to check provider configuration', { error: errorMessage });
    return false;
  }
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Loads custom tags from storage
 */
async function loadCustomTags(): Promise<CustomTags> {
  try {
    const { customTags } = (await messenger.storage.local.get({
      customTags: DEFAULTS.customTags,
    })) as CustomTagsStorage;
    return customTags || DEFAULTS.customTags;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error loading custom tags', { error: errorMessage });
    return DEFAULTS.customTags;
  }
}

/**
 * Saves custom tags to storage
 */
async function saveCustomTags(customTags: CustomTags): Promise<void> {
  try {
    await messenger.storage.local.set({ customTags });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error saving custom tags', { error: errorMessage });
    throw error;
  }
}

/**
 * Opens the tag modal for creating or editing
 */
function openModal(elements: TagManagementElements, context: TagEditContext): void {
  elements.tagForm.reset();
  elements.tagIndex.value = context.index.toString();

  if (context.tag) {
    elements.modalTitle.textContent = 'Edit Tag';
    elements.tagName.value = context.tag.name;
    elements.tagKey.value = context.tag.key;
    elements.tagColor.value = context.tag.color;
    elements.tagPrompt.value = context.tag.prompt || '';
  } else {
    elements.modalTitle.textContent = 'Add New Tag';
  }

  elements.modal.style.display = 'flex';
}

/**
 * Closes the tag modal
 */
function closeModal(elements: TagManagementElements): void {
  elements.modal.style.display = 'none';
}

/**
 * Handles tag list button clicks (edit/delete)
 */
function handleTagListClick(
  elements: TagManagementElements,
  customTags: CustomTags
): TagListClickHandler {
  return (event: MouseEvent): void => {
    const target = event.target;

    if (isButtonWithIndex(target)) {
      const index = parseInt(target.dataset.index, 10);

      if (isNaN(index) || index < 0 || index >= customTags.length) {
        logger.warn('Invalid tag index', { index: target.dataset.index });
        return;
      }

      if (target.classList.contains('edit-tag-btn')) {
        openModal(elements, { tag: customTags[index], index });
      }

      if (target.classList.contains('delete-tag-btn')) {
        const tag = customTags[index];
        if (confirm(`Are you sure you want to delete the "${tag.name}" tag?`)) {
          (customTags as Tag[]).splice(index, 1);
          saveCustomTags(customTags)
            .then(() => renderTagList(elements.tagListContainer, customTags))
            .catch((error) => {
              logger.error('Failed to delete tag', { error });
            });
        }
      }
    }
  };
}

/**
 * Handles tag form submission
 */
async function handleTagFormSubmit(
  elements: TagManagementElements,
  customTags: CustomTags
): Promise<void> {
  const index = parseInt(elements.tagIndex.value, 10);
  const name = elements.tagName.value.trim();
  const key = elements.tagKey.value.trim();
  const color = elements.tagColor.value;
  const prompt = elements.tagPrompt.value.trim();

  // Validate inputs
  if (!name) {
    alert('Fehler: Tag-Name ist erforderlich.');
    return;
  }

  if (!key) {
    alert('Fehler: Tag-Schlüssel ist erforderlich.');
    return;
  }

  if (!isValidTagKey(key)) {
    alert('Fehler: Tag-Schlüssel darf nur Kleinbuchstaben, Zahlen und Unterstriche enthalten.');
    return;
  }

  if (!isValidHexColor(color)) {
    alert('Fehler: Tag-Farbe muss ein gültiger Hex-Farbwert sein (z.B. #FF5722).');
    return;
  }

  if (!prompt) {
    alert('Fehler: Tag-Prompt ist erforderlich.');
    return;
  }

  // Check for duplicate keys (excluding current index for edits)
  const isDuplicate = customTags.some((tag, i) => tag.key === key && i !== index);
  if (isDuplicate) {
    alert('Fehler: Tag-Schlüssel muss eindeutig sein.');
    return;
  }

  const newTag: Tag = { name, key, color, prompt };

  if (index === -1) {
    // Add new tag
    (customTags as Tag[]).push(newTag);
  } else {
    // Update existing tag
    (customTags as Tag[])[index] = newTag;
  }

  try {
    await saveCustomTags(customTags);
    renderTagList(elements.tagListContainer, customTags);
    closeModal(elements);
  } catch (error) {
    alert('Fehler: Tag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.');
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the options page
 */
function initializeOptionsPage(): void {
  try {
    // Setup error display listener first
    setupRuntimeMessageListener();

    const elements = getAllDOMElements();

    // Track custom tags state
    let currentCustomTags: CustomTags = [];

    // Initialize tabs
    initializeTabs(elements.tabs, elements.tabContents);

    // Initialize general settings
    loadGeneralSettings(elements).catch((error) => {
      logger.error('Failed to load general settings on init', { error });
    });

    // General settings form handler
    elements.generalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await handleGeneralSettingsSubmit(elements);

      setStatusMessage(elements.generalStatusMessage, result.message);
      if (result.success) {
        setStatusMessage(elements.statusMessage, 'General settings saved!');
      } else {
        setStatusMessage(elements.statusMessage, result.message);
      }
    });

    // Provider change handler
    elements.providerSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      showRelevantSettings(target.value);
    });

    // Confidence threshold slider synchronization
    if (elements.minConfidenceThresholdSlider && elements.minConfidenceThreshold && elements.confidenceValue) {
      elements.minConfidenceThresholdSlider.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        elements.minConfidenceThreshold!.value = target.value;
        elements.confidenceValue!.textContent = target.value;
      });

      elements.minConfidenceThreshold.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        let value = parseInt(target.value, 10);

        // Clamp value between 0 and 100
        if (isNaN(value)) {
          value = 0;
        } else if (value < 0) {
          value = 0;
        } else if (value > 100) {
          value = 100;
        }

        elements.minConfidenceThresholdSlider!.value = value.toString();
        elements.confidenceValue!.textContent = value.toString();
      });
    }

    // z.ai API key change handler - fetch models when key changes
    if (elements.zaiPaasApiKey) {
      const debouncedPopulateZaiPaasModels = debounce(() => populateZaiModels('zaiPaas'), 500);
      elements.zaiPaasApiKey.addEventListener('input', () => {
        if (elements.zaiPaasApiKey?.value) {
          debouncedPopulateZaiPaasModels();
        }
      });
    }
    if (elements.zaiCodingApiKey) {
      const debouncedPopulateZaiCodingModels = debounce(() => populateZaiModels('zaiCoding'), 500);
      elements.zaiCodingApiKey.addEventListener('input', () => {
        if (elements.zaiCodingApiKey?.value) {
          debouncedPopulateZaiCodingModels();
        }
      });
    }

    // Initialize cache management
    updateCacheStats(elements).catch((error) => {
      logger.error('Failed to initialize cache stats', { error });
    });

    // Cache management event listeners
    elements.clearCacheBtn.addEventListener('click', () => {
      handleClearCacheClick(elements);
    });

    // Kill queue button event listener
    const killQueueBtn = document.getElementById('kill-queue-btn');
    if (killQueueBtn) {
      killQueueBtn.addEventListener('click', () => {
        handleKillQueueClick(killQueueBtn as HTMLButtonElement).catch((error) => {
          logger.error('Failed to handle kill queue click', { error });
        });
      });
    }

    // Load and initialize custom tags
    loadCustomTags()
      .then((tags) => {
        currentCustomTags = tags;
        renderTagList(elements.tagListContainer, currentCustomTags);
      })
      .catch((error) => {
        logger.error('Failed to load custom tags on init', { error });
      });

    // Add new tag button handler
    elements.addNewTagBtn.addEventListener('click', () => {
      openModal(elements, { tag: null, index: -1 });
    });

    // Close modal button handler
    elements.closeModalBtn.addEventListener('click', () => {
      closeModal(elements);
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
      if (e.target === elements.modal) {
        closeModal(elements);
      }
    });

    // Tag list click handler
    elements.tagListContainer.addEventListener(
      'click',
      handleTagListClick(elements, currentCustomTags)
    );

    // Tag form submit handler
    elements.tagForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleTagFormSubmit(elements, currentCustomTags).catch((error) => {
        logger.error('Failed to handle tag form submit', { error });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize options page', { error: errorMessage });
    document.body.innerHTML = `<p style="color: red;">Error initializing options page: ${escapeHtml(errorMessage)}</p>`;
  }
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initializeOptionsPage);

// Clean up resources when page unloads
window.addEventListener('beforeunload', cleanupResources);
