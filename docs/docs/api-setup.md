---
title: API Setup
sidebar_position: 4
description: Connect Yozakura to a local or cloud LLM and image model. Setup guides for KoboldCpp, OpenRouter, and any OpenAI-compatible completions API.
keywords:
  - yozakura api setup
  - local llm
  - koboldcpp
  - openrouter
  - image generation
  - openai compatible api
  - stable diffusion
---

Yozakura requires you to bring your own AI LLM model/subscription (and optionally image generation model).

You can run these models on your own machine if it's powerful enough, or use a cloud provider. Both approaches will be covered in this document, with suggested software and providers.

## Local LLM

Running an LLM on your machine generally requires at least 8 GB of graphics card VRAM for the smaller models.

First you need a model to run. A decent baseline that fits on many modern consumer GPUs is [Llama 3.1 8B Q4_K_M which you can download from Hugging Face](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF?show_file_info=Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf) (though it's nowhere near as powerful as commonly available cloud models). Mistral Nemo 12B finetunes like [NemoMix](https://huggingface.co/bartowski/NemoMix-Unleashed-12B-GGUF) and [Mag-Mell](https://huggingface.co/mradermacher/MN-12B-Mag-Mell-R1-GGUF) are a step up that can also run on a lot of consumer hardware.

The suggested software for running a local LLM is [KoboldCpp](https://github.com/lostruins/koboldcpp), but any other application that exposes an OpenAI compatible completions endpoint will do.

![koboldcpp image](/img/koboldcpp.png)

In KoboldCpp select the "Browse" button and choose your model file, then click Launch. If it's successful, a browser window will pop up with a chat interface. You can just close that, or type some messages to test it out.

Then you can start Yozakura and you're good to go. When the initial setup popup appears, the `Completions API Setup` section will already have the correct values for KoboldCpp, so you don't need to change anything there, if you launched KoboldCpp as described above.

In KoboldCpp, you may want to consider increasing Context Size if you want to have longer chats. The default of 8192 is generally enough, but doubling that adds headroom for longer chats. I expect very few people would need higher than 16384, as the nature of Yozakura tends to keep chats shorter than those you might have in SillyTavern or similar. If, during a longer chat, the quality of responses suddenly degrades severely, you may be exceeding the limits of your context size. At the time of this writing, Yozakura won't detect that for you.

## Local Image Model

Since we're already using KoboldCpp to run the text model, we can use it for the image model too. But as before, anything that exposes an AUTOMATIC1111-shape API will also work. KoboldCpp is pretty easy and convenient but you might get better performance and lower VRAM usage with [Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) or [AUTOMATIC1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui) or others.

For an image model, [WAI Illustrious SDXL](https://civitai.red/models/827184/wai-illustrious-sdxl) is a good baseline model for manga/anime style images that follows prompts well.

In KoboldCpp, go to the Image Gen tab and browse to your model under `Image Gen. Model`. If you intend to use LoRAs, enable the "Runtime LoRAs" checkbox, and browse to your LoRA folder next to `LoRA Dir`. Consider enabling `Compress Weights` if you need a smaller memory footprint.

Click launch, then you can start Yozakura and you're good to go. When the initial setup popup appears, the `Image Generation Setup` section will already have the correct values for KoboldCpp, so you don't need to change anything there.

## Cloud LLM (OpenRouter)

If your machine can't comfortably run a local model, or you just want the better narrative coherence that stronger models can often provide, use a cloud provider instead.

[OpenRouter](https://openrouter.ai) is an excellent provider because one account and one API key gets you access to practically every major model (Claude, GPT, Gemini, DeepSeek, and hundreds of others) on pay-as-you-go credits, and you can switch models whenever you want. However, any provider exposing an OpenAI compatible completions endpoint will work the same way.

Setup:

1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Buy some credits on the [Credits page](https://openrouter.ai/credits).
3. Create an API key on the [Keys page](https://openrouter.ai/keys).
4. In Yozakura's initial setup popup, under `Completions API Setup` (if you already closed the popup, the same fields are in the settings cog -> LLM Settings -> Base Defaults):
   - **Completions API URL**: `https://openrouter.ai/api/v1/chat/completions`
   - **Bearer/Auth Token**: your OpenRouter API key
   - **Model**: a model ID from the [models page](https://openrouter.ai/models), see below
5. Leave token streaming enabled, and click `Test Connection` to confirm you can connect.

For the model, `deepseek/deepseek-chat` is a decent choice, but it's a good idea to try several models and find one you like. Yozakura makes a lot of LLM calls with all the NPC chatting and memory processing, so keep that in mind as you budget. In my experience each default twelve-message NPC chat with `deepseek/deepseek-chat` costs about a penny. Using the latest models from Anthropic, OpenAI, or Google could cost much more (and may be overkill).

One note on privacy: OpenRouter routes your prompts to the underlying model providers, and some providers may train on your inputs. You can restrict this in your OpenRouter privacy settings.

## Cloud Image Generation (OpenRouter)

OpenRouter can also handle image generation, and it works through the same chat completions endpoint as text. However, local image models will generally give you better results, especially if you're looking for animated style images, and they have somewhat more modest system requirements than text models. Using a local image model is recommended if at all possible. If not, then:

In the initial setup popup under `Image Generation Setup` (or the settings cog -> Image Generation):

1. Change **API Shape** to `OpenRouter`.
2. **Image API URL**: `https://openrouter.ai/api/v1/chat/completions` (the same URL as the text API)
3. **Bearer/Auth Token**: the same OpenRouter API key
4. **Model**: an image-capable model, for example `x-ai/grok-imagine-image-quality`. On the OpenRouter models page you can filter by image output to see what's available.
5. Click `Test Connection`.

Image generation is typically priced per image rather than per token, usually a few cents per image depending on the model.

## GPU Settings

On NVIDIA graphics cards, you may want to consider changing the `CUDA - Sysmem Fallback Policy` to `Prefer No Sysmem Fallback` in the NVIDIA Control Panel, especially if you're pushing the limits of what can fit in your GPU's VRAM. This will prevent your graphics card from partially offloading models to system RAM, which tends to make them unusably slow if you allow it to happen. After changing this setting, the system will do its best to squeeze everything into GPU VRAM instead, but if there's really just not enough space, your LLM or image gen application will crash, and/or other programs you're running will glitch graphically and crash. Sometimes rebooting your PC and not opening any other programs before using Yozakura will give you a bit of extra headroom.
