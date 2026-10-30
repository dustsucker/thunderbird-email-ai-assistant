import 'reflect-metadata';

import {
  DEFAULTS,
  Provider,
  ProviderConfig,
  CustomTags,
  Tag,
  isValidProvider,
} from './core/config';
import {
  ErrorSeverity,
  ErrorDisplay,
  ShowErrorRuntimeMessage,
  debounce,
} from './src/infrastructure/providers/ProviderUtils';

import { logger, maskApiKey } from './src/infrastructure/providers/ProviderUtils';
import { fetchZaiModels } from './src/infrastructure/providers';
import type { BaseProviderSettings } from './src/infrastructure/providers/BaseProvider';
import { ClaudeProvider } from './src/infrastructure/providers/impl/ClaudeProvider';
import { DeepseekProvider } from './src/infrastructure/providers/impl/DeepseekProvider';
import { GeminiProvider } from './src/infrastructure/providers/impl/GeminiProvider';
import { MistralProvider } from './src/infrastructure/providers/impl/MistralProvider';
import { OllamaProvider } from './src/infrastructure/providers/impl/OllamaProvider';
import { OpenAIProvider } from './src/infrastructure/providers/impl/OpenAIProvider';
import { OpenRouterProvider } from './src/infrastructure/providers/impl/OpenRouterProvider';
import { ZaiCodingProvider } from './src/infrastructure/providers/impl/ZaiCodingProvider';
import { ZaiPaaSProvider } from './src/infrastructure/providers/impl/ZaiPaaSProvider';
import { Validator } from './src/infrastructure/providers/Validator';
import { DebugTab } from './src/interfaces/options/DebugTab';

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
  ollamaApiUrl: HTMLInputElement | null;
  ollamaModel: HTMLInputElement | null;
  openaiApiKey: HTMLInputElement | null;
  openaiModel: HTMLInputElement | null;
  geminiApiKey: HTMLInputElement | null;
  geminiModel: HTMLInputElement | null;
  claudeApiKey: HTMLInputElement | null;
  claudeModel: HTMLInputElement | null;
  mistralApiKey: HTMLInputElement | null;
  mistralModel: HTMLInputElement | null;
  deepseekApiKey: HTMLInputElement | null;
  deepseekModel: HTMLInputElement | null;
  openrouterApiKey: HTMLInputElement | null;
  openrouterModel: HTMLInputElement | null;
  openrouterDecisionsApiKey: HTMLInputElement | null;
  openrouterDecisionsModel: HTMLInputElement | null;
  openrouterDecisionsThreshold: HTMLInputElement | null;
  zaiPaasApiKey: HTMLInputElement | null;
  zaiPaasModel: HTMLInputElement | null;
  zaiCodingApiKey: HTMLInputElement | null;
  zaiCodingModel: HTMLInputElement | null;
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
  closeModalBtn: HTMLButtonElement;
  addNewTagBtn: HTMLButtonElement;
  tagIndex: HTMLInputElement;
  tagName: HTMLInputElement;
  tagKey: HTMLInputElement;
  tagColor: HTMLInputElement;
  tagPrompt: HTMLTextAreaElement;
  tagThreshold: HTMLInputElement;
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
 * Tag Edit Context
 */
interface TagEditContext {
  tag: Tag | null;
  index: number;
}

/**
 * Settings Save Result
 */
interface SettingsSaveResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Provider Settings Types
// ============================================================================

/**
 * Partial provider config for saving
 */
type PartialProviderConfig = {
  provider: Provider;
  ollamaApiUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  openrouterDecisionsApiKey?: string;
  openrouterDecisionsModel?: string;
  openrouterDecisionsThreshold?: number;
  zaiPaasApiKey?: string;
  zaiPaasModel?: string;
  zaiCodingApiKey?: string;
  zaiCodingModel?: string;
};

// ============================================================================
// Storage Types
// ============================================================================

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
 * Tag list click event handler
 */
type TagListClickHandler = (event: MouseEvent) => void;

// ============================================================================
// Batch Analysis Types
// ============================================================================

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
    case Provider.OLLAMA: {
      if (settings.ollamaApiUrl) {
        // Match patterns must not contain ports (#36): the portless pattern
        // matches any port and is the one declared in optional_host_permissions.
        const url = new URL(settings.ollamaApiUrl);
        return `${url.protocol}//${url.hostname}/*`;
      }
      throw new Error('Ollama API URL is required for permission request');
    }
    case Provider.OPENAI:
      return 'https://api.openai.com/*';
    case Provider.GEMINI:
      return 'https://generativelanguage.googleapis.com/*';
    case Provider.CLAUDE:
      return 'https://api.anthropic.com/*';
    case Provider.MISTRAL:
      return 'https://api.mistral.ai/*';
    case Provider.DEEPSEEK:
      return 'https://api.deepseek.com/*';
    case Provider.OPENROUTER:
      return 'https://openrouter.ai/*';
    case Provider.OPENROUTER_DECISIONS:
      return 'https://openrouter.ai/*';
    case Provider.ZAI_PAAS:
      return 'https://api.z.ai/*';
    case Provider.ZAI_CODING:
      return 'https://api.z.ai/*';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/** Hosts declared in manifest.json (host_permissions + optional_host_permissions). */
const SUPPORTED_PERMISSION_HOSTS = new Set([
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'openrouter.ai',
  'api.z.ai',
  'localhost',
  '127.0.0.1',
]);

/**
 * Checks whether the host of a derived permission origin is declared in the
 * manifest, so we can fail with a clear message instead of a cryptic one.
 */
function isHostSupportedForPermissions(originPattern: string): boolean {
  try {
    return SUPPORTED_PERMISSION_HOSTS.has(new URL(originPattern).hostname);
  } catch {
    return false;
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
  const ollamaApiUrl = getElementById<HTMLInputElement>('ollama-api-url');
  const ollamaModel = getElementById<HTMLInputElement>('ollama-model');
  const openaiApiKey = getElementById<HTMLInputElement>('openai-api-key');
  const openaiModel = getElementById<HTMLInputElement>('openai-model');
  const geminiApiKey = getElementById<HTMLInputElement>('gemini-api-key');
  const geminiModel = getElementById<HTMLInputElement>('gemini-model');
  const claudeApiKey = getElementById<HTMLInputElement>('claude-api-key');
  const claudeModel = getElementById<HTMLInputElement>('claude-model');
  const mistralApiKey = getElementById<HTMLInputElement>('mistral-api-key');
  const mistralModel = getElementById<HTMLInputElement>('mistral-model');
  const deepseekApiKey = getElementById<HTMLInputElement>('deepseek-api-key');
  const deepseekModel = getElementById<HTMLInputElement>('deepseek-model');
  const openrouterApiKey = getElementById<HTMLInputElement>('openrouter-api-key');
  const openrouterModel = getElementById<HTMLInputElement>('openrouter-model');
  const openrouterDecisionsApiKey = getElementById<HTMLInputElement>('openrouter-decisions-api-key');
  const openrouterDecisionsModel = getElementById<HTMLInputElement>('openrouter-decisions-model');
  const openrouterDecisionsThreshold = getElementById<HTMLInputElement>(
    'openrouter-decisions-threshold'
  );
  const zaiPaasApiKey = getElementById<HTMLInputElement>('zaiPaasApiKey');
  const zaiPaasModel = getElementById<HTMLInputElement>('zaiPaasModel');
  const zaiCodingApiKey = getElementById<HTMLInputElement>('zaiCodingApiKey');
  const zaiCodingModel = getElementById<HTMLInputElement>('zaiCodingModel');
  const minConfidenceThreshold = getElementById<HTMLInputElement>('min-confidence-threshold');
  const minConfidenceThresholdSlider = getElementById<HTMLInputElement>(
    'min-confidence-threshold-slider'
  );
  const confidenceValue = getElementById<HTMLSpanElement>('confidence-value');

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
    openaiModel,
    geminiApiKey,
    geminiModel,
    claudeApiKey,
    claudeModel,
    mistralApiKey,
    mistralModel,
    deepseekApiKey,
    deepseekModel,
    openrouterApiKey,
    openrouterModel,
    openrouterDecisionsApiKey,
    openrouterDecisionsModel,
    openrouterDecisionsThreshold,
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
  const closeModalBtn = document.querySelector<HTMLButtonElement>('button.close-button');
  const addNewTagBtn = getElementById<HTMLButtonElement>('add-new-tag-btn');
  const tagIndex = getElementById<HTMLInputElement>('tag-index');
  const tagName = getElementById<HTMLInputElement>('tag-name');
  const tagKey = getElementById<HTMLInputElement>('tag-key');
  const tagColor = getElementById<HTMLInputElement>('tag-color');
  const tagPrompt = getElementById<HTMLTextAreaElement>('tag-prompt');
  const tagThreshold = getElementById<HTMLInputElement>('tag-threshold');

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
    !tagPrompt ||
    !tagThreshold
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
    tagThreshold,
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

    applyActiveTab(tabs, tabContents, clickedTab, targetTabId);
  };
}

/**
 * Applies the active state of a tab and syncs aria-selected + roving tabindex.
 */
function applyActiveTab(
  tabs: NodeListOf<HTMLButtonElement>,
  tabContents: NodeListOf<HTMLDivElement>,
  activeTab: HTMLButtonElement,
  targetTabId: string
): void {
  tabs.forEach((tab) => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', String(tab === activeTab));
    // Roving tabindex: only the active tab is reachable via Tab key (#19)
    tab.tabIndex = tab === activeTab ? 0 : -1;
  });
  activeTab.classList.add('active');

  tabContents.forEach((content) => content.classList.remove('active'));

  const targetContent = document.getElementById(targetTabId);
  if (targetContent) {
    targetContent.classList.add('active');
  } else {
    logger.warn('Target tab content not found', { tabId: targetTabId });
  }

  // Debug tab polls only while visible
  debugTab.onTabVisibilityChanged(targetTabId === 'debug');
}

/**
 * Arrow-key navigation for the tablist (#19): Left/Right move cyclically,
 * Home/End jump to the first/last tab and activate it.
 */
function handleTabKeydown(tabs: NodeListOf<HTMLButtonElement>): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    const tabArray = Array.from(tabs);
    const currentIndex = tabArray.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) {
      return;
    }

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabArray.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabArray.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabArray[nextIndex];
    if (!nextTab || !nextTab.dataset.tab) {
      return;
    }
    nextTab.focus();
    applyActiveTab(tabs, document.querySelectorAll('.tab-content'), nextTab, nextTab.dataset.tab);
  };
}

/**
 * Debug tab instance (live entry wiring; no DI container here)
 */
const debugTab = new DebugTab();

/**
 * Initializes tab functionality
 */
export function initializeTabs(
  tabs: NodeListOf<HTMLButtonElement>,
  tabContents: NodeListOf<HTMLDivElement>
): void {
  tabs.forEach((tab) => {
    tab.addEventListener('click', handleTabClick(tabs, tabContents));
    tab.addEventListener('keydown', handleTabKeydown(tabs));
    // Roving tabindex initial state
    tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
  });
}

// ============================================================================
// General Settings Functions
// ============================================================================

/**
 * Shows/hides provider-specific settings based on selected provider
 */
function showRelevantSettings(provider: string): void {
  logger.debug('[DEBUG-options] showRelevantSettings() called', { provider });

  // Pflichtfelder werden nicht mehr pauschal gesetzt: die Pruefung passiert in
  // validateProviderPanel() ueber data-validate (siehe #7).
  document.querySelectorAll<HTMLElement>('.provider-settings').forEach((div) => {
    div.style.display = 'none';
  });

  const settingsToShow = document.getElementById(`${provider}-settings`);
  if (settingsToShow && isProviderSettingsElement(settingsToShow)) {
    logger.debug('[DEBUG-options] Showing settings for provider', { provider });
    settingsToShow.style.display = 'block';
  } else {
    logger.warn('[DEBUG-options] No settings found for provider', { provider });
  }
}

/**
 * Loads general settings from storage and populates form fields
 */
async function loadGeneralSettings(elements: GeneralSettingsElements): Promise<void> {
  logger.debug('[DEBUG-options] loadGeneralSettings() called');

  try {
    const data = (await messenger.storage.local.get({
      appConfig: { defaultProvider: DEFAULTS.provider },
      providerSettings: {},
    })) as AppSettingsStorage;

    const appConfig = data.appConfig || {};
    const providerSettings = data.providerSettings || {};

    logger.debug('[DEBUG-options] Storage loaded', {
      appConfig,
      providerSettings,
    });

    elements.providerSelect.value = appConfig.defaultProvider || DEFAULTS.provider;

    // Load min confidence threshold
    const minConfidenceThreshold =
      appConfig.minConfidenceThreshold ?? DEFAULTS.minConfidenceThreshold;
    if (elements.minConfidenceThreshold) {
      elements.minConfidenceThreshold.value = minConfidenceThreshold.toString();
    }
    if (elements.minConfidenceThresholdSlider) {
      elements.minConfidenceThresholdSlider.value = minConfidenceThreshold.toString();
    }
    if (elements.confidenceValue) {
      elements.confidenceValue.textContent = minConfidenceThreshold.toString();
    }
    logger.debug('[DEBUG-options] Loaded minConfidenceThreshold', {
      threshold: minConfidenceThreshold,
    });

    if (elements.ollamaApiUrl && providerSettings.ollama) {
      logger.debug('[DEBUG-options] Loaded ollama settings', {
        apiUrl: providerSettings.ollama.apiUrl,
        model: providerSettings.ollama.model,
      });
      elements.ollamaApiUrl.value = providerSettings.ollama.apiUrl || '';
    }
    if (elements.ollamaModel && providerSettings.ollama) {
      elements.ollamaModel.value = providerSettings.ollama.model || '';
    }
    if (elements.openaiApiKey && providerSettings.openai) {
      logger.debug('[DEBUG-options] Loaded openai settings', {
        apiKey: providerSettings.openai.apiKey ? '***REDACTED***' : '',
      });
      elements.openaiApiKey.value = providerSettings.openai.apiKey || '';
    }
    if (elements.openaiModel && providerSettings.openai) {
      elements.openaiModel.value = providerSettings.openai.model || '';
    }
    if (elements.geminiApiKey && providerSettings.gemini) {
      logger.debug('[DEBUG-options] Loaded gemini settings', {
        apiKey: providerSettings.gemini.apiKey ? '***REDACTED***' : '',
      });
      elements.geminiApiKey.value = providerSettings.gemini.apiKey || '';
    }
    if (elements.geminiModel && providerSettings.gemini) {
      elements.geminiModel.value = providerSettings.gemini.model || '';
    }
    if (elements.claudeApiKey && providerSettings.claude) {
      logger.debug('[DEBUG-options] Loaded claude settings', {
        apiKey: providerSettings.claude.apiKey ? '***REDACTED***' : '',
      });
      elements.claudeApiKey.value = providerSettings.claude.apiKey || '';
    }
    if (elements.claudeModel && providerSettings.claude) {
      elements.claudeModel.value = providerSettings.claude.model || '';
    }
    if (elements.mistralApiKey && providerSettings.mistral) {
      logger.debug('[DEBUG-options] Loaded mistral settings', {
        apiKey: providerSettings.mistral.apiKey ? '***REDACTED***' : '',
      });
      elements.mistralApiKey.value = providerSettings.mistral.apiKey || '';
    }
    if (elements.mistralModel && providerSettings.mistral) {
      elements.mistralModel.value = providerSettings.mistral.model || '';
    }
    if (elements.deepseekApiKey && providerSettings.deepseek) {
      logger.debug('[DEBUG-options] Loaded deepseek settings', {
        apiKey: providerSettings.deepseek.apiKey ? '***REDACTED***' : '',
      });
      elements.deepseekApiKey.value = providerSettings.deepseek.apiKey || '';
    }
    if (elements.deepseekModel && providerSettings.deepseek) {
      elements.deepseekModel.value = providerSettings.deepseek.model || '';
    }
    if (elements.openrouterApiKey && providerSettings.openrouter) {
      logger.debug('[DEBUG-options] Loaded openrouter settings', {
        apiKey: providerSettings.openrouter.apiKey ? '***REDACTED***' : '',
      });
      elements.openrouterApiKey.value = providerSettings.openrouter.apiKey || '';
    }
    if (elements.openrouterModel && providerSettings.openrouter) {
      elements.openrouterModel.value = providerSettings.openrouter.model || '';
    }
    if (elements.openrouterDecisionsApiKey && providerSettings['openrouter-decisions']) {
      logger.info('[DEBUG-options] Loaded openrouter-decisions settings', {
        apiKey: providerSettings['openrouter-decisions'].apiKey ? '***REDACTED***' : '',
      });
      elements.openrouterDecisionsApiKey.value =
        providerSettings['openrouter-decisions'].apiKey || '';
    }
    if (elements.openrouterDecisionsModel && providerSettings['openrouter-decisions']) {
      elements.openrouterDecisionsModel.value =
        providerSettings['openrouter-decisions'].model || '';
    }
    if (elements.openrouterDecisionsThreshold && providerSettings['openrouter-decisions']) {
      const storedDecisions = providerSettings['openrouter-decisions'] as {
        additionalConfig?: Record<string, unknown>;
      };
      const tagThreshold = storedDecisions.additionalConfig?.tagThreshold;
      if (typeof tagThreshold === 'number') {
        elements.openrouterDecisionsThreshold.value = tagThreshold.toString();
      }
    }
    if (elements.zaiPaasApiKey && providerSettings['zai-paas']) {
      logger.debug('[DEBUG-options] Loaded zai-paas settings', {
        apiKey: providerSettings['zai-paas'].apiKey ? '***REDACTED***' : '',
        model: providerSettings['zai-paas'].model,
      });
      elements.zaiPaasApiKey.value = providerSettings['zai-paas'].apiKey || '';
    }
    if (elements.zaiPaasModel && providerSettings['zai-paas']) {
      elements.zaiPaasModel.value = providerSettings['zai-paas'].model || '';
    }
    if (elements.zaiCodingApiKey && providerSettings['zai-coding']) {
      logger.debug('[DEBUG-options] Loaded zai-coding settings', {
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
      logger.debug('[DEBUG-options] Populating zaiPaas models on load');
      populateZaiModels('zaiPaas').catch((error) => {
        logger.error('Failed to populate z.ai PaaS models on load', { error });
      });
    }
    if (elements.zaiCodingApiKey && elements.zaiCodingApiKey.value) {
      logger.debug('[DEBUG-options] Populating zaiCoding models on load');
      populateZaiModels('zaiCoding').catch((error) => {
        logger.error('Failed to populate z.ai Coding models on load', { error });
      });
    }

    logger.debug('[DEBUG-options] loadGeneralSettings() completed');
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
  logger.debug('[DEBUG-options] gatherProviderSettings() called', { provider });

  const baseSettings: PartialProviderConfig = { provider: provider as Provider };

  switch (provider) {
    case Provider.OLLAMA: {
      if (!elements.ollamaApiUrl || !elements.ollamaModel) {
        throw new Error('Ollama settings elements not found');
      }
      const ollamaSettings = {
        ...baseSettings,
        ollamaApiUrl: elements.ollamaApiUrl.value.trim(),
        ollamaModel: elements.ollamaModel.value.trim(),
      };
      logger.debug('[DEBUG-options] Gathered ollama settings', {
        apiUrl: ollamaSettings.ollamaApiUrl,
        model: ollamaSettings.ollamaModel,
      });
      return ollamaSettings;
    }

    case Provider.OPENAI: {
      if (!elements.openaiApiKey) {
        throw new Error('OpenAI settings element not found');
      }
      const openaiSettings = {
        ...baseSettings,
        openaiApiKey: elements.openaiApiKey.value.trim(),
        openaiModel: elements.openaiModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered openai settings', {
        apiKey: openaiSettings.openaiApiKey ? '***REDACTED***' : '',
      });
      return openaiSettings;
    }

    case Provider.GEMINI: {
      if (!elements.geminiApiKey) {
        throw new Error('Gemini settings element not found');
      }
      const geminiSettings = {
        ...baseSettings,
        geminiApiKey: elements.geminiApiKey.value.trim(),
        geminiModel: elements.geminiModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered gemini settings', {
        apiKey: geminiSettings.geminiApiKey ? '***REDACTED***' : '',
      });
      return geminiSettings;
    }

    case Provider.CLAUDE: {
      if (!elements.claudeApiKey) {
        throw new Error('Claude settings element not found');
      }
      const claudeSettings = {
        ...baseSettings,
        claudeApiKey: elements.claudeApiKey.value.trim(),
        claudeModel: elements.claudeModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered claude settings', {
        apiKey: claudeSettings.claudeApiKey ? '***REDACTED***' : '',
      });
      return claudeSettings;
    }

    case Provider.MISTRAL: {
      if (!elements.mistralApiKey) {
        throw new Error('Mistral settings element not found');
      }
      const mistralSettings = {
        ...baseSettings,
        mistralApiKey: elements.mistralApiKey.value.trim(),
        mistralModel: elements.mistralModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered mistral settings', {
        apiKey: mistralSettings.mistralApiKey ? '***REDACTED***' : '',
      });
      return mistralSettings;
    }

    case Provider.DEEPSEEK: {
      if (!elements.deepseekApiKey) {
        throw new Error('DeepSeek settings element not found');
      }
      const deepseekSettings = {
        ...baseSettings,
        deepseekApiKey: elements.deepseekApiKey.value.trim(),
        deepseekModel: elements.deepseekModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered deepseek settings', {
        apiKey: deepseekSettings.deepseekApiKey ? '***REDACTED***' : '',
      });
      return deepseekSettings;
    }

    case Provider.OPENROUTER: {
      if (!elements.openrouterApiKey) {
        throw new Error('OpenRouter settings element not found');
      }
      const openrouterSettings = {
        ...baseSettings,
        openrouterApiKey: elements.openrouterApiKey.value.trim(),
        openrouterModel: elements.openrouterModel?.value.trim() || '',
      };
      logger.debug('[DEBUG-options] Gathered openrouter settings', {
        apiKey: openrouterSettings.openrouterApiKey ? '***REDACTED***' : '',
        model: openrouterSettings.openrouterModel,
      });
      return openrouterSettings;
    }

    case Provider.OPENROUTER_DECISIONS: {
      if (!elements.openrouterDecisionsApiKey) {
        throw new Error('OpenRouter Decisions settings element not found');
      }
      // trim() first: Number('') === 0 would persist 0 ("accept everything") on a
      // cleared field instead of the default.
      const rawThresholdInput = elements.openrouterDecisionsThreshold?.value.trim() ?? '';
      const rawThreshold = Number(rawThresholdInput);
      const decisionsSettings = {
        ...baseSettings,
        openrouterDecisionsApiKey: elements.openrouterDecisionsApiKey.value.trim(),
        openrouterDecisionsModel: elements.openrouterDecisionsModel?.value.trim() || '',
        openrouterDecisionsThreshold:
          rawThresholdInput !== '' &&
          Number.isFinite(rawThreshold) &&
          rawThreshold >= 0 &&
          rawThreshold <= 1
            ? rawThreshold
            : 0.6,
      };
      logger.info('[DEBUG-options] Gathered openrouter-decisions settings', {
        apiKey: decisionsSettings.openrouterDecisionsApiKey ? '***REDACTED***' : '',
        model: decisionsSettings.openrouterDecisionsModel,
        tagThreshold: decisionsSettings.openrouterDecisionsThreshold,
      });
      return decisionsSettings;
    }

    case Provider.ZAI_PAAS: {
      if (!elements.zaiPaasApiKey || !elements.zaiPaasModel) {
        throw new Error('Zai PaaS settings element not found');
      }
      const zaiPaasSettings = {
        ...baseSettings,
        zaiPaasApiKey: elements.zaiPaasApiKey.value.trim(),
        zaiPaasModel: elements.zaiPaasModel.value,
      };
      logger.debug('[DEBUG-options] Gathered zai-paas settings', {
        apiKey: zaiPaasSettings.zaiPaasApiKey ? '***REDACTED***' : '',
        model: zaiPaasSettings.zaiPaasModel,
      });
      return zaiPaasSettings;
    }

    case Provider.ZAI_CODING: {
      if (!elements.zaiCodingApiKey || !elements.zaiCodingModel) {
        throw new Error('Zai Coding settings element not found');
      }
      const zaiCodingSettings = {
        ...baseSettings,
        zaiCodingApiKey: elements.zaiCodingApiKey.value.trim(),
        zaiCodingModel: elements.zaiCodingModel.value,
      };
      logger.debug('[DEBUG-options] Gathered zai-coding settings', {
        apiKey: zaiCodingSettings.zaiCodingApiKey ? '***REDACTED***' : '',
        model: zaiCodingSettings.zaiCodingModel,
      });
      return zaiCodingSettings;
    }

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

  logger.debug('[DEBUG-options] handleGeneralSettingsSubmit() called', { provider });

  if (!isValidProvider(provider)) {
    logger.warn('[DEBUG-options] Ungültiger Provider ausgewählt', { provider });
    return {
      success: false,
      message: 'Ungültiger Provider ausgewählt.',
    };
  }

  const settingsToSave = gatherProviderSettings(provider, elements);
  logger.debug('[DEBUG-options] Gathered settings', { settingsToSave });

  // Issue #36: the Ollama URL receives mail content — only local endpoints
  // are acceptable. Reject clearly instead of saving a remote exfiltration target.
  if (
    provider === Provider.OLLAMA &&
    !Validator.validateApiUrl(settingsToSave.ollamaApiUrl ?? '')
  ) {
    logger.warn('[DEBUG-options] Invalid Ollama URL rejected', {
      apiUrl: settingsToSave.ollamaApiUrl,
    });
    return {
      success: false,
      message:
        'Ungültige Ollama-URL. Erlaubt sind nur http(s)://localhost oder http(s)://127.0.0.1 ' +
        '(mit beliebigem Port).',
    };
  }

  let permissionGranted = true;

  try {
    const permissionOrigin = getPermissionOrigin(provider as Provider, settingsToSave);
    const hasSettings = Object.values(settingsToSave).some((val) => val && val !== '');

    if (hasSettings) {
      // N5: fail with a clear message when the derived host is not declared in
      // the manifest (e.g. Ollama on a LAN address), instead of letting the
      // permissions.request rejection surface as a cryptic generic error.
      if (!isHostSupportedForPermissions(permissionOrigin)) {
        logger.warn('[DEBUG-options] Unsupported permission host', {
          origin: permissionOrigin,
        });
        return {
          success: false,
          message:
            'Host wird nicht unterstützt. Unterstützt werden: localhost/127.0.0.1 (Ollama) ' +
            'sowie die konfigurierten Cloud-Provider-Ursprünge.',
        };
      }

      try {
        logger.debug('[DEBUG-options] Requesting permission for origin', {
          origin: permissionOrigin,
        });
        permissionGranted = await messenger.permissions.request({
          origins: [permissionOrigin],
        });
        logger.debug('[DEBUG-options] Permission result', {
          granted: permissionGranted,
          origin: permissionOrigin,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('[DEBUG-options] Error requesting permission', { error: errorMessage });
        return {
          success: false,
          message: 'Fehler bei der Berechtigungsanfrage.',
        };
      }
    } else {
      logger.debug('[DEBUG-options] No settings to save, skipping permission request');
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
          logger.debug('[DEBUG-options] Saving minConfidenceThreshold', {
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

      logger.debug('[DEBUG-options] Saving to storage', {
        appConfig: existingAppConfig,
        providerSettings,
      });

      await messenger.storage.local.set({
        appConfig: existingAppConfig,
        providerSettings,
      });

      logger.debug('[DEBUG-options] Einstellungen erfolgreich gespeichert');

      return {
        success: true,
        message: 'Einstellungen gespeichert.',
      };
    } else {
      logger.warn('[DEBUG-options] Zugriff verweigert, Einstellungen nicht gespeichert');
      return {
        success: false,
        message: 'Zugriff verweigert. Einstellungen wurden nicht gespeichert.',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[DEBUG-options] Save failed', { error: errorMessage });
    return {
      success: false,
      message: 'Fehler beim Speichern der Einstellungen.',
    };
  }
}

function convertToProviderSettings(settings: PartialProviderConfig) {
  logger.debug('[DEBUG-options] convertToProviderSettings() called', {
    provider: settings.provider,
    input: settings,
  });

  let result: {
    apiKey: string;
    model: string;
    apiUrl?: string;
    additionalConfig?: Record<string, unknown>;
  };

  switch (settings.provider) {
    case Provider.OLLAMA:
      result = {
        apiKey: '',
        model: settings.ollamaModel || '',
        apiUrl: settings.ollamaApiUrl || '',
      };
      logger.debug('[DEBUG-options] Converted ollama settings', { result });
      return result;

    case Provider.OPENAI:
      result = {
        apiKey: settings.openaiApiKey || '',
        model: settings.openaiModel || '',
      };
      logger.debug('[DEBUG-options] Converted openai settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.GEMINI:
      result = {
        apiKey: settings.geminiApiKey || '',
        model: settings.geminiModel || '',
      };
      logger.debug('[DEBUG-options] Converted gemini settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.CLAUDE:
      result = {
        apiKey: settings.claudeApiKey || '',
        model: settings.claudeModel || '',
      };
      logger.debug('[DEBUG-options] Converted claude settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.MISTRAL:
      result = {
        apiKey: settings.mistralApiKey || '',
        model: settings.mistralModel || '',
      };
      logger.debug('[DEBUG-options] Converted mistral settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.DEEPSEEK:
      result = {
        apiKey: settings.deepseekApiKey || '',
        model: settings.deepseekModel || '',
      };
      logger.debug('[DEBUG-options] Converted deepseek settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.OPENROUTER:
      result = {
        apiKey: settings.openrouterApiKey || '',
        model: settings.openrouterModel || '',
      };
      logger.debug('[DEBUG-options] Converted openrouter settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
      });
      return result;

    case Provider.OPENROUTER_DECISIONS:
      result = {
        apiKey: settings.openrouterDecisionsApiKey || '',
        model: settings.openrouterDecisionsModel || 'typesafe/jev-1.14',
        apiUrl: 'https://openrouter.ai/api/alpha/decisions',
        additionalConfig: { tagThreshold: settings.openrouterDecisionsThreshold ?? 0.6 },
      };
      logger.info('[DEBUG-options] Converted openrouter-decisions settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
        additionalConfig: result.additionalConfig,
      });
      return result;

    case Provider.ZAI_PAAS:
      result = {
        apiKey: settings.zaiPaasApiKey || '',
        model: settings.zaiPaasModel || '',
        apiUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
      };
      logger.debug('[DEBUG-options] Converted zai-paas settings', {
        apiKey: result.apiKey ? '***REDACTED***' : '',
        model: result.model,
        apiUrl: result.apiUrl,
      });
      return result;

    case Provider.ZAI_CODING:
      result = {
        apiKey: settings.zaiCodingApiKey || '',
        model: settings.zaiCodingModel || '',
        apiUrl: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
      };
      logger.debug('[DEBUG-options] Converted zai-coding settings', {
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
 * Pending auto-clear timers, so a message never disappears under a newer one.
 */
const statusTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Sets a status message. Success messages clear themselves after 3 s,
 * errors stay until the next message (see #8).
 */
function setStatusMessage(
  element: HTMLSpanElement,
  message: string,
  kind: 'success' | 'error' = 'success'
): void {
  const pending = statusTimers.get(element);
  if (pending !== undefined) {
    clearTimeout(pending);
    statusTimers.delete(element);
  }

  element.textContent = message;
  element.classList.toggle('status-error', kind === 'error');

  if (kind === 'error') {
    return;
  }

  statusTimers.set(
    element,
    setTimeout(() => {
      element.textContent = '';
    }, 3000)
  );
}

/**
 * Writes or clears the inline error text below a field (replaces the native bubble).
 */
function showFieldError(field: HTMLInputElement, message: string): void {
  const group = field.closest('.form-group');
  if (!group) {
    return;
  }

  if (!message) {
    group.querySelector('.field-error')?.remove();
    field.removeAttribute('aria-invalid');
    if (field.dataset.baseDescribedBy !== undefined) {
      if (field.dataset.baseDescribedBy) {
        field.setAttribute('aria-describedby', field.dataset.baseDescribedBy);
      } else {
        field.removeAttribute('aria-describedby');
      }
    }
    return;
  }

  let errorElement = group.querySelector<HTMLParagraphElement>('.field-error');
  if (!errorElement) {
    errorElement = document.createElement('p');
    errorElement.className = 'field-error';
    errorElement.id = `${field.id}-error`;
    group.appendChild(errorElement);
  }
  errorElement.textContent = message;

  field.dataset.baseDescribedBy ??= field.getAttribute('aria-describedby') ?? '';
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute(
    'aria-describedby',
    [field.dataset.baseDescribedBy, errorElement.id].filter(Boolean).join(' ')
  );
}

/**
 * Validates the visible provider panel against the data-validate rules in the markup.
 *
 * @returns true when every field of the panel is valid
 */
function validateProviderPanel(panel: HTMLElement): boolean {
  let valid = true;

  panel.querySelectorAll<HTMLInputElement>('input[data-validate]').forEach((field) => {
    const value = field.value.trim();
    const rule = field.dataset.validate;
    let error = '';

    if (rule === 'api-key') {
      error =
        value === ''
          ? 'API-Schlüssel erforderlich.'
          : value.length < 10
            ? 'Mindestens 10 Zeichen.'
            : '';
    } else if (rule === 'url') {
      error = /^https?:\/\/.+/.test(value)
        ? ''
        : 'Bitte eine gültige URL angeben (http:// oder https://).';
    } else if (rule === 'required') {
      error = value === '' ? 'Pflichtfeld.' : '';
    }

    showFieldError(field, error);
    if (error) {
      valid = false;
    }
  });

  return valid;
}

/**
 * Shows or hides the value of a masked API key field.
 */
function toggleKeyVisibility(button: HTMLButtonElement): void {
  const input = getElementById<HTMLInputElement>(button.getAttribute('aria-controls') ?? '');
  if (!input) {
    return;
  }

  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.textContent = show ? 'Verbergen' : 'Anzeigen';
}

/**
 * Logger for directly instantiated providers: ProviderUtils.logger lacks the
 * maskApiKey the ILogger interface requires.
 */
const providerLogger = { ...logger, maskApiKey };

/**
 * Resolves the provider class used for the connection test.
 *
 * Same classes the background uses (see ProviderFactory), instantiated directly
 * like fetchZaiModels() does — no second HTTP path.
 */
function createProviderForConnectionTest(provider: string): {
  listModels(settings: BaseProviderSettings): Promise<string[]>;
} {
  switch (provider) {
    case Provider.OLLAMA:
      return new OllamaProvider(providerLogger);
    case Provider.MISTRAL:
      return new MistralProvider(providerLogger);
    case Provider.GEMINI:
      return new GeminiProvider(providerLogger);
    case Provider.DEEPSEEK:
      return new DeepseekProvider(providerLogger);
    case Provider.OPENROUTER:
      return new OpenRouterProvider(providerLogger);
    case Provider.OPENROUTER_DECISIONS:
      // Decisions provider has no listModels of its own; the connection test
      // validates the shared OpenRouter API host + key via the standard provider.
      return new OpenRouterProvider(providerLogger);
    case Provider.OPENAI:
      return new OpenAIProvider(providerLogger);
    case Provider.CLAUDE:
      return new ClaudeProvider(providerLogger);
    case Provider.ZAI_PAAS:
      return new ZaiPaaSProvider(providerLogger);
    case Provider.ZAI_CODING:
      return new ZaiCodingProvider(providerLogger);
    default:
      throw new Error(`Unbekannter Provider: ${provider}`);
  }
}

/**
 * German wording for the provider error texts (see the Z.ai listModels throws).
 * Raw text follows for unmapped errors so nothing is lost.
 */
const CONNECTION_ERROR_HINTS: ReadonlyArray<[RegExp, string | ((raw: string) => string)]> = [
  [/API key is (missing|required)/, 'API-Schlüssel fehlt.'],
  // Status-carrying texts before the network matcher: "Failed to fetch …: 502" has both.
  [/\b(401|403)\b|unauthori[sz]ed|invalid.*key/i, 'API-Schlüssel ungültig oder abgelaufen.'],
  [/\b\d{3}\b/, (raw) => `Server nicht erreichbar (Status ${raw.match(/\b\d{3}\b/)![0]}).`],
  [/Failed to fetch|NetworkError|network error/i, 'API nicht erreichbar (Netzwerkfehler).'],
  [/Invalid response format/i, 'Unerwartete Antwort vom Anbieter.'],
];

/**
 * Translates a provider error message; unknown texts keep the raw message.
 */
function describeConnectionError(raw: string): string {
  const hint = CONNECTION_ERROR_HINTS.find(([pattern]) => pattern.test(raw))?.[1];
  if (hint === undefined) {
    return `Unbekannter Fehler (${raw}).`;
  }
  return typeof hint === 'function' ? hint(raw) : hint;
}

/**
 * Minimal connection test: asks the provider for its model list (GET /models).
 *
 * Success = at least one model came back, everything else is reported as a
 * readable error instead of a thrown exception.
 */
export async function testProviderConnection(
  provider: string,
  settings: BaseProviderSettings
): Promise<{ ok: boolean; message: string }> {
  try {
    const models = await createProviderForConnectionTest(provider).listModels(settings);

    if (models.length > 0) {
      return { ok: true, message: `Verbindung OK – ${models.length} Modelle verfügbar.` };
    }

    return {
      ok: false,
      message:
        'Verbindung fehlgeschlagen: keine Modelle erhalten. API-Schlüssel, Modell und ' +
        'Erreichbarkeit prüfen (Details im Debug-Protokoll).',
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Verbindung fehlgeschlagen: ${describeConnectionError(raw)}` };
  }
}

/**
 * Runs the connection test for the panel button and writes the inline result.
 */
async function runConnectionTest(
  button: HTMLButtonElement,
  elements: GeneralSettingsElements
): Promise<void> {
  const provider = button.dataset.provider ?? '';
  const resultElement = button.nextElementSibling as HTMLSpanElement | null;

  button.disabled = true;
  if (resultElement) {
    resultElement.className = 'connection-result';
    resultElement.textContent = 'Teste Verbindung…';
  }

  try {
    const settings = convertToProviderSettings(gatherProviderSettings(provider, elements));
    const result = await testProviderConnection(provider, settings);

    if (resultElement) {
      resultElement.textContent = result.message;
      resultElement.classList.add(result.ok ? 'is-ok' : 'is-error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[DEBUG-options] Connection test failed', { provider, error: errorMessage });
    if (resultElement) {
      resultElement.textContent = `Verbindung fehlgeschlagen: ${errorMessage}`;
      resultElement.classList.add('is-error');
    }
  } finally {
    button.disabled = false;
  }
}

/**
 * Shows or clears an inline hint below a Z.ai model field (e.g. when the model
 * list could not be fetched and only the saved/static suggestions remain).
 */
function showZaiModelHint(modelInput: HTMLElement, message: string): void {
  const group = modelInput.closest('.form-group');
  if (!group) {
    return;
  }

  const existing = group.querySelector<HTMLParagraphElement>('.zai-model-hint');
  if (!message) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.textContent = message;
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'field-error zai-model-hint';
  hint.textContent = message;
  group.appendChild(hint);
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

  // The z.ai model field is a text input with a static <datalist>: refresh its
  // suggestions in place instead of wiping the user's current value.
  const listId = zaiModelSelect.getAttribute('list');
  const datalist = listId ? document.getElementById(listId) : null;

  if (!datalist) {
    return;
  }

  try {
    logger.info(`[DEBUG-options] Fetching ${provider} models`);
    const models = await fetchZaiModels(zaiKeyInput.value);

    datalist.innerHTML = '';

    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      datalist.appendChild(option);
    });

    // fetchZaiModels liefert bei nicht erreichbarer API eine Fallback-Liste mit
    // Flag statt zu werfen (#13) – dann weist der Hinweis auf die Liste hin.
    const fetchFailed = (models as { fetchFailed?: boolean }).fetchFailed === true;
    showZaiModelHint(
      zaiModelSelect,
      fetchFailed
        ? 'Modellliste konnte nicht geladen werden – gespeicherte Modelle werden angezeigt.'
        : ''
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to populate ${provider} models`, { error: errorMessage });
    showZaiModelHint(
      zaiModelSelect,
      'Modellliste konnte nicht geladen werden – gespeicherte Modelle werden angezeigt.'
    );
  }
}

// ============================================================================
// Tag Management Functions
// ============================================================================

/**
 * Renders the tag list to the DOM
 */
function renderTagList(
  container: HTMLDivElement,
  customTags: CustomTags,
  globalThreshold: number = DEFAULTS.minConfidenceThreshold
): void {
  container.innerHTML = '';

  customTags.forEach((tag, index) => {
    const item = document.createElement('div');
    item.className = 'tag-item';

    // Determine threshold display
    const hasCustomThreshold = tag.minConfidenceThreshold !== undefined;
    const thresholdDisplay = hasCustomThreshold
      ? `${tag.minConfidenceThreshold}%`
      : `Global (${globalThreshold}%)`;
    const thresholdClass = hasCustomThreshold ? 'tag-threshold-custom' : 'tag-threshold-global';

    item.innerHTML = `
      <div class="tag-color-preview" style="background-color: ${escapeHtml(tag.color)};"></div>
      <div class="tag-details">
        <div class="tag-name">${escapeHtml(tag.name)}</div>
        <div class="tag-key">Schlüssel: ${escapeHtml(tag.key)}</div>
        <div class="tag-prompt">Prompt: ${escapeHtml(tag.prompt || '')}</div>
        <div class="tag-threshold ${thresholdClass}">Schwellwert: ${escapeHtml(thresholdDisplay)}</div>
      </div>
      <div class="tag-actions">
        <button class="edit-tag-btn" data-index="${index}">Bearbeiten</button>
        <button class="delete-tag-btn" data-index="${index}">Löschen</button>
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * Cleans up resources when the page is unloaded
 */
function cleanupResources(): void {
  // Stop debug tab polling on page unload
  debugTab.onTabVisibilityChanged(false);
}

// ============================================================================
// ERROR DISPLAY FUNCTIONALITY
// ============================================================================

/**
 * Returns the static error overlay from options.html (single DOM instance, #18).
 */
function getErrorDisplay(): HTMLDivElement | null {
  return document.getElementById('error-display-overlay') as HTMLDivElement | null;
}

/**
 * Shows an error message to the user
 * @param error - Error information to display
 */
function showError(error: ErrorDisplay): void {
  const overlay = getErrorDisplay();
  if (!overlay) {
    logger.error('Error display overlay not found', { message: error.message });
    return;
  }

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
  const typeTitle = error.type
    ? error.type.charAt(0).toUpperCase() + error.type.slice(1)
    : 'Fehler';
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

  // Kein Auto-Hide mehr (#18): Info/Warnungen bleiben stehen, bis sie
  // geschlossen oder durch die nächste Meldung ersetzt werden.

  logger.info('Error displayed to user', {
    severity: error.severity,
    type: error.type,
    message: error.message,
  });
}

/** Hides the static error overlay. */
function hideErrorDisplay(): void {
  const overlay = getErrorDisplay();
  if (overlay) {
    overlay.style.display = 'none';
  }
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
      reject(new Error('Browser-Laufzeitumgebung nicht verfügbar'));
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
      setStatusMessage(
        killQueueBtn.nextElementSibling as HTMLSpanElement,
        response.message,
        'error'
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear queue', { error: errorMessage });
    setStatusMessage(
      killQueueBtn.nextElementSibling as HTMLSpanElement,
      `Fehler: ${errorMessage}`,
      'error'
    );
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
    setStatusMessage(elements.cacheStatusMessage, 'Cache wird geleert...');

    const response = await sendMessage<{ success: boolean; message: string }>({
      action: 'clearCache',
    });

    setStatusMessage(
      elements.cacheStatusMessage,
      response.message,
      response.success ? 'success' : 'error'
    );

    // Refresh cache stats after clearing
    await updateCacheStats(elements);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear cache', { error: errorMessage });
    setStatusMessage(
      elements.cacheStatusMessage,
      `Fehler beim Leeren des Cache: ${errorMessage}`,
      'error'
    );
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
    // Tags will be created by background script on next startup/initialization
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error saving custom tags', { error: errorMessage });
    throw error;
  }
}

/** Element that opened the modal; regains focus when the dialog closes (#19). */
let modalTrigger: HTMLElement | null = null;

/**
 * Opens the tag modal for creating or editing
 */
function openModal(elements: TagManagementElements, context: TagEditContext): void {
  elements.tagForm.reset();
  elements.tagIndex.value = context.index.toString();

  if (context.tag) {
    elements.modalTitle.textContent = 'Tag bearbeiten';
    elements.tagName.value = context.tag.name;
    elements.tagKey.value = context.tag.key;
    elements.tagColor.value = context.tag.color;
    elements.tagPrompt.value = context.tag.prompt || '';
    // Set threshold value if it exists
    if (context.tag.minConfidenceThreshold !== undefined) {
      elements.tagThreshold.value = context.tag.minConfidenceThreshold.toString();
    }
  } else {
    elements.modalTitle.textContent = 'Neuen Tag hinzufügen';
  }

  modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.modal.style.display = 'flex';
  elements.closeModalBtn.focus();
}

/**
 * Closes the tag modal and restores focus to the trigger
 */
function closeModal(elements: TagManagementElements): void {
  elements.modal.style.display = 'none';
  modalTrigger?.focus();
  modalTrigger = null;
}

/**
 * Keeps Tab focus inside the dialog while it is open (#19).
 */
function trapModalFocus(event: KeyboardEvent, modal: HTMLElement): void {
  const focusable = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);
  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
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
        if (confirm(`Soll der Tag "${tag.name}" wirklich gelöscht werden?`)) {
          (customTags as Tag[]).splice(index, 1);
          saveCustomTags(customTags)
            .then(async () => {
              // Load global threshold for rendering
              const data = await messenger.storage.local.get({
                appConfig: { minConfidenceThreshold: DEFAULTS.minConfidenceThreshold },
              });
              const appConfig = (data as AppSettingsStorage).appConfig || {};
              const globalThreshold =
                appConfig.minConfidenceThreshold ?? DEFAULTS.minConfidenceThreshold;

              renderTagList(elements.tagListContainer, customTags, globalThreshold);
            })
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
  const thresholdValue = elements.tagThreshold.value.trim();

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

  // Validate threshold if provided
  let minConfidenceThreshold: number | undefined = undefined;
  if (thresholdValue) {
    const threshold = parseInt(thresholdValue, 10);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      alert('Fehler: Konfidenz-Schwellenwert muss eine Zahl zwischen 0 und 100 sein.');
      return;
    }
    minConfidenceThreshold = threshold;
  }

  // Check for duplicate keys (excluding current index for edits)
  const isDuplicate = customTags.some((tag, i) => tag.key === key && i !== index);
  if (isDuplicate) {
    alert('Fehler: Tag-Schlüssel muss eindeutig sein.');
    return;
  }

  const newTag: Tag = { name, key, color, prompt, minConfidenceThreshold };

  if (index === -1) {
    // Add new tag
    (customTags as Tag[]).push(newTag);
  } else {
    // Update existing tag
    (customTags as Tag[])[index] = newTag;
  }

  try {
    await saveCustomTags(customTags);

    // Load global threshold for rendering
    const data = await messenger.storage.local.get({
      appConfig: { minConfidenceThreshold: DEFAULTS.minConfidenceThreshold },
    });
    const appConfig = (data as AppSettingsStorage).appConfig || {};
    const globalThreshold = appConfig.minConfidenceThreshold ?? DEFAULTS.minConfidenceThreshold;

    renderTagList(elements.tagListContainer, customTags, globalThreshold);
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

    // Initialize debug tab (polling starts when the tab becomes visible)
    debugTab.render();

    // Initialize general settings
    loadGeneralSettings(elements).catch((error) => {
      logger.error('Failed to load general settings on init', { error });
    });

    // Dirty-Tracking (#17): ungespeicherte Änderungen warnen vor dem Schließen
    let providerFormDirty = false;
    const markProviderFormDirty = (): void => {
      providerFormDirty = true;
    };
    elements.generalForm.addEventListener('input', markProviderFormDirty);
    elements.providerSelect.addEventListener('change', markProviderFormDirty);

    window.addEventListener('beforeunload', (event) => {
      if (providerFormDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    // General settings form handler
    const submitButton = elements.generalForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    elements.generalForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const activePanel = document.getElementById(`${elements.providerSelect.value}-settings`);
      if (activePanel && !validateProviderPanel(activePanel)) {
        activePanel.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        setStatusMessage(
          elements.generalStatusMessage,
          'Bitte die markierten Felder korrigieren.',
          'error'
        );
        return;
      }

      // Busy state (#17): speichern kann Permissions-Dialog und Netzwerk umfassen
      const originalLabel = submitButton?.textContent ?? '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Wird gespeichert…';
      }

      try {
        const result = await handleGeneralSettingsSubmit(elements);

        if (result.success) {
          setStatusMessage(elements.generalStatusMessage, result.message);
          providerFormDirty = false;
        } else {
          setStatusMessage(elements.generalStatusMessage, result.message, 'error');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalLabel;
        }
      }
    });

    // Provider change handler
    elements.providerSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      showRelevantSettings(target.value);
    });

    // Show/Hide der API-Keys und Verbindungstest pro Provider
    elements.generalForm.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const toggle = target.closest<HTMLButtonElement>('.key-toggle');
      if (toggle) {
        toggleKeyVisibility(toggle);
        return;
      }

      const testButton = target.closest<HTMLButtonElement>('.test-connection');
      if (testButton) {
        runConnectionTest(testButton, elements).catch((error) => {
          logger.error('Failed to test provider connection', { error });
        });
      }
    });

    elements.generalForm.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.validate) {
        showFieldError(target, '');
      }
    });

    // Confidence threshold slider synchronization
    if (
      elements.minConfidenceThresholdSlider &&
      elements.minConfidenceThreshold &&
      elements.confidenceValue
    ) {
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

    // Load global threshold and custom tags
    Promise.all([
      loadCustomTags(),
      messenger.storage.local.get({
        appConfig: { minConfidenceThreshold: DEFAULTS.minConfidenceThreshold },
      }),
    ])
      .then(([tags, data]) => {
        const appConfig = (data as AppSettingsStorage).appConfig || {};
        const globalThreshold = appConfig.minConfidenceThreshold ?? DEFAULTS.minConfidenceThreshold;

        currentCustomTags = tags;
        renderTagList(elements.tagListContainer, currentCustomTags, globalThreshold);
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

    // Dialog keyboard support (#19): Escape closes, Tab stays inside
    document.addEventListener('keydown', (e) => {
      if (elements.modal.style.display === 'none') {
        return;
      }
      if (e.key === 'Escape') {
        closeModal(elements);
      } else if (e.key === 'Tab') {
        trapModalFocus(e, elements.modal);
      }
    });

    // Static error overlay close button (#18)
    const errorCloseBtn = document.querySelector<HTMLButtonElement>('.error-display-close');
    errorCloseBtn?.addEventListener('click', hideErrorDisplay);

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

    // Save custom tags button handler
    const saveCustomTagsBtn = document.getElementById('save-custom-tags-btn');
    const customTagsStatusMessage = document.getElementById('custom-tags-status-message');
    if (saveCustomTagsBtn && customTagsStatusMessage) {
      saveCustomTagsBtn.addEventListener('click', async () => {
        try {
          await saveCustomTags(currentCustomTags);
          setStatusMessage(customTagsStatusMessage as HTMLSpanElement, 'Tags gespeichert!');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to save custom tags', { error: errorMessage });
          setStatusMessage(
            customTagsStatusMessage as HTMLSpanElement,
            `Fehler: ${errorMessage}`,
            'error'
          );
        }
      });
    }

    // Manual review: no save handler anymore (#10) – the tab shows an honest
    // empty state until analysis results land here (future feature).
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize options page', { error: errorMessage });
    document.body.innerHTML = `<p style="color: red;">Fehler beim Initialisieren der Einstellungsseite: ${escapeHtml(errorMessage)}</p>`;
  }
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initializeOptionsPage);

// Clean up resources when page unloads
window.addEventListener('beforeunload', cleanupResources);
