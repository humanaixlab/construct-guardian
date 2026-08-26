export const BEDROCK_CONFIG = {
  modelId: process.env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-sonnet-4-6",
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? "8000"),
  maxTokens: 1800,
  temperature: 0,
} as const;
