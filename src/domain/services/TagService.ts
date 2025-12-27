import { singleton, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import { Tag, CustomTags } from '@/shared/types/ProviderTypes';

export interface ThunderbirdTag {
  key: string;
  tag: string;
  color: string;
  ordinal: string;
}

export interface StorageCustomTags {
  customTags?: CustomTags;
}

@singleton()
export class TagService {
  private readonly tagKeyPrefix: string;
  private readonly tagNamePrefix: string;
  private readonly hardcodedTags: Record<string, Tag>;
  private readonly defaultCustomTags: CustomTags;

  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('ITagManager') private readonly tagManager: ITagManager
  ) {
    this.tagKeyPrefix = '_ma_';
    this.tagNamePrefix = 'A:';
    this.hardcodedTags = {
      is_scam: { key: 'is_scam', name: 'Scam Alert', color: '#FF5722' },
      spf_fail: { key: 'spf_fail', name: 'SPF Fail', color: '#E91E63' },
      dkim_fail: { key: 'dkim_fail', name: 'DKIM Fail', color: '#E91E63' },
      tagged: { key: 'tagged', name: 'Tagged', color: '#4f4f4f' },
      email_ai_analyzed: { key: 'email_ai_analyzed', name: 'AI Analyzed', color: '#9E9E9E' },
    };
    this.defaultCustomTags = [
      {
        key: 'is_advertise',
        name: 'Advertisement',
        color: '#FFC107',
        prompt:
          'check if email is advertising something and contains an offer or someone is asking for contact to show the offer',
      },
      {
        key: 'is_business_approach',
        name: 'Business Ad',
        color: '#2196F3',
        prompt:
          'check if email is a cold marketing/sales/business approach (or next message in the approach process where sender reply to self to refresh the approach in the mailbox). Consider typical sales and lead generation scenarios.',
      },
      {
        key: 'is_personal',
        name: 'Personal',
        color: '#4CAF50',
        prompt: 'check if this is non-sales scenario approach from someone who likes to contact in a non-business context.',
      },
      {
        key: 'is_business',
        name: 'Business',
        color: '#af4c87',
        prompt: 'check if this looks like work related email',
      },
      {
        key: 'is_service_important',
        name: 'Service Important',
        color: '#F44336',
        prompt:
          'check if email contains important information related to already subscribed service (if this is subscription offer - ignore it): bill, password reset, login link, 2fa code, expiration notice. Consider common services like electricity, bank account, netflix, or similar subscription service.',
      },
      {
        key: 'is_service_not_important',
        name: 'Service Info',
        color: '#9E9E9E',
        prompt:
          'check if email contains non critical information from already subscribed service (if this is subscription offer - ignore it) - like: daily posts update from linkedin, AWS invitation for conference, cross sale, tips how to use product, surveys, new offers',
      },
      {
        key: 'is_bill',
        name: 'Bill',
        color: '#f4b136',
        prompt: 'check if email contains bill or invoice information.',
      },
      {
        key: 'has_calendar_invite',
        name: 'Appointment',
        color: '#7F07f2',
        prompt: 'check if the mail has invitation to the call or meeting (with calendar appointment attached)',
      },
    ];
  }

  async ensureTagsExist(): Promise<void> {
    try {
      const tagsToEnsure = await this.getAllTagConfigs();

      const allTags = await this.tagManager.getAllTags();

      if (!this.isThunderbirdTagArray(allTags)) {
        this.logger.error('Invalid tag list received from Thunderbird', { allTags });
        return;
      }

      for (const tagToCreate of tagsToEnsure) {
        const alreadyExists = this.checkTagExists(allTags, tagToCreate);

        if (alreadyExists) {
          this.logger.debug(`Tag already exists`, { key: tagToCreate.key, name: tagToCreate.name });
          continue;
        }

        await this.tagManager.createTag(
          this.tagNamePrefix + tagToCreate.name,
          tagToCreate.color
        );

        this.logger.info(`Created new tag`, { name: tagToCreate.name });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during tag creation', { error: errorMessage });
    }
  }

  checkTagExists(existingTags: ThunderbirdTag[], tagToCheck: Tag): boolean {
    return existingTags.some(
      (existingTag) =>
        existingTag.key === this.tagKeyPrefix + tagToCheck.key ||
        existingTag.tag === this.tagNamePrefix + tagToCheck.name
    );
  }

  async getAllTagConfigs(): Promise<Tag[]> {
    try {
      const storageResult = this.tagManager.getCustomTags
        ? await this.tagManager.getCustomTags(this.defaultCustomTags)
        : { customTags: this.defaultCustomTags };

      if (!this.isValidStorageCustomTags(storageResult)) {
        this.logger.error('Invalid format for custom tags', { storageResult });
        return Object.values(this.hardcodedTags);
      }

      const { customTags = this.defaultCustomTags }: { customTags?: CustomTags } = storageResult;
      const hardcoded = Object.values(this.hardcodedTags);
      const result: Tag[] = [...hardcoded];
      for (let i = 0; i < (customTags?.length ?? 0); i++) {
        const tag = customTags?.[i];
        if (tag) {
          result.push(tag);
        }
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting tag configurations', { error: errorMessage });
      return Object.values(this.hardcodedTags);
    }
  }

  findThunderbirdTag(existingTags: ThunderbirdTag[], tagConfig: Tag): ThunderbirdTag | undefined {
    return existingTags.find(
      (existingTag) =>
        existingTag.key === this.tagKeyPrefix + tagConfig.key ||
        existingTag.tag === this.tagNamePrefix + tagConfig.name
    );
  }

  isThunderbirdTag(value: unknown): value is ThunderbirdTag {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const tag = value as Partial<ThunderbirdTag>;

    return (
      typeof tag.key === 'string' &&
      tag.key.length > 0 &&
      typeof tag.tag === 'string' &&
      tag.tag.length > 0 &&
      typeof tag.color === 'string' &&
      /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(tag.color) &&
      typeof tag.ordinal === 'string'
    );
  }

  isThunderbirdTagArray(value: unknown): value is ThunderbirdTag[] {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.every((item) => this.isThunderbirdTag(item));
  }

  isValidStorageCustomTags(value: unknown): value is StorageCustomTags {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const storage = value as Record<string, unknown>;

    if (storage.customTags !== undefined) {
      return Array.isArray(storage.customTags);
    }

    return true;
  }
}

export interface ThunderbirdTag {
  key: string;
  tag: string;
  color: string;
  ordinal: string;
}

export interface StorageCustomTags {
  customTags?: CustomTags;
}
