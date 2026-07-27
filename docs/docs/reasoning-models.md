---
title: Using Reasoning Models
sidebar_position: 5
description: How to use reasoning models in Yozakura.
keywords:
  - yozakura help
  - yozakura support
  - discord
  - github discussions
  - feedback
---

You can use reasoning models in Yozakura if you want. They might do better at certain tasks, like memory generation or next-speaker selection, and you can [use different models or configuration on a per-prompt basis](how-to-different-models-per-prompt.md). Reasoning tends to use a lot more tokens and take a lot longer, but it might be a worthwhile tradeoff depending on how you like to use Yozakura.

Below we will walk through two examples of using a reasoning model. The details might be different for other models and host software. Last, we'll go over a few tips and tricks.

## Local: Gemma 4 26B A4B on KoboldCpp

**Make sure you have the latest version of KoboldCpp**. Some of the features used below are very new at the time of this writing. I am using v1.117.1.

Gemma 4 26B A4B is an excellent model that runs pretty well on many consumer GPUs and has reasoning capability. I find that using reasoning for memory generation in Yozakura does significantly improve memory quality with this model, at the cost of taking much longer when a conversation ends.

When loading the model in KoboldCpp, just enable the `Use Jinja` checkbox on the `Quick Launch` tab. Other than that, launch KoboldCpp normally.

To enable reasoning for memory generation only, go to [LLM Settings](yozakura://?settings=true&settingspath=llm) in Yozakura and edit all of the items that begin with `Chat Memory:`.

For each one, you'll want to add `chat_template_kwargs.enable_thinking: true`, specify a `thinking_budget_tokens`, and increase `max_tokens` under `LLM Meta Options (JSON)`. Don't forget to click `Save`.

**Example:** By default, the `LLM Meta Options (JSON)` for `Chat Memory: Summarize Conversation` looks like this:

```json
{
  "max_tokens": 500
}
```

To enable reasoning, I change it to this:

```json
{
  "max_tokens": 1515,
  "chat_template_kwargs": {
    "enable_thinking": true
  },
  "thinking_budget_tokens": 1000
}
```

This allows the model to use up to 1000 tokens for reasoning, and then the rest of its 1515 max_tokens budget for the actual output. I changed max_tokens to 1515 instead of 1500 to provide a little extra buffer, because when the thinking budget is exhausted, KoboldCpp injects some extra tokens like `"Thinking budget exhausted, time to answer!"`.

Note that it's possible for the model to decide not to do any reasoning, and then it could output a memory of size ~1515 tokens, instead of the ~500 max that I want. I'm not aware of any way to avoid that in the current version of KoboldCpp, but I also haven't seen it be a problem in practice.

## OpenRouter: DeepSeek V4 Flash

To use DeepSeek V4 Flash via OpenRouter, first open [LLM Settings](yozakura://?settings=true&settingspath=llm) in Yozakura and edit the `Base Defaults`. Set the `Model` field to `deepseek/deepseek-v4-flash`. If you haven't already, make sure the `Completions API URL` is pointing to the correct URL for OpenRouter (`https://openrouter.ai/api/v1/chat/completions`). Don't forget to click `Save`.

### Disabling Reasoning By Default

When using reasoning models via OpenRouter (or at least this one), reasoning is enabled by _default for all requests_. Unless you actually want to use reasoning for all types of prompts, you should disable it by default. To do so, add a `reasoning` section to the bottom of `LLM Meta Options (JSON)` under `Base Defaults` in Yozakura's [LLM Settings](yozakura://?settings=true&settingspath=llm). Don't forget to click `Save`.

**Example:** Here's the default `LLM Meta Options (JSON)` settings, plus a `reasoning` section I added to disable reasoning:

```json
{
  "temperature": 0.3,
  "min_p": 0.035,
  "dry_multiplier": 0.8,
  "dry_base": 1.75,
  "dry_allowed_length": 2,
  "xtc_threshold": 0.1,
  "xtc_probability": 0.5,
  "max_tokens": 1000,
  "model": "deepseek/deepseek-v4-flash",
  "reasoning": {
    "enabled": false
  }
}
```

### Enabling Reasoning For Specific Prompts

Now update the prompt settings in Yozakura's [LLM Settings](yozakura://?settings=true&settingspath=llm) for all of the prompts that you _do_ want to use reasoning (probably at least all the ones starting with `Chat Memory:`, but it's up to you).

**Example:** Here's the updated `LLM Meta Options (JSON)` I used to enable reasoning for the `Chat Memory: Summarize Conversation` prompt:

```json
{
  "max_tokens": 1515,
  "reasoning": {
    "enabled": true,
    "max_tokens": 1000
  }
}
```

This allows the model to use up to 1000 tokens for reasoning. Note, I also had to increase the top-level `max_tokens` to 1515 to fit the 1000 reasoning tokens, plus the ~500 max output tokens I want. The extra 15 in `1515` is a little extra buffer for the formatting tags that reasoning often uses internally.

## Tips

1. I've found it works pretty well to give a thinking budget that's either 1000 tokens, or double the max desired output size, whichever is larger. Different models will likely work best with different numbers.
2. Bigger is not always better. Reasoning models, especially weaker ones, might get into loops where they second-guess themselves unnecessarily, and output gets worse instead of better.
3. Consider editing the prompt templates to instruct the model on _how_ to think. You may be able to improve behavior by doing so, though I haven't experimented much myself.
