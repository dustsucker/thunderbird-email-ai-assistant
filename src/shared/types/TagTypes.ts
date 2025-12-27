export interface Tag {
  key: string;
  name: string;
  color: string;
  prompt?: string;
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

export type CustomTags = ReadonlyArray<Tag>;
