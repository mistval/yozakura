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

You can use reasoning models in Yozakura if you want. They might do better at certain tasks, like memory generation or next-speaker selection, and you can [use different models on a per-prompt basis](how-to-different-models-per-prompt.md) if you want.

But you will need to increase the default `max_tokens` settings. You can do that in [LLM Settings](yozakura://?settings=true&settingspath=llm). Go through all of those settings (or at least the ones you intend to use a reasoning model for) and either remove the `max_tokens` to make it unlimited, or increase it by a couple thousand.

The reason you have to do this is because reasoning tokens count towards the `max_tokens` budget, making it much easier to hit the default max values if you're using a reasoning model.
