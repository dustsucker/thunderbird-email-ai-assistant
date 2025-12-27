/**
 * Shared constants for email analysis providers
 * @module providers/constants
 */

/**
 * System prompt used by most AI providers for email analysis.
 * Instructs the AI to respond with clean JSON following the schema.
 */
export const ANALYSIS_SYSTEM_PROMPT = `You are an email analysis expert. Your task is to analyze the provided email data and respond only with a single, clean JSON object that strictly follows the requested schema. Do not include any conversational text, markdown formatting, or explanations in your response.`;

/**
 * System prompt for Zai provider with stricter formatting requirements.
 */
export const ANALYSIS_SYSTEM_PROMPT_ZAI = `You are an email analysis assistant. Your ONLY task is to analyze the provided email data and respond with a single, valid JSON object. Return NOTHING except the JSON object - no conversational text, no markdown formatting (no \`\`\`json\`\`\` blocks), no explanations, no greetings, no "Here is the analysis" text. The response MUST start directly with { and end with }. Ensure all required fields are present with correct data types.`;

/**
 * Detailed system prompt for BaseProvider implementations.
 * Includes JSON schema example and formatting rules.
 */
export const ANALYSIS_SYSTEM_PROMPT_DETAILED = `You are an email analysis expert. Your task is to analyze the provided email data and respond ONLY with a single, clean JSON object in this exact format:

{
  "tags": ["tag1", "tag2"],
  "confidence": 0.9,
  "reasoning": "brief explanation"
}

Rules:
- "tags" is an array of strings containing tag keys where check is true (based on user prompt instructions)
- "confidence" is a number between 0.0 and 1.0 representing your overall confidence
- "reasoning" is a brief one or two sentence explanation
- Return NOTHING except JSON object - no conversational text, no markdown formatting, no explanations
- The response MUST start with { and end with }`;
