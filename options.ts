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
  ErrorType,
  ErrorDisplay,
  ShowErrorRuntimeMessage,
  debounce,
} from './providers/utils';

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
import { logger } from './providers/utils';
import { fetchZaiModels } from './providers/zai';

declare const messenger: {
  storage: {
    local: {
      get(
        keys: Partial<ProviderConfig> | { customTags?: CustomTags }
      ): Promise<Partial<ProviderConfig> & { customTags?: CustomTags }>;
      set(items: Partial<ProviderConfig> & { customTags?: CustomTags }): Promise<void>;
    };
  };
  runtime: {
    reload(): void;
  };
  permissions: {
    request(permissions: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  };
};

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
  zaiApiKey: HTMLInputElement | null;
  zaiModel: HTMLSelectElement | null;
  zaiVariant: HTMLSelectElement | null;
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
 * Batch Analysis DOM Elements
 */
interface BatchAnalysisElements {
  analyzeAllBtn: HTMLButtonElement;
  cancelAnalysisBtn: HTMLButtonElement;
  killQueueBtn: HTMLButtonElement;
  analyzeProgress: HTMLProgressElement;
  analyzeProgressText: HTMLSpanElement;
  analyzeStatusMessage: HTMLSpanElement;
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
  extends
    GeneralSettingsElements,
    TagManagementElements,
    BatchAnalysisElements,
    CacheManagementElements {
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
  zaiApiKey?: string;
  zaiModel?: string;
  zaiVariant?: 'paas' | 'coding';
  zaiBaseUrl?: string;
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
  zaiApiKey?: string;
  zaiModel?: string;
  zaiVariant?: 'paas' | 'coding';
  zaiBaseUrl?: string;
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
    case Provider.ZAI:
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
  const generalForm = getElementById<HTMLFormElement>('general-options-form');
  const generalStatusMessage = getElementById<HTMLSpanElement>('general-status-message');
  const statusMessage = getElementById<HTMLSpanElement>('general-status-message');
  const ollamaApiUrl = getElementById<HTMLInputElement>('ollama-api-url');
  const ollamaModel = getElementById<HTMLInputElement>('ollama-model');
  const openaiApiKey = getElementById<HTMLInputElement>('openai-api-key');
  const geminiApiKey = getElementById<HTMLInputElement>('gemini-api-key');
  const claudeApiKey = getElementById<HTMLInputElement>('claude-api-key');
  const mistralApiKey = getElementById<HTMLInputElement>('mistral-api-key');
  const deepseekApiKey = getElementById<HTMLInputElement>('deepseek-api-key');
  const zaiApiKey = getElementById<HTMLInputElement>('zai-api-key');
  const zaiModel = getElementById<HTMLSelectElement>('zai-model');
  const zaiVariant = getElementById<HTMLSelectElement>('zai-variant');

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
    zaiApiKey,
    zaiModel,
    zaiVariant,
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

  const analyzeAllBtn = getElementById<HTMLButtonElement>('analyze-all-btn');
  const cancelAnalysisBtn = getElementById<HTMLButtonElement>('cancel-analysis-btn');
  const killQueueBtn = getElementById<HTMLButtonElement>('kill-queue-btn');
  const analyzeProgress = getElementById<HTMLProgressElement>('analyze-progress');
  const analyzeProgressText = getElementById<HTMLSpanElement>('analyze-progress-text');
  const analyzeStatusMessage = getElementById<HTMLSpanElement>('analyze-status-message');

  if (
    !analyzeAllBtn ||
    !cancelAnalysisBtn ||
    !killQueueBtn ||
    !analyzeProgress ||
    !analyzeProgressText ||
    !analyzeStatusMessage
  ) {
    throw new Error('Required batch analysis elements not found');
  }

  const clearCacheBtn = getElementById<HTMLButtonElement>('clear-cache-btn');
  const cacheStatusMessage = getElementById<HTMLSpanElement>('cache-status-message');
  const cacheStats = getElementById<HTMLSpanElement>('cache-stats');

  if (!clearCacheBtn || !cacheStatusMessage || !cacheStats) {
    throw new Error('Required cache management elements not found');
  }

  return {
    ...general,
    ...tag,
    analyzeAllBtn,
    cancelAnalysisBtn,
    killQueueBtn,
    analyzeProgress,
    analyzeProgressText,
    analyzeStatusMessage,
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
  document.querySelectorAll<HTMLElement>('.provider-settings').forEach((div) => {
    div.style.display = 'none';
  });

  const settingsToShow = document.getElementById(`${provider}-settings`);
  if (settingsToShow && isProviderSettingsElement(settingsToShow)) {
    settingsToShow.style.display = 'block';
  }
}

/**
 * Loads general settings from storage and populates form fields
 */
async function loadGeneralSettings(elements: GeneralSettingsElements): Promise<void> {
  try {
    const settings = (await messenger.storage.local.get(DEFAULTS)) as GeneralSettingsStorage;

    elements.providerSelect.value = settings.provider || DEFAULTS.provider;

    if (elements.ollamaApiUrl) {
      elements.ollamaApiUrl.value = settings.ollamaApiUrl || '';
    }
    if (elements.ollamaModel) {
      elements.ollamaModel.value = settings.ollamaModel || '';
    }
    if (elements.openaiApiKey) {
      elements.openaiApiKey.value = settings.openaiApiKey || '';
    }
    if (elements.geminiApiKey) {
      elements.geminiApiKey.value = settings.geminiApiKey || '';
    }
    if (elements.claudeApiKey) {
      elements.claudeApiKey.value = settings.claudeApiKey || '';
    }
    if (elements.mistralApiKey) {
      elements.mistralApiKey.value = settings.mistralApiKey || '';
    }
    if (elements.deepseekApiKey) {
      elements.deepseekApiKey.value = settings.deepseekApiKey || '';
    }
    if (elements.zaiApiKey) elements.zaiApiKey.value = settings.zaiApiKey || '';
    if (elements.zaiModel) elements.zaiModel.value = settings.zaiModel || 'glm-4.5';
    if (elements.zaiVariant) elements.zaiVariant.value = settings.zaiVariant || 'paas';

    showRelevantSettings(settings.provider || DEFAULTS.provider);

    // Populate z.ai models if API key is present
    if (elements.zaiApiKey && elements.zaiApiKey.value) {
      populateZaiModels().catch((error) => {
        logger.error('Failed to populate z.ai models on load', { error });
      });
    }
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
  const baseSettings: PartialProviderConfig = { provider: provider as Provider };

  switch (provider) {
    case Provider.OLLAMA:
      if (!elements.ollamaApiUrl || !elements.ollamaModel) {
        throw new Error('Ollama settings elements not found');
      }
      return {
        ...baseSettings,
        ollamaApiUrl: elements.ollamaApiUrl.value.trim(),
        ollamaModel: elements.ollamaModel.value.trim(),
      };

    case Provider.OPENAI:
      if (!elements.openaiApiKey) {
        throw new Error('OpenAI settings element not found');
      }
      return {
        ...baseSettings,
        openaiApiKey: elements.openaiApiKey.value.trim(),
      };

    case Provider.GEMINI:
      if (!elements.geminiApiKey) {
        throw new Error('Gemini settings element not found');
      }
      return {
        ...baseSettings,
        geminiApiKey: elements.geminiApiKey.value.trim(),
      };

    case Provider.CLAUDE:
      if (!elements.claudeApiKey) {
        throw new Error('Claude settings element not found');
      }
      return {
        ...baseSettings,
        claudeApiKey: elements.claudeApiKey.value.trim(),
      };

    case Provider.MISTRAL:
      if (!elements.mistralApiKey) {
        throw new Error('Mistral settings element not found');
      }
      return {
        ...baseSettings,
        mistralApiKey: elements.mistralApiKey.value.trim(),
      };

    case Provider.DEEPSEEK:
      if (!elements.deepseekApiKey) {
        throw new Error('DeepSeek settings element not found');
      }
      return {
        ...baseSettings,
        deepseekApiKey: elements.deepseekApiKey.value.trim(),
      };

    case Provider.ZAI:
      if (!elements.zaiApiKey || !elements.zaiModel || !elements.zaiVariant) {
        throw new Error('Zai settings element not found');
      }
      return {
        ...baseSettings,
        zaiApiKey: elements.zaiApiKey.value.trim(),
        zaiModel: elements.zaiModel.value,
        zaiVariant: elements.zaiVariant.value as 'paas' | 'coding',
      };

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

  if (!isValidProvider(provider)) {
    return {
      success: false,
      message: 'Invalid provider selected',
    };
  }

  const settingsToSave = gatherProviderSettings(provider, elements);
  let permissionGranted = true;

  try {
    const permissionOrigin = getPermissionOrigin(provider as Provider, settingsToSave);
    const hasSettings = Object.values(settingsToSave).some((val) => val && val !== '');

    if (hasSettings) {
      try {
        permissionGranted = await messenger.permissions.request({
          origins: [permissionOrigin],
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error requesting permission', { error: errorMessage });
        return {
          success: false,
          message: 'Error with permission request',
        };
      }
    }

    if (permissionGranted) {
      await messenger.storage.local.set(settingsToSave);
      return {
        success: true,
        message: 'Settings saved!',
      };
    } else {
      return {
        success: false,
        message: 'Permission denied. Settings not saved.',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error saving settings', { error: errorMessage });
    return {
      success: false,
      message: 'Error saving settings',
    };
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
async function populateZaiModels(): Promise<void> {
  const zaiKeyInput = document.getElementById('zai-api-key') as HTMLInputElement;
  const zaiModelSelect = document.getElementById('zai-model') as HTMLSelectElement;

  if (!zaiKeyInput?.value) {
    return; // Kein API-Key, nichts zu tun
  }

  try {
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
    console.error('Failed to populate z.ai models:', error);
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
 * Batch analysis polling interval reference
 */
let progressPollingInterval: number | null = null;

/**
 * Updates batch analysis UI based on progress
 */
function updateBatchUI(
  elements: BatchAnalysisElements,
  progress: BatchProgress,
  isProviderConfigured: boolean
): void {
  // Update button states
  if (progress.status === 'running') {
    elements.analyzeAllBtn.disabled = true;
    elements.analyzeAllBtn.textContent = 'Analysiere...';
    elements.cancelAnalysisBtn.style.display = 'inline-block';
    elements.cancelAnalysisBtn.disabled = false;
  } else {
    elements.analyzeAllBtn.disabled = !isProviderConfigured;
    elements.analyzeAllBtn.textContent =
      progress.status === 'cancelled' ? 'Analysiere alle E-Mails' : 'Analysiere alle E-Mails';
    elements.cancelAnalysisBtn.style.display = 'none';
    elements.cancelAnalysisBtn.disabled = true;
  }

  // Update progress bar
  if (progress.total > 0) {
    elements.analyzeProgress.style.display = 'block';
    const percentage = Math.min(100, Math.round((progress.processed / progress.total) * 100));
    elements.analyzeProgress.value = percentage;
    elements.analyzeProgressText.textContent = `${progress.processed}/${progress.total} (${percentage}%)`;
  } else {
    elements.analyzeProgress.style.display = 'none';
    elements.analyzeProgressText.textContent = '';
  }

  // Update status message
  let statusMessage = '';
  switch (progress.status) {
    case 'idle':
      statusMessage = isProviderConfigured
        ? 'Bereit zur Analyse aller E-Mails'
        : 'Bitte konfigurieren Sie zuerst einen LLM-Provider';
      break;
    case 'running':
      statusMessage = `Analysiere E-Mails... (${progress.processed}/${progress.total})`;
      break;
    case 'completed':
      statusMessage = `Analyse abgeschlossen: ${progress.successful}/${progress.total} erfolgreich, ${progress.failed} fehlgeschlagen`;
      break;
    case 'cancelled':
      statusMessage = `Analyse abgebrochen: ${progress.processed}/${progress.total} E-Mails verarbeitet`;
      break;
    case 'error':
      statusMessage = `Fehler: ${progress.errorMessage || 'Unbekannter Fehler'}`;
      break;
  }
  elements.analyzeStatusMessage.textContent = statusMessage;
}

/**
 * Starts polling for batch analysis progress updates
 */
function startProgressPolling(
  elements: BatchAnalysisElements,
  isProviderConfigured: boolean
): void {
  // Clear any existing interval
  stopProgressPolling();

  // Poll every 500ms
  progressPollingInterval = window.setInterval(async () => {
    try {
      const progress = await sendMessage<BatchProgress>({ action: 'getBatchProgress' });
      updateBatchUI(elements, progress, isProviderConfigured);

      // Stop polling when not running
      if (progress.status !== 'running') {
        stopProgressPolling();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get batch progress', { error: errorMessage });
      stopProgressPolling();
    }
  }, 500);
}

/**
 * Stops polling for batch analysis progress updates
 */
function stopProgressPolling(): void {
  if (progressPollingInterval !== null) {
    clearInterval(progressPollingInterval);
    progressPollingInterval = null;
  }
}

/**
 * Handles batch completion
 */
function handleBatchComplete(elements: BatchAnalysisElements, statistics: BatchStatistics): void {
  const progress: BatchProgress = {
    status: 'completed',
    total: statistics.total,
    processed: statistics.total,
    successful: statistics.successful,
    failed: statistics.failed,
    startTime: Date.now(),
    endTime: Date.now(),
  };
  updateBatchUI(elements, progress, true);
}

/**
 * Handles batch error
 */
function handleBatchError(elements: BatchAnalysisElements, error: string): void {
  const progress: BatchProgress = {
    status: 'error',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: Date.now(),
    errorMessage: error,
  };
  updateBatchUI(elements, progress, true);
}

/**
 * Cleans up resources when the page is unloaded
 */
function cleanupResources(): void {
  stopProgressPolling();
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
 * Handles analyze all button click
 */
async function handleAnalyzeAllClick(
  elements: BatchAnalysisElements,
  isProviderConfigured: boolean
): Promise<void> {
  if (!isProviderConfigured) {
    elements.analyzeStatusMessage.textContent =
      'Bitte konfigurieren Sie zuerst einen LLM-Provider.';
    return;
  }

  try {
    elements.analyzeAllBtn.disabled = true;
    elements.analyzeStatusMessage.textContent = 'Starte Batch-Analyse...';

    const response = await sendMessage<BatchAnalysisResponse>({ action: 'startBatchAnalysis' });

    if (!response.success) {
      handleBatchError(elements, response.error || 'Unbekannter Fehler');
      return;
    }

    // Start polling for progress updates
    startProgressPolling(elements, isProviderConfigured);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start batch analysis', { error: errorMessage });
    handleBatchError(elements, errorMessage);
  }
}

/**
 * Handles cancel analysis button click
 */
async function handleCancelAnalysisClick(elements: BatchAnalysisElements): Promise<void> {
  try {
    const response = await sendMessage<BatchCancelResponse>({ action: 'cancelBatchAnalysis' });

    if (response.success) {
      elements.analyzeStatusMessage.textContent = response.message;
    } else {
      elements.analyzeStatusMessage.textContent = response.message;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to cancel batch analysis', { error: errorMessage });
    elements.analyzeStatusMessage.textContent = `Fehler beim Abbrechen: ${errorMessage}`;
  }
}

/**
 * Handles kill queue button click
 */
async function handleKillQueueClick(elements: BatchAnalysisElements): Promise<void> {
  try {
    const response = await sendMessage<{ success: boolean; message: string }>({
      action: 'clearQueue',
      cancelRunning: true,
    });

    if (response.success) {
      elements.analyzeStatusMessage.textContent = response.message;
    } else {
      elements.analyzeStatusMessage.textContent = response.message;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear queue', { error: errorMessage });
    elements.analyzeStatusMessage.textContent = `Fehler beim Leeren der Queue: ${errorMessage}`;
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
      case 'zai':
        return !!settings.zaiApiKey;
      default:
        return false;
    }
  } catch (error) {
    logger.error('Failed to check provider configuration', { error });
    return false;
  }
}

/**
 * Initializes batch analysis UI
 */
async function initializeBatchAnalysis(elements: BatchAnalysisElements): Promise<void> {
  const isConfigured = await checkProviderConfigured();

  // Set initial UI state
  const progress: BatchProgress = {
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    startTime: 0,
  };
  updateBatchUI(elements, progress, isConfigured);

  // Check for ongoing batch analysis
  try {
    const currentProgress = await sendMessage<BatchProgress>({ action: 'getBatchProgress' });
    if (currentProgress.status === 'running') {
      updateBatchUI(elements, currentProgress, isConfigured);
      startProgressPolling(elements, isConfigured);
    }
  } catch (error) {
    logger.warn('Failed to check for ongoing batch analysis', { error });
  }

  // Add event listeners
  elements.analyzeAllBtn.addEventListener('click', () => {
    checkProviderConfigured().then((configured) => {
      handleAnalyzeAllClick(elements, configured);
    });
  });

  elements.cancelAnalysisBtn.addEventListener('click', () => {
    handleCancelAnalysisClick(elements);
  });

  elements.killQueueBtn.addEventListener('click', () => {
    handleKillQueueClick(elements);
  });
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
    alert('Error: Tag name is required.');
    return;
  }

  if (!key) {
    alert('Error: Tag key is required.');
    return;
  }

  if (!isValidTagKey(key)) {
    alert('Error: Tag key must contain only lowercase letters, numbers, and underscores.');
    return;
  }

  if (!isValidHexColor(color)) {
    alert('Error: Tag color must be a valid hex color (e.g., #FF5722).');
    return;
  }

  if (!prompt) {
    alert('Error: Tag prompt is required.');
    return;
  }

  // Check for duplicate keys (excluding current index for edits)
  const isDuplicate = customTags.some((tag, i) => tag.key === key && i !== index);
  if (isDuplicate) {
    alert('Error: Tag key must be unique.');
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
    alert('Error: Failed to save tag. Please try again.');
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

      // Re-check provider configuration after settings save
      initializeBatchAnalysis(elements).catch((error) => {
        logger.error('Failed to re-initialize batch analysis after settings save', { error });
      });
    });

    // Provider change handler
    elements.providerSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      showRelevantSettings(target.value);
    });

    // z.ai API key change handler - fetch models when key changes
    if (elements.zaiApiKey) {
      const debouncedPopulateZaiModels = debounce(populateZaiModels, 500);
      elements.zaiApiKey.addEventListener('input', () => {
        if (elements.zaiApiKey?.value) {
          debouncedPopulateZaiModels();
        }
      });
    }

    // Initialize batch analysis
    initializeBatchAnalysis(elements).catch((error) => {
      logger.error('Failed to initialize batch analysis', { error });
    });

    // Initialize cache management
    updateCacheStats(elements).catch((error) => {
      logger.error('Failed to initialize cache stats', { error });
    });

    // Cache management event listeners
    elements.clearCacheBtn.addEventListener('click', () => {
      handleClearCacheClick(elements);
    });

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
