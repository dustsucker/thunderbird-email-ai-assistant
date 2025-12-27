export interface ITagManager {
  getAllTags(): Promise<ThunderbirdTag[]>;
  createTag(name: string, color?: string, sortKey?: string): Promise<ThunderbirdTag>;
  getCustomTags?(defaults: CustomTags): Promise<StorageCustomTags>;
  getTag(key: string): Promise<ThunderbirdTag | undefined>;
  getTagById(id: string): Promise<ThunderbirdTag | undefined>;
  updateTag(id: string, updates: TagUpdateOptions): Promise<ThunderbirdTag>;
  deleteTag(id: string): Promise<void>;
  tagExists(key: string): Promise<boolean>;
  ensureTagExists(key: string, name: string, color?: string): Promise<ThunderbirdTag>;
  setTagsOnMessage(messageId: number, tagKeys: string[]): Promise<void>;
  addTagToMessage(messageId: number, tagKey: string): Promise<void>;
  removeTagFromMessage(messageId: number, tagKey: string): Promise<void>;
  clearTagsFromMessage(messageId: number): Promise<void>;
  addTagToMessages(messageIds: number[], tagKey: string): Promise<void>;
  setTagsOnMessages(messageIds: number[], tagKeys: string[]): Promise<void>;
}

export interface TagUpdateOptions {
  name?: string;
  color?: string;
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

export type CustomTags = ReadonlyArray<{
  key: string;
  name: string;
  color: string;
  prompt?: string;
}>;
