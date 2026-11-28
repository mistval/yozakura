---
title: Concurrency
sidebar_position: 7
description: Speed up NPC chatting, background memory generation, and image creation in Yozakura using prompt and image parallelism settings.
keywords:
  - yozakura parallelism
  - yozakura concurrency
  - parallel llm requests
  - parallel image generation
  - cloud provider speed
---

Yozakura sends a lot of LLM API requests beyond just chatting. Primarily conversation summarization, memory and relationship updates, and image generation. By default, Yozakura takes a conservative approach and runs requests **one at a time**, which keeps things safe for local hardware but feels unnecessarily slow if you're using cloud APIs.

Enabling concurrency lets Yozakura run multiple requests at once, which can **dramatically speed up image generation and post-conversation memory generation** when using cloud providers.

Some links in this article will open the relevant area of the Yozakura Electron app if you have it installed and have run it at least once.

## Prompt Concurrency (LLM Settings)

Prompt concurrency controls how many LLM requests Yozakura is allowed to have in flight at the same time.

### First-Time Setup Does This Automatically for Cloud Providers

During first-time setup, if you enter a URL for a known cloud provider (such as OpenRouter, OpenAI, Anthropic, Groq, DeepSeek, Google, Together, Fireworks, Cerebras, NanoGPT, and other major hosts), Yozakura **automatically sets your default concurrency limit to `6`**.

If you started out with a local server (like KoboldCpp) and later switched your URL to a cloud provider in **LLM Settings**, that automatic detection won't re-run. You'll want to raise the concurrency limit manually as shown below.

### How to Configure It

1. Open [Settings → LLM Settings → Base Defaults → Advanced Settings](yozakura://?settings=true&settingspath=llm&llmoptionsid=base&llmoptionsadvanced=true).
2. Click **Edit** on **Base Defaults** (or whichever option group you want to configure) and expand **Advanced Settings**.
3. Adjust the two fields at the bottom:
   - **Concurrency Group Name (optional):** The name of the shared queue/pool for this option group. Leave this alone unless you understand what it does (explained further below).
   - **Concurrency Group Limit (optional):** How many requests in that pool can run simultaneously. Change this to whatever number of requests you want to run concurrently at most. Six is a reasonably conservative number that reaps most of the benefits for one-on-one chats. Group chats can benefit from a higher number. You'll know you've set it too high if you start seeing errors during memory generation.
4. Click **Save**.

### When to Change Prompt Concurrency

- **Using a cloud provider:** Raise **Concurrency Group Limit**. Because memory updates involve many separate character prompts, running several at once makes the simulation feel much snappier.
- **Using a local LLM:** For most local software (including KoboldCpp), it might help a little bit to increase concurrency, because the software will queue your requests and avoid going idle or offloading the model. However, some software might attempt to execute generations concurrently and in local setups, this can often cause slowdowns or even crashes.
- **Hitting rate limits (HTTP 429):** If your cloud provider starts returning rate-limit errors, lower **Concurrency Group Limit**. Or, if the error only happens occasionally, you can leave it alone since Yozakura will automatically retry until it succeeds (this will be shown in the bottom right of the app with a cancel button to cancel the retries).

### Using Separate Concurrency Pools for Mixed Setups

If you [use different models for different prompt types](how-to-different-models-per-prompt.md) — for example, a local model on your GPU for your main chat replies and a fast cloud model on OpenRouter for memory generation — you can put them in separate concurrency pools:

- Keep your local model group on `default_llm` with a limit of `1`.
- Give your cloud memory option group its own **Concurrency Group Name** (such as `cloud_memory_generation`) and a higher **Concurrency Group Limit** (such as `6`).

That way, background memory jobs can blast through in parallel without waiting behind your local chat model.

> **Good to know:** If multiple option groups share the same **Concurrency Group Name** and specify different limits, Yozakura enforces the **lowest** limit among them.

## Image Parallelism (Image Generation Settings)

You can find both image parallelism controls in [Image Generation Settings](yozakura://?settings=true&settingspath=image-generation).

### Generate Images In Parallel With Text

- **Off (default):** Whenever a chat triggers an image, text generation pauses and waits for the image to finish before continuing.
- **On:** Images render in the background while characters keep talking right away.

**When to turn it on:** Turn this on if you're using a cloud image API (like OpenRouter, NanoGPT, OpenAI, or LibertAI) or a separate dedicated image server, **and you don't mind images appearing above your current viewport**. Because the conversation continues while the image is still rendering, once the image finishes it gets placed back into the transcript below the message that triggered it, so if several new messages have already scrolled by, you may need to scroll up to see it, or read the conversation log later. Note: if you delete the triggering message before the image finishes generating, the image will go down to the bottom of the transcript.

**When to leave it off:** Leave this **off** if you run both your text LLM and your image generator locally on the same machine, since most PCs struggle to run both models simultaneously.

### Image Generation Concurrency

- Controls how many image generation jobs can run at the same time (minimum `1`, default `1`).
- **When to raise it:** If you use a cloud image provider and frequently trigger multiple image generations (for example across busy chats or high auto-image rates), raising **Image generation concurrency** lets them finish together instead of waiting in line. As is the case with text models, it also might help a little bit to increase this even for local models, _unless_ your image generation software attempts to render multiple images in parallel, which may cause slowdowns or even crashes.
