---
title: Using Different Models for Different Prompt Types
sidebar_position: 1
description: Configure Yozakura to use different LLMs for different prompt types — for example a slow, character-focused model for chat responses and a fast model for background memory processing.
keywords:
  - yozakura llm settings
  - per-prompt model
  - multiple models
  - fast model
  - roleplay model
  - llm option groups
---

Yozakura sends a lot of different kinds of prompts to your LLM. Some of them are the actual character responses you read in chat, others include summarizing conversations, updating memories, and more. It's possible to route these different types of prompts to different models, which may provide a better experience.

This is handled by the **LLM Settings** section. Open the settings cog and go to **LLM Settings**. Under **LLM Prompt Options** you'll find a list of option groups. Out of the box there's already a separate group for each prompt type, so you don't need to create a new one except for advanced use cases.

## A common setup: fast for memory, slow for roleplay

A very common change is to use a big, slow model that's good at character roleplay for the actual chat responses, while using a small, fast model for all the memory processing so it finishes quickly and doesn't hold things up. Here's how to do it:

1. Open the settings cog and go to **LLM Settings**.
2. Find the **Base Defaults** group, click **Edit**, and set the **Model** field to a fast model (for example a small, cheap model). Because `Base Defaults` applies to every prompt type that doesn't have a more specific group overriding it, all the memory processing steps will now use this fast model. Click **Save**.
3. Find the **Chat: NPC Respond** group, click **Edit**, and set its **Model** field to a slow model that's good at character roleplay. Click **Save**.

## Going further with rules

The `rule` field is just a snippet of JavaScript that's evaluated against a `context` object. Matching on `context.promptTemplateGroup` is the simplest case, but the rules system is flexible enough to support much more advanced routing; for example, sending to a different model based on how long the chat is, how many characters are participating, the time of day, and more.

If you want to pursue that, the `context` object available to each prompt type is documented in the [Prompt Template Group Context Docs](template-system.md#prompt-template-group-context-docs) section of the prompt template system docs.
