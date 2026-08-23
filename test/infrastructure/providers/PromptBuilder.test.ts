/**
 * Unit tests for PromptBuilder (DW8d):
 * `$&`, `` $` ``, `$'` in email body must appear literally in the prompt.
 */

import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../../src/infrastructure/providers/PromptBuilder';
import { createMockStructuredData, createMockCustomTags } from './provider-test-utils';

describe('PromptBuilder', () => {
  it('does not interpret $&, $`, $\' as replacement patterns in body (DW8d)', () => {
    const specialBody = 'price is 100$& and $`backtick and $\'quote';
    const result = buildPrompt(
      createMockStructuredData({ body: specialBody }),
      createMockCustomTags()
    );

    expect(result.prompt).toContain('100$&');
    expect(result.prompt).toContain('$`backtick');
    expect(result.prompt).toContain("$'quote");
  });

  it('does not interpret replacement patterns in headers or attachments', () => {
    const result = buildPrompt(
      createMockStructuredData({
        headers: { subject: 'a $& b' },
        attachments: [{ name: "file$'.txt", mimeType: 'text/plain', size: 1 }],
      }),
      createMockCustomTags()
    );

    expect(result.prompt).toContain('a $& b');
    expect(result.prompt).toContain("file$'.txt");
  });

  it('still substitutes body content normally', () => {
    const result = buildPrompt(
      createMockStructuredData({ body: 'PLAIN BODY' }),
      createMockCustomTags()
    );
    expect(result.prompt).toContain('PLAIN BODY');
  });
});
