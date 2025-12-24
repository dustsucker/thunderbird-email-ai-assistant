import {DEFAULTS, HARDCODED_TAGS, TAG_KEY_PREFIX, TAG_NAME_PREFIX} from './core/config.js';
import { findEmailParts } from './core/analysis.js';
import { PROVIDER_ENGINES } from './providers';
import {ensureTagsExist} from "./core/tags";
import { logger } from './providers/utils.js';

logger.info("Spam-Filter Extension: Background script loaded.");

class RateLimiter {
  constructor(config) {
    this.config = config;
    this.buckets = {};
    this.queues = {};
    this.processing = {};

    for (const provider in config) {
      this.buckets[provider] = {
        tokens: config[provider].limit,
        lastRefill: Date.now(),
        limit: config[provider].limit,
        window: config[provider].window
      };
      this.queues[provider] = [];
      this.processing[provider] = null;
    }
  }

  refillTokens(provider) {
    const bucket = this.buckets[provider];
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / bucket.window) * bucket.limit;

    bucket.tokens = Math.min(bucket.limit, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  hasTokens(provider) {
    this.refillTokens(provider);
    return this.buckets[provider].tokens >= 1;
  }

  consumeToken(provider) {
    this.buckets[provider].tokens -= 1;
  }

  async processQueue(provider) {
    if (this.processing[provider]) {
      await this.processing[provider];
      return;
    }

    this.processing[provider] = (async () => {
      try {
        while (this.queues[provider].length > 0) {
          const { fn, resolve, reject } = this.queues[provider].shift();

          while (!this.hasTokens(provider)) {
            await new Promise(r => setTimeout(r, 100));
          }

          this.consumeToken(provider);

          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      } finally {
        this.processing[provider] = null;
      }
    })();

    await this.processing[provider];
  }

  async execute(provider, requestFn, priority = 1) {
    return new Promise((resolve, reject) => {
      this.queues[provider].push({ fn: requestFn, resolve, reject, priority });
      this.queues[provider].sort((a, b) => b.priority - a.priority);
      this.processQueue(provider);
    });
  }
}

const rateLimiter = new RateLimiter({
  openai: { limit: 500, window: 60000 },
  claude: { limit: 50, window: 60000 },
  ollama: { limit: 1000, window: 60000 },
  mistral: { limit: 50, window: 60000 },
  deepseek: { limit: 50, window: 60000 },
  gemini: { limit: 50, window: 60000 }
});

async function updateBadge(status) {
  const settings = await messenger.storage.local.get(DEFAULTS);
  
  const badgeConfig = {
    processing: { text: '⏳', color: '#2196F3' },
    success: { text: '', color: '' },
    error: { text: '⚠', color: '#F44336' }
  };

  const config = badgeConfig[status];
  if (!config) return;

  const badge = messenger.browserAction || messenger.action;
  if (!badge) return;

  badge.setBadgeText({ text: config.text });
  if (config.color) {
    badge.setBadgeBackgroundColor({ color: config.color });
  }
}

async function showNotification(title, message, type = 'info') {
  const settings = await messenger.storage.local.get(DEFAULTS);

  if (type === 'error' || (type === 'info' && settings.enableNotifications)) {
    messenger.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: title,
      message: message
    });
  }
}

async function analyzeEmail(structuredData, priority = 1) {
  const settings = await messenger.storage.local.get(DEFAULTS);
  const engine = PROVIDER_ENGINES[settings.provider];

  if (engine) {
    logger.info(`Using provider: ${settings.provider}`);
    try {
      await updateBadge('processing');
      const result = await rateLimiter.execute(settings.provider, () => 
        engine(settings, structuredData, settings.customTags), 
        priority
      );
      await updateBadge('success');
      return result;
    } catch (error) {
      await updateBadge('error');
      await showNotification(
        'Analysis Failed',
        `Provider: ${settings.provider}\nError: ${error.message}`,
        'error'
      );
      throw error;
    }
  } else {
    await updateBadge('error');
    await showNotification(
      'Configuration Error',
      `No analysis engine found for provider: ${settings.provider}`,
      'error'
    );
    return null;
  }
}

function calculatePriority(headers) {
  const from = headers['from'] ? headers['from'][0] : '';
  const subject = headers['subject'] ? headers['subject'][0] : '';
  
  const highPriorityKeywords = ['urgent', 'important', 'asap', 'priority'];
  const highPriorityDomains = ['@company.com', '@important.org'];
  
  let priority = 1;
  
  for (const keyword of highPriorityKeywords) {
    if (subject.toLowerCase().includes(keyword)) {
      priority += 1;
    }
  }
  
  for (const domain of highPriorityDomains) {
    if (from.includes(domain)) {
      priority += 2;
    }
  }
  
  return priority;
}

logger.info("Spam-Filter Extension: Setting up onNewMailReceived handler");

messenger.messages.onNewMailReceived.addListener(async (folder, messages) => {
  logger.info(`Spam-Filter Extension: Received ${messages.messages.length} new messages`);

  for (const message of messages.messages) {
    try {
      const fullMessage = await messenger.messages.getFull(message.id);
      const { body, attachments } = findEmailParts(fullMessage.parts);
      
      const structuredData = {
          headers: fullMessage.headers,
          body: body,
          attachments: attachments
      };

      const priority = calculatePriority(fullMessage.headers);
      const analysis = await analyzeEmail(structuredData, priority);

      if (!analysis) {
        logger.warn("Skipping tagging due to analysis failure", { messageId: message.id });
        continue;
      }

      const { customTags } = await messenger.storage.local.get({ customTags: DEFAULTS.customTags });
      const messageDetails = await messenger.messages.get(message.id);
      const tagSet = new Set(messageDetails.tags || []);
      
      // Handle hardcoded tags
      if (analysis.is_scam || analysis.spf_pass === false || analysis.dkim_pass === false) tagSet.add(HARDCODED_TAGS.is_scam.key);
      if (analysis.spf_pass === false) tagSet.add(HARDCODED_TAGS.spf_fail.key);
      if (analysis.dkim_pass === false) tagSet.add(HARDCODED_TAGS.dkim_fail.key);

      // Handle dynamic custom tags
      for (const tag of customTags) {
        if (analysis[tag.key] === true) {
          tagSet.add(TAG_KEY_PREFIX + tag.key);
        }
      }
      tagSet.add(TAG_KEY_PREFIX + HARDCODED_TAGS.tagged);
      logger.info("Analysis complete, tagging", { messageId: message.id, tagSet: Array.from(tagSet) });

      await messenger.messages.update(message.id, { tags: Array.from(tagSet) });
    } catch (error) {
      await showNotification(
        'Processing Error',
        `Message ID: ${message.id}\nError: ${error.message}`,
        'error'
      );
      logger.error("Error processing message", { messageId: message.id, error: error.message });
    }
  }
});

// Initialize
ensureTagsExist();