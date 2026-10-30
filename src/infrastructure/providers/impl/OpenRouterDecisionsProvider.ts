import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../../interfaces/ILogger';
import { BaseProvider, type BaseProviderSettings, type TagResponse } from '../BaseProvider';
import type { StructuredEmailData } from '@/shared/types/EmailPart'
import type { CustomTags } from '@/shared/types/TagTypes'
import { validateApiKeyFormat } from '@/shared/utils/loggingUtils';

// OpenRouter Decisions API — typed probabilistic decisions instead of chat completion.
const DECISIONS_API_URL = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_DECISIONS_MODEL = 'typesafe/jev-1.14';
export const DEFAULT_TAG_THRESHOLD = 0.6;
// Decision models take no prompt; cap the body so huge mails don't blow up the state payload.
const MAX_BODY_CHARS = 20000;
const SCAM_QUESTION_ID = 'scam';
const TAG_QUESTION_PREFIX = 'tag_';

export function getTagThreshold(settings: BaseProviderSettings): number {
  const configured = settings.additionalConfig?.tagThreshold;
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return Math.min(1, Math.max(0, configured));
  }
  return DEFAULT_TAG_THRESHOLD;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the probability of a noul answer. Missing entry, wrong type, non-numeric or
 * out-of-range value yields undefined — never a silent 0.
 */
function noulProbability(answer: unknown): number | undefined {
  if (!isObject(answer) || answer.type !== 'noul') return undefined;
  const p = answer.noul;
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1 ? p : undefined;
}

/** Per-tag probabilities in the order the questions were asked (id = tag_<index>). */
export function readTagProbabilities(
  answers: Record<string, unknown>,
  customTags: CustomTags
): Array<{ key: string; p: number }> {
  return customTags.flatMap((tag, index) => {
    const p = noulProbability(answers[`${TAG_QUESTION_PREFIX}${index}`]);
    return p === undefined ? [] : [{ key: tag.key, p }];
  });
}

@injectable()
export class OpenRouterDecisionsProvider extends BaseProvider {
  public readonly providerId = 'openrouter-decisions';

  constructor(@inject('ILogger') protected readonly logger: ILogger) {
    super();
    this.logger.debug('OpenRouterDecisionsProvider initialized');
  }

  public override async analyze(
    input: Parameters<BaseProvider['analyze']>[0]
  ): Promise<TagResponse> {
    // Defense-in-depth: this override bypasses BaseProvider.analyze(), so settings
    // are re-checked here before any network call (AnalyzeEmail also validates upstream).
    if (!this.validateSettings(input.settings)) {
      throw new Error('Invalid provider settings: Missing required API key or model');
    }
    // BaseProvider.analyze() re-validates through the generic tags/confidence/reasoning
    // schema, which drops is_scam — so parse and return the decisions result directly.
    const { settings, signal } = input;
    const threshold = getTagThreshold(settings);
    this.logInfo('Starting email analysis', {
      providerId: this.providerId,
      tagCount: input.customTags.length,
      model: settings.model,
    });
    const requestBody = this.buildRequestBody(settings, '', input.structuredData, input.customTags);
    const response = await this.executeRequest(settings, requestBody, signal);
    // Per-call parse context: ProviderFactory caches one instance shared by concurrent
    // workers, so tag order (→ tag_<i> keys) and threshold travel as arguments.
    return this.parseResponse(await response.json(), input.customTags, threshold);
  }

  protected getApiUrl(): string {
    return DECISIONS_API_URL;
  }

  protected getAdditionalHeaders(_settings: BaseProviderSettings): Record<string, string> {
    // Recommended OpenRouter attribution headers (same as the chat provider)
    return {
      'HTTP-Referer': 'https://github.com/dustsucker/thunderbird-email-ai-assistant',
      'X-OpenRouter-Title': 'Thunderbird Email AI Assistant',
    };
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    _prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): Record<string, unknown> {
    const questions: Record<string, { type: 'noul'; instructions: string }> = {};
    customTags.forEach((tag, index) => {
      questions[`${TAG_QUESTION_PREFIX}${index}`] = {
        type: 'noul',
        instructions: `Does this email match the tag "${tag.name}"? Rule: ${tag.prompt || 'custom tag'}`,
      };
    });
    questions[SCAM_QUESTION_ID] = {
      type: 'noul',
      instructions: 'Is this email a scam/phishing attempt?',
    };

    return {
      model: settings.model || DEFAULT_DECISIONS_MODEL,
      state: {
        subject: structuredData.headers?.subject ?? '',
        from: structuredData.headers?.from ?? '',
        body: (structuredData.body ?? '').slice(0, MAX_BODY_CHARS),
      },
      questions,
    };
  }

  protected override parseResponse(
    response: unknown,
    customTags: CustomTags = [],
    threshold: number = DEFAULT_TAG_THRESHOLD
  ): TagResponse {
    if (!isObject(response)) {
      throw new Error('Invalid response structure from OpenRouter Decisions API');
    }
    const answers = response.answers;
    const model = typeof response.model === 'string' ? response.model : 'unknown model';
    if (!isObject(answers) || Object.keys(answers).length === 0) {
      throw new Error(`OpenRouter Decisions API returned no answers for model ${model}`);
    }

    const probabilities = readTagProbabilities(answers, customTags);
    // Schema-drift guard: answers present but nothing parseable means the alpha API
    // changed shape — fail loudly instead of silently caching an empty "analyzed" result.
    if (customTags.length > 0 && probabilities.length === 0) {
      throw new Error(
        `OpenRouter Decisions API returned no parseable tag probabilities for model ${model}`
      );
    }
    const included = probabilities.filter((t) => t.p >= threshold);
    const scamP = noulProbability(answers[SCAM_QUESTION_ID]);
    const usage = isObject(response.usage) ? response.usage : {};
    const cost = typeof usage.cost === 'number' ? `$${usage.cost}` : 'n/a';
    const tags = included.map((t) => t.key);
    // Expose the scam decision as a real tag (maps to _ma_is_scam downstream)
    const scamPassed = scamP !== undefined && scamP >= threshold;
    if (scamPassed) {
      tags.push('is_scam');
    }

    // Overall confidence gate: every probability that passed the provider threshold
    // feeds it, scam included — otherwise a scam-only finding (empty tag catalog)
    // dies at the global gate with confidence 0 despite passing the internal check.
    const passed = [...included.map((t) => t.p), ...(scamPassed ? [scamP] : [])];

    return {
      tags,
      // Conservative overall gate: the weakest probability that made the cut
      confidence: passed.length > 0 ? Math.min(...passed) : 0,
      reasoning:
        `${model}: ` +
        `tags: ${probabilities.map((t) => `${t.key}=${t.p.toFixed(3)}`).join(', ') || 'none'}; ` +
        `scam=${scamP === undefined ? 'n/a' : scamP.toFixed(3)}; ` +
        `threshold=${threshold}; cost=${cost}`,
      // Missing scam answer probes as not-scam; it never silently reads as certain
      is_scam: scamP !== undefined && scamP >= threshold,
    };
  }

  /** Cheap local check, no network: same shape as OpenRouterProvider. */
  public validateSettings(settings: BaseProviderSettings): boolean {
    const validation = validateApiKeyFormat(settings.apiKey, {
      minLength: 20,
      expectedPrefix: 'sk-or-',
      providerName: 'OpenRouter',
    });

    if (!validation.valid) {
      this.logger.error('OpenRouter Decisions settings validation failed', {
        error: validation.error,
        hasApiKey: !!settings.apiKey,
      });
      return false;
    }

    if (!settings.model || !settings.model.trim()) {
      this.logger.error('OpenRouter Decisions settings validation failed', {
        error: 'Model is required',
      });
      return false;
    }

    return true;
  }
}
