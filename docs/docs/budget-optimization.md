---
title: Budget Optimization
sidebar_position: 4
description: Yozakura uses a lot of tokens by default. This document discusses settings to change if you want to spend fewer tokens.
keywords:
  - yozakura settings
  - budget
---

Yozakura uses a lot of tokens by default. This document discusses settings to change if you want to spend less.

## Disable Group Chat

Group chats, especially larger ones, can be expensive. After a group chat ends, all participants update their memories towards all other participants. For a three-NPC chat, that means 3 x 2 = 6 complete relationship updates. For a four-NPC chat, it's 4 x 3 = 12. For five NPCs, 5*4 = 20 which will result in well over 100 completions requests. This assumes they don't mention any characters who aren't participating. If they do, that goes even higher.

To disable group chats, open [yozakura://?settings=true&settingspath=behavior](behavior settings) and set **NPC group chat rate** to 0%, or whatever percentage you're comfortable with.

## Disable offscreen mentions

When participants in a chat mention a character who isn't participating, their memories towards that character get updated too. By default, there can be up to two non-participant ("offscreen") mentions per chat.

To reduce this number to 1 or 0, open [yozakura://?settings=true&settingspath=behavior](behavior settings) and change **Offscreen mention limit**.

## Be selective about NPC chats

In [yozakura://?settings=true&settingspath=behavior](behavior settings), enable **pause at NPC chat start**. Then when NPCs chat, you can choose whether to cancel the chat and save your tokens, or click **start chat** to let the chat happen.

## Cancel automatic NPC chats altogether

In [yozakura://?settings=true&settingspath=behavior](behavior settings), you can set **Rich interaction rate** to 0% (or a lower number you're comfortable with) and then NPCs will never try to talk to each other at all. Note that they can still talk to _you_. If you want certain NPCs to talk, you can use [yozakura://?characteroverview=true](Character Overview)'s **Add to Chat** button to add them to a chat, then remove yourself from the chat and click **start chat** to let them rip.

## Disable intelligent moderation

Both **Speaker selection mode** and **NPC chat end mode** in [yozakura://?settings=true&settingspath=behavior](behavior settings) can be set to "Intelligent" (though this is disabled by default). "Intelligent" adds extra LLM calls for more intelligent behavior, but the dumb modes ("Round Robin" and "Fixed Length" respectively) work fine too.

## Be particular with your LLM provider

If you're using OpenRouter, you can control which provider your prompts get routed to, and the prices between different providers vary significantly. At the time of this writing, **Wafer** is one of the most cost-effective providers for DeepSeek V4.1 Flash and also has great speed and availability. They are my personal recommendation at this time if you're using DeepSeek V4.1 Flash. But prices change, so check OpenRouter's [comparison](https://openrouter.ai/deepseek/deepseek-v4.1-flash#providers).

To use Wafer US only, add a comma on the end of the `model` line in the [advanced settings of your default LLM options](yozakura://?settings=true&settingspath=llm&llmoptionsid=base&llmoptionsadvanced=true), then paste this right after that comma:

```
"provider": {
  "only": [
    "wafer/us"
    ],
  "allow_fallbacks": false
}
```

After you do that, your settings there should look something like this (possibly exactly like this):

```
{
  "temperature": 0.3,
  "min_p": 0.035,
  "dry_multiplier": 0.8,
  "dry_base": 1.75,
  "dry_allowed_length": 2,
  "xtc_threshold": 0.1,
  "xtc_probability": 0.5,
  "max_tokens": 1000,
  "reasoning": {
    "enabled": false
  },
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "provider": {
    "only": [
      "wafer/us"
    ],
    "allow_fallbacks": false
  }
}
```

## BYOK / Cut out the Middleman

You can sometimes save a little bit by skipping OpenRouter and going directly to the source. You can make an API key for Wafer for example [here](https://app.wafer.ai/login).

However don't assume this is the case, **OpenRouter is often cheaper**. Make sure to compare price lists closely.
