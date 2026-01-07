/**
 * Tag Management UI Component
 *
 * Manages CRUD operations for custom email tags.
 * Uses dependency injection for loose coupling with tag manager and config repository.
 *
 * @module interfaces/options/TagManagementUI
 */

import { injectable, inject } from 'tsyringe';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { ICustomTag } from '@/infrastructure/interfaces/IConfigRepository';

// ============================================================================
// DOM Element Interfaces
// ============================================================================

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

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Tag edit context for modal
 */
interface TagEditContext {
  tag: ICustomTag | null;
  index: number;
}

// ============================================================================
// Tag Management UI Implementation
// ============================================================================

/**
 * Tag Management UI Component
 *
 * Manages custom tag creation, editing, and deletion operations.
 * Provides a user-friendly interface for managing email classification tags.
 *
 * @example
 * ```typescript
 * const tagUI = container.resolve<TagManagementUI>(TagManagementUI);
 * await tagUI.loadTags();
 * tagUI.render();
 * await tagUI.createTag({ key: 'important', name: 'Important', color: '#FF0000' });
 * ```
 */
@injectable()
export class TagManagementUI {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly tagManager: ITagManager;
  private readonly logger: ILogger;
  private readonly configRepository: IConfigRepository;
  private elements: TagManagementElements | null = null;
  private currentTags: ICustomTag[] = [];

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ITagManager') tagManager: ITagManager,
    @inject('ILogger') logger: ILogger,
    @inject('IConfigRepository') configRepository: IConfigRepository
  ) {
    this.tagManager = tagManager;
    this.logger = logger;
    this.configRepository = configRepository;
    this.logger.debug('TagManagementUI initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Renders the tag management UI to the DOM.
   *
   * Sets up event listeners for add, edit, and delete operations.
   * Initializes modal dialog for tag editing.
   */
  render(): void {
    this.logger.debug('Rendering tag management UI');

    this.elements = this.getDOMElements();

    // Setup add new tag button
    this.elements.addNewTagBtn.addEventListener('click', () => {
      this.openModal({ tag: null, index: -1 });
    });

    // Setup close modal button
    this.elements.closeModalBtn.addEventListener('click', () => {
      this.closeModal();
    });

    // Setup close modal on outside click
    window.addEventListener('click', (e) => {
      if (e.target === this.elements?.modal) {
        this.closeModal();
      }
    });

    // Setup tag list click handler
    this.elements.tagListContainer.addEventListener('click', (e) => {
      this.handleTagListClick(e);
    });

    // Setup tag form submit handler
    this.elements.tagForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleTagFormSubmit().catch((error) => {
        this.logger.error('Failed to handle tag form submit', { error });
      });
    });

    this.logger.debug('Tag management UI rendered');
  }

  /**
   * Loads custom tags from ConfigRepository.
   *
   * Retrieves tags from ConfigRepository and updates internal state.
   */
  async loadTags(): Promise<void> {
    this.logger.debug('Loading custom tags');

    try {
      this.currentTags = await this.configRepository.getCustomTags();

      if (this.elements) {
        this.renderTagList();
      }

      this.logger.info('Custom tags loaded', { count: this.currentTags.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load custom tags', { error: errorMessage });
      throw new Error(`Failed to load custom tags: ${errorMessage}`);
    }
  }

  /**
   * Creates a new custom tag.
   *
   * @param tag - Tag configuration to create
   * @throws Error if tag creation fails
   */
  async createTag(tag: ICustomTag): Promise<void> {
    this.logger.info('[TAG-UI] Starting tag creation', {
      key: tag.key,
      name: tag.name,
      color: tag.color,
      prompt: tag.prompt,
    });

    // Validate tag
    const validationError = this.validateTag(tag, this.currentTags.length);
    if (validationError) {
      this.logger.error('[TAG-UI] Tag validation failed', { key: tag.key, error: validationError });
      throw new Error(validationError);
    }
    this.logger.debug('[TAG-UI] Tag validation passed', { key: tag.key });

    // Add to current tags
    this.currentTags.push(tag);
    this.logger.debug('[TAG-UI] Tag added to local array', {
      key: tag.key,
      totalTags: this.currentTags.length,
    });

    // Save to ConfigRepository
    try {
      this.logger.info('[TAG-UI] Saving tags to ConfigRepository', {
        tagCount: this.currentTags.length,
        tags: this.currentTags.map((t) => t.key).join(', '),
      });

      await this.configRepository.setCustomTags(this.currentTags);

      this.logger.info('[TAG-UI] Tags saved to ConfigRepository successfully', {
        tagCount: this.currentTags.length,
      });

      // Create in Thunderbird
      this.logger.info('[TAG-UI] Creating tag in Thunderbird', {
        name: tag.name,
        color: tag.color,
        key: tag.key,
      });

      const thunderbirdTag = await this.tagManager.createTag(tag.name, tag.color, tag.key);

      this.logger.info('[TAG-UI] Tag created in Thunderbird successfully', {
        key: tag.key,
        thunderbirdKey: thunderbirdTag.key,
        name: thunderbirdTag.tag,
        color: thunderbirdTag.color,
      });

      // Update UI
      if (this.elements) {
        this.renderTagList();
      }

      this.logger.info('[TAG-UI] Tag creation completed successfully', {
        key: tag.key,
        name: tag.name,
        internalKey: thunderbirdTag.key,
      });
    } catch (error) {
      // Rollback on error
      this.currentTags.pop();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-UI] Failed to create tag', {
        key: tag.key,
        name: tag.name,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to create tag: ${errorMessage}`);
    }
  }

  /**
   * Updates an existing tag.
   *
   * @param key - Tag key to update
   * @param updates - Tag properties to update
   * @throws Error if tag update fails
   */
  async updateTag(key: string, updates: ICustomTag): Promise<void> {
    this.logger.info('[TAG-UI] Starting tag update', {
      key,
      updates: { name: updates.name, color: updates.color },
    });

    // Find tag index
    const index = this.currentTags.findIndex((tag) => tag.key === key);

    if (index === -1) {
      this.logger.error('[TAG-UI] Tag not found for update', { key });
      throw new Error(`Tag with key '${key}' not found`);
    }

    const oldTag = this.currentTags[index];
    this.logger.debug('[TAG-UI] Found tag to update', {
      key,
      oldName: oldTag.name,
    });

    // Validate updated tag
    const validationError = this.validateTag(updates, index);
    if (validationError) {
      this.logger.error('[TAG-UI] Tag validation failed for update', {
        key,
        error: validationError,
      });
      throw new Error(validationError);
    }
    this.logger.debug('[TAG-UI] Tag validation passed for update', { key });

    // Update tag
    this.currentTags[index] = updates;

    // Save to ConfigRepository
    try {
      this.logger.info('[TAG-UI] Saving updated tags to ConfigRepository', {
        key,
        tagCount: this.currentTags.length,
      });

      await this.configRepository.setCustomTags(this.currentTags);

      this.logger.info('[TAG-UI] Tags saved to ConfigRepository successfully', { key });

      // Update in Thunderbird
      this.logger.info('[TAG-UI] Updating tag in Thunderbird', {
        key,
        name: updates.name,
        color: updates.color,
      });

      const thunderbirdTag = await this.tagManager.updateTag(key, {
        name: updates.name,
        color: updates.color,
      });

      this.logger.info('[TAG-UI] Tag updated in Thunderbird successfully', {
        key,
        thunderbirdKey: thunderbirdTag.key,
        name: thunderbirdTag.tag,
        color: thunderbirdTag.color,
      });

      // Update UI
      if (this.elements) {
        this.renderTagList();
      }

      this.logger.info('[TAG-UI] Tag update completed successfully', { key });
    } catch (error) {
      // Rollback on error
      this.currentTags[index] = oldTag;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-UI] Failed to update tag', {
        key,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to update tag: ${errorMessage}`);
    }
  }

  /**
   * Deletes a custom tag.
   *
   * @param key - Tag key to delete
   * @throws Error if tag deletion fails
   */
  async deleteTag(key: string): Promise<void> {
    this.logger.info('[TAG-UI] Starting tag deletion', { key });

    // Find tag index
    const index = this.currentTags.findIndex((tag) => tag.key === key);

    if (index === -1) {
      this.logger.error('[TAG-UI] Tag not found for deletion', { key });
      throw new Error(`Tag with key '${key}' not found`);
    }

    const tag = this.currentTags[index];
    this.logger.debug('[TAG-UI] Found tag to delete', {
      key,
      name: tag.name,
    });

    // Remove from current tags
    this.currentTags.splice(index, 1);
    this.logger.debug('[TAG-UI] Tag removed from local array', {
      key,
      remainingTags: this.currentTags.length,
    });

    // Save to ConfigRepository
    try {
      this.logger.info('[TAG-UI] Saving tags after deletion to ConfigRepository', {
        key,
        tagCount: this.currentTags.length,
      });

      await this.configRepository.setCustomTags(this.currentTags);

      this.logger.info('[TAG-UI] Tags saved to ConfigRepository successfully', { key });

      // Delete from Thunderbird
      this.logger.info('[TAG-UI] Deleting tag from Thunderbird', { key });

      await this.tagManager.deleteTag(key);

      this.logger.info('[TAG-UI] Tag deleted from Thunderbird successfully', { key });

      // Update UI
      if (this.elements) {
        this.renderTagList();
      }

      this.logger.info('[TAG-UI] Tag deletion completed successfully', { key });
    } catch (error) {
      // Rollback on error
      this.currentTags.splice(index, 0, tag);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-UI] Failed to delete tag', {
        key,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to delete tag: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Retrieves all DOM elements for the tag management UI.
   *
   * @returns DOM elements object
   * @throws Error if required elements are not found
   */
  private getDOMElements(): TagManagementElements {
    const tagListContainer = document.getElementById('tag-list-container') as HTMLDivElement;
    const modal = document.getElementById('tag-modal') as HTMLDivElement;
    const modalTitle = document.getElementById('tag-modal-title') as HTMLHeadingElement;
    const tagForm = document.getElementById('tag-form') as HTMLFormElement;
    const closeModalBtn = document.getElementById('close-modal-btn') as HTMLSpanElement;
    const addNewTagBtn = document.getElementById('add-new-tag-btn') as HTMLButtonElement;
    const tagIndex = document.getElementById('tag-index') as HTMLInputElement;
    const tagName = document.getElementById('tag-name') as HTMLInputElement;
    const tagKey = document.getElementById('tag-key') as HTMLInputElement;
    const tagColor = document.getElementById('tag-color') as HTMLInputElement;
    const tagPrompt = document.getElementById('tag-prompt') as HTMLTextAreaElement;

    if (!tagListContainer || !modal || !tagForm || !addNewTagBtn) {
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
   * Renders the tag list to the DOM.
   */
  private renderTagList(): void {
    if (!this.elements) {
      return;
    }

    this.elements.tagListContainer.innerHTML = '';

    if (this.currentTags.length === 0) {
      this.elements.tagListContainer.innerHTML = '<p>No custom tags configured yet.</p>';
      return;
    }

    this.currentTags.forEach((tag, index) => {
      const tagElement = document.createElement('div');
      tagElement.className = 'tag-item';
      tagElement.dataset.index = index.toString();
      tagElement.dataset.key = tag.key;

      tagElement.innerHTML = `
        <div class="tag-preview" style="background-color: ${tag.color}">
          ${tag.name}
        </div>
        <div class="tag-actions">
          <button class="edit-tag-btn" data-action="edit" data-index="${index}" data-key="${tag.key}">
            Edit
          </button>
          <button class="delete-tag-btn" data-action="delete" data-index="${index}" data-key="${tag.key}">
            Delete
          </button>
        </div>
        <div class="tag-prompt">
          ${tag.prompt ? `<small>${tag.prompt}</small>` : ''}
        </div>
      `;

      this.elements?.tagListContainer.appendChild(tagElement);
    });
  }

  /**
   * Opens the tag modal for creating or editing a tag.
   *
   * @param context - Tag edit context
   */
  private openModal(context: TagEditContext): void {
    if (!this.elements) {
      return;
    }

    // Set form values
    if (context.tag) {
      this.elements.modalTitle.textContent = 'Edit Tag';
      this.elements.tagIndex.value = context.index.toString();
      this.elements.tagName.value = context.tag.name;
      this.elements.tagKey.value = context.tag.key;
      this.elements.tagColor.value = context.tag.color;
      this.elements.tagPrompt.value = context.tag.prompt ?? '';
    } else {
      this.elements.modalTitle.textContent = 'Create New Tag';
      this.elements.tagIndex.value = '-1';
      this.elements.tagName.value = '';
      this.elements.tagKey.value = '';
      this.elements.tagColor.value = '#4CAF50';
      this.elements.tagPrompt.value = '';
    }

    // Show modal
    this.elements.modal.style.display = 'block';
  }

  /**
   * Closes the tag modal.
   */
  private closeModal(): void {
    if (!this.elements) {
      return;
    }

    this.elements.modal.style.display = 'none';
    this.elements.tagForm.reset();
  }

  /**
   * Handles tag list click events.
   *
   * @param e - Click event
   */
  private handleTagListClick(e: Event): void {
    const target = e.target as HTMLElement;

    // Handle edit button click
    if (target.classList.contains('edit-tag-btn')) {
      const index = parseInt(target.dataset.index ?? '-1', 10);
      if (index >= 0 && this.currentTags[index]) {
        this.openModal({ tag: this.currentTags[index], index });
      }
      return;
    }

    // Handle delete button click
    if (target.classList.contains('delete-tag-btn')) {
      const key = target.dataset.key;
      if (key) {
        if (confirm(`Are you sure you want to delete the tag '${key}'?`)) {
          this.deleteTag(key).catch((error) => {
            this.logger.error('Failed to delete tag', { key, error });
            alert(
              `Failed to delete tag: ${error instanceof Error ? error.message : String(error)}`
            );
          });
        }
      }
      return;
    }
  }

  /**
   * Handles tag form submission.
   *
   * Validates form data and creates or updates the tag.
   */
  private async handleTagFormSubmit(): Promise<void> {
    this.logger.info('[TAG-UI] Form submit handler triggered');

    if (!this.elements) {
      this.logger.error('[TAG-UI] Form elements not initialized');
      return;
    }

    const index = parseInt(this.elements.tagIndex.value, 10);
    const name = this.elements.tagName.value.trim();
    const key = this.elements.tagKey.value.trim();
    const color = this.elements.tagColor.value.trim();
    const prompt = this.elements.tagPrompt.value.trim();

    this.logger.info('[TAG-UI] Form data extracted', {
      index,
      name,
      key,
      color,
      hasPrompt: !!prompt,
    });

    if (!name || !key || !color) {
      this.logger.warn('[TAG-UI] Required fields missing', {
        name: !!name,
        key: !!key,
        color: !!color,
      });
      alert('Please fill in all required fields');
      return;
    }

    const tag: ICustomTag = {
      key,
      name,
      color,
      prompt: prompt || undefined,
    };

    this.logger.info('[TAG-UI] Tag object created', {
      tag: { ...tag, prompt: tag.prompt ? 'present' : 'absent' },
    });

    try {
      if (index === -1) {
        this.logger.info('[TAG-UI] Form mode: CREATE new tag');
        // Create new tag
        await this.createTag(tag);
      } else {
        this.logger.info('[TAG-UI] Form mode: UPDATE existing tag', { index });
        // Update existing tag
        await this.updateTag(key, tag);
      }

      this.closeModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-UI] Form submission failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Validates a tag configuration.
   *
   * @param tag - Tag to validate
   * @param currentIndex - Current index of the tag (for update operations)
   * @returns Validation error message or null if valid
   */
  private validateTag(tag: ICustomTag, currentIndex: number): string | null {
    if (!tag.key || tag.key.trim() === '') {
      return 'Tag key is required';
    }

    if (!tag.name || tag.name.trim() === '') {
      return 'Tag name is required';
    }

    if (!tag.color || tag.color.trim() === '') {
      return 'Tag color is required';
    }

    // Check for duplicate keys
    const existingIndex = this.currentTags.findIndex((t) => t.key === tag.key);
    if (existingIndex !== -1 && existingIndex !== currentIndex) {
      return 'Tag key must be unique';
    }

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(tag.color)) {
      return 'Color must be a valid hex color (e.g., #FF0000)';
    }

    return null;
  }
}
