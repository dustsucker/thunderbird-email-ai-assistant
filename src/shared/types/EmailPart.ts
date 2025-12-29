export interface EmailPart {
  contentType: string;
  body: string;
  isAttachment: boolean;
  name?: string;
  size?: number;
  parts?: EmailPart[];
}

export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
}

export interface ParsedEmail {
  body: string;
  attachments: Attachment[];
}

export interface StructuredEmailData {
  headers: Record<string, string>;
  body: string;
  attachments: Attachment[];
}

export interface AnalysisData {
  headers: Record<string, string>;
  body?: string;
  attachments: Attachment[];
  parts?: EmailPart[];
}

export interface PromptBuilderResult {
  prompt: string;
  allTagsDescription: string;
}
