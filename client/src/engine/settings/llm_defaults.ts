export const LLM_DEFAULTS: Record<string, unknown> = {
  temperature: 0.3,
  min_p: 0.035,
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 2,
  xtc_threshold: 0.1,
  xtc_probability: 0.5,
  max_tokens: 1000,
};

// Higher temperature for chat messages to encourage more interesting responses
export const LLM_DEFAULTS_CHAT: Record<string, unknown> = {
  temperature: 1.0,
  max_tokens: 250,
};
