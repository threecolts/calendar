import { createAnthropic } from "@ai-sdk/anthropic"

// Which model writes (open-ended generation) and which one decides (fast,
// structured judgments) when Jev isn't connected. With ANTHROPIC_API_KEY set,
// both run on Claude with that key; otherwise they fall back to AI Gateway.
const anthropicKey = process.env.ANTHROPIC_API_KEY
const anthropic = anthropicKey ? createAnthropic({ apiKey: anthropicKey }) : null

export const writerModel = anthropic
  ? anthropic(process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5")
  : process.env.AI_GATEWAY_MODEL || "inclusionai/ling-3.0-flash-fin"

export const deciderModel = anthropic
  ? anthropic(process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5")
  : process.env.AI_GATEWAY_MODEL || "inclusionai/ling-3.0-flash-fin"

/**
 * Social posts (the Social tab: planning, rewrites, photo picks) run on
 * Claude Opus 5.5 for design judgement; SOCIAL_MODEL overrides it. The rest
 * of the app stays on the writer model.
 */
export const socialModel = anthropic
  ? anthropic(process.env.SOCIAL_MODEL || "claude-opus-5-5")
  : writerModel

export const deciderLabel = anthropic ? "Claude Haiku 5.5" : "Free AI Gateway model"

/**
 * temperature 0 steadies the free gateway model, but current Claude models
 * reject sampling parameters (400), so only send it when Claude isn't in use.
 */
export const steadySampling: { temperature?: number } = anthropic ? {} : { temperature: 0 }
