import { promises as fs } from 'fs';
import { join } from 'path';

type Attachment = {
  name: string;
  mimeType: string;
  size: number;
};

export interface EmailPart {
  contentType: string;
  body: string;
  isAttachment: boolean;
  name?: string;
  size?: number;
  parts?: EmailPart[];
}

export interface StructuredEmailData {
  headers: Record<string, string>;
  body: string;
  attachments: Attachment[];
}

export interface ParsedHeaders {
  [key: string]: string | undefined;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  'content-type'?: string;
  'message-id'?: string;
  'mime-version'?: string;
  'content-transfer-encoding'?: string;
}

const fixtureCache = new Map<string, StructuredEmailData>();

export async function loadEmailFixture(filename: string): Promise<StructuredEmailData> {
  if (fixtureCache.has(filename)) {
    return fixtureCache.get(filename)!;
  }

  try {
    const filePath = join(__dirname, filename);
    const content = await fs.readFile(filePath, 'utf-8');

    if (!isValidEmlContent(content)) {
      throw new Error(`Invalid EML format in file: ${filename}`);
    }

    const headers = parseEmlHeaders(content);
    const parts = createEmailPartFromEml(content);
    const body = extractBodyFromParts(parts);
    const attachments = extractAttachmentsFromParts(parts);

    const structuredData: StructuredEmailData = {
      headers,
      body,
      attachments,
    };

    fixtureCache.set(filename, structuredData);
    return structuredData;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load email fixture '${filename}': ${error.message}`);
    }
    throw new Error(`Failed to load email fixture '${filename}': Unknown error`);
  }
}

export function parseEmlHeaders(content: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let inHeaders = true;

  for (let i = 0; i < lines.length && inHeaders; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      inHeaders = false;
      break;
    }

    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentKey && headers[currentKey]) {
        headers[currentKey] = headers[currentKey] + ' ' + line.trim();
      }
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      currentKey = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      if (value) {
        headers[currentKey] = value;
      }
    }
  }

  return headers;
}

export function createEmailPartFromEml(content: string): EmailPart {
  const headers = parseEmlHeaders(content);
  const contentType = headers['content-type'] || 'text/plain';
  const bodyStart = findBodyStart(content);

  if (contentType.startsWith('multipart/')) {
    return parseMultipart(content, contentType, bodyStart);
  }

  const body = content.slice(bodyStart).trim();
  const transferEncoding = headers['content-transfer-encoding'];

  return {
    contentType,
    body: decodeBody(body, transferEncoding),
    isAttachment: false,
  };
}

export function isValidEmlContent(content: string): boolean {
  if (typeof content !== 'string' || content.length === 0) {
    return false;
  }

  const lines = content.split('\n');
  if (lines.length < 2) {
    return false;
  }

  const requiredHeaders = ['from', 'to', 'subject', 'date'];
  const foundHeaders = new Set<string>();

  for (const line of lines) {
    if (line.trim() === '') break;

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      if (requiredHeaders.includes(key)) {
        foundHeaders.add(key);
      }
    }
  }

  return foundHeaders.size >= 3;
}

function findBodyStart(content: string): number {
  const headerEndIndex = content.indexOf('\n\n');
  const headerEndIndexAlt = content.indexOf('\r\n\r\n');

  if (headerEndIndex !== -1 && headerEndIndexAlt !== -1) {
    return Math.min(headerEndIndex, headerEndIndexAlt) + 2;
  }
  if (headerEndIndex !== -1) {
    return headerEndIndex + 2;
  }
  if (headerEndIndexAlt !== -1) {
    return headerEndIndexAlt + 4;
  }

  return content.length;
}

function extractBoundary(contentType: string): string | null {
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  return boundaryMatch ? boundaryMatch[1] : null;
}

function parseMultipart(content: string, contentType: string, bodyStart: number): EmailPart {
  const boundary = extractBoundary(contentType);

  if (!boundary) {
    throw new Error('Multipart content type missing boundary parameter');
  }

  const parts: EmailPart[] = [];
  const body = content.slice(bodyStart).trim();
  const boundaryLines = body.split(`\n--${boundary}`);

  for (let i = 1; i < boundaryLines.length; i++) {
    const partContent = boundaryLines[i].trim();

    if (partContent === '--' || partContent === '') {
      continue;
    }

    try {
      const part = parseMultipartPart(partContent);
      parts.push(part);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse multipart part: ${error.message}`);
      }
    }
  }

  return {
    contentType,
    body: '',
    isAttachment: false,
    parts,
  };
}

function parseMultipartPart(content: string): EmailPart {
  const headers = parseEmlHeaders(content);
  const bodyStart = findBodyStart(content);
  const contentType = headers['content-type'] || 'text/plain';
  const contentDisposition = headers['content-disposition'] || '';

  const body = content.slice(bodyStart).trim();
  const transferEncoding = headers['content-transfer-encoding'];
  const isAttachment = contentDisposition?.toLowerCase().includes('attachment') ?? false;
  const name = extractFilename(contentDisposition, contentType);

  if (contentType.startsWith('multipart/')) {
    return parseMultipart(content, contentType, bodyStart);
  }

  return {
    contentType,
    body: decodeBody(body, transferEncoding),
    isAttachment,
    name,
    size: body.length,
  };
}

function extractFilename(contentDisposition: string | undefined, contentType: string | undefined): string | undefined {
  if (contentDisposition) {
    const nameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (nameMatch) {
      return nameMatch[1];
    }
  }

  if (contentType) {
    const nameMatch = contentType.match(/name="?([^";]+)"?/i);
    if (nameMatch) {
      return nameMatch[1];
    }
  }

  return undefined;
}

function decodeBody(body: string, encoding: string | undefined): string {
  if (!encoding) {
    return body;
  }

  const encodingLower = encoding.toLowerCase();

  if (encodingLower === 'base64') {
    try {
      return Buffer.from(body, 'base64').toString('utf-8');
    } catch {
      return body;
    }
  }

  if (encodingLower === 'quoted-printable') {
    return body
      .split('\n')
      .map(line => {
        return line.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      })
      .join('\n')
      .replace(/=$/gm, '');
  }

  return body;
}

function extractBodyFromParts(part: EmailPart): string {
  if (part.parts && part.parts.length > 0) {
    const textPart = part.parts.find(p => p.contentType === 'text/plain' && !p.isAttachment);
    const htmlPart = part.parts.find(p => p.contentType === 'text/html' && !p.isAttachment);

    if (textPart) {
      return textPart.body;
    }

    if (htmlPart) {
      return htmlPart.body;
    }

    for (const subPart of part.parts) {
      const body = extractBodyFromParts(subPart);
      if (body) {
        return body;
      }
    }

    return '';
  }

  if (!part.isAttachment && (part.contentType === 'text/plain' || part.contentType === 'text/html')) {
    return part.body;
  }

  return '';
}

function extractAttachmentsFromParts(part: EmailPart): Attachment[] {
  const attachments: Attachment[] = [];

  function recurse(p: EmailPart): void {
    if (p.isAttachment && p.name) {
      attachments.push({
        name: p.name,
        mimeType: p.contentType,
        size: p.size || 0,
      });
    }

    if (p.parts) {
      for (const subPart of p.parts) {
        recurse(subPart);
      }
    }
  }

  recurse(part);
  return attachments;
}
