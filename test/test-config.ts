export function getTestConfig() {
  return {
    zaiApiKey: process.env.ZAI_API_KEY || '',
    zaiModel: process.env.ZAI_MODEL || 'glm-4.7',
    zaiVariant: process.env.ZAI_VARIANT || 'coding',
    zaiBaseUrl:
      process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4/chat/completions',
    testApiTimeout: parseInt(process.env.TEST_API_TIMEOUT || '30000', 10),
  };
}

export function hasValidZaiConfig(): boolean {
  const config = getTestConfig();
  return config.zaiApiKey !== '' && config.zaiApiKey !== 'your-zai-api-key-here';
}

// Coding ist der Standard-Variant, da er optimiert für Code- und Textanalyse-Tasks ist
export const ZAI_TEST_SETTINGS = {
  model: 'glm-4.7',
  variant: 'coding',
  baseUrl: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
};

export const TEST_TIMEOUT = 90000;
