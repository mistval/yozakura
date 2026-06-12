---
title: API Setup
sidebar_position: 4
---

Yozakura requires you to bring your own AI LLM model/subscription (and optionally image generation model).

You can run these models on your own machine if it's powerful enough, or use a cloud provider. Both approaches will be covered in this document, with suggested software and providers.

## Local LLM

Running an LLM on your machine generally requires at least 8 GB of graphics card VRAM for the smaller models.

First you need a model to run. A decent baseline that fits on many modern consumer GPUs is [Llama 3.1 8B Q4_K_M which you can download from Hugging Face](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF?show_file_info=Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf).

The suggested software for running a local LLM is [KoboldCpp](https://github.com/lostruins/koboldcpp), but any other application that exposes an OpenAI compatible completions endpoint will do.

![koboldcpp image](/img/koboldcpp.png)

In KoboldCpp select the "Browse" button and choose your model file, then click Launch. If it's successful, a browser window will pop up with a chat interface. You can just close that, or type some messages to test it out.

Then you can start Yozakura and you're good to go. When the initial setup popup appears, the `Completions API Setup` section will already have the correct values for KoboldCpp, so you don't need to change anything there, if you launched KobolCpp as described above.

In KoboldCpp, you may want to consider increasing Context Size if you want to have longer chats. The default of 8192 is generally enough, but doubling that adds headroom for longer chats. I expect very few people would need higher than 16384, as the nature of Yozakura tends to keep chats shorter than those you might have in SillyTavern or similar. If, during a longer chat, the quality of responses suddenly degrades severely, you may be exceeding the limits of your context size. At the time of this writing, Yozakura won't detect that for you.

## Local Image Model

For running an image model on your machine, [AUTOMATIC1111/stable-diffusion-webui](https://github.com/automatic1111/stable-diffusion-webui) is the suggested software, but anything exposing an image generation API with the same shape will do.

Follow the setup instructions there (which are more involved than KoboldCpp and can be temperamental in my experience).

For an image model, [WAI Illustrious SDXL](https://civitai.red/models/827184/wai-illustrious-sdxl) is a good baseline model for manga/anime style images that follows prompts well. Put it, or any other models, into the `webui/models/Stable-diffusion` folder inside of the AUTOMATIC1111 installation directory.

You need to make a change in order to have AUTOMATIC1111 launch its image API:

1. Open the `webui/webui-user.bat` file on Windows
2. Change this line: `COMMANDLINE_ARGS=` to `set COMMANDLINE_ARGS=--api`
3. (Optional) For better performance on weaker hardware, change it to `set COMMANDLINE_ARGS=--xformers --medvram --api` instead.

For MacOS or Linux, edit the `webui/webui.user.sh` file instead, and change the `#export COMMANDLINE_ARGS=""` line to `export COMMANDLINE_ARGS="--api"` or `export COMMANDLINE_ARGS="--xformers --medvram --api"`

Then you can run the `run.bat` file (on Windows, or `webui.sh` on MacOS/Linux) to start the application, which should open in a browser window after up to several minutes.

Inside the browser window, select your preferred model in the top left under `Stable Diffusion checkpoint`, trying putting in some prompts and clicking Generate if you want to test it out.

Then you can start Yozakura and you're good to go. When the initial setup popup appears, the `Image Generation Setup` section will already have the correct values for AUTOMATIC1111, so you don't need to change anything there, if you launched AUTOMATIC1111 as described above.

## Cloud LLM (OpenRouter)

If your machine can't comfortably run a local model, or you just want better results, use a cloud provider instead. The models available in the cloud are far stronger than anything that fits on a consumer GPU, and Yozakura benefits from every bit of that strength: characters follow their personas more faithfully, memories stay coherent over long play sessions, and the world drifts into nonsense less often. The tradeoff is latency and money. You pay per token, and the big frontier models can be slower to respond than a small local model.

[OpenRouter](https://openrouter.ai) is the suggested provider because one account and one API key gets you access to practically every major model (Claude, GPT, Gemini, DeepSeek, and hundreds of others) on pay-as-you-go credits, and you can switch models by just editing a text field. That said, any provider exposing an OpenAI compatible completions endpoint will work the same way.

Setup:

1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Buy some credits on the [Credits page](https://openrouter.ai/credits). It's pay-as-you-go, there's no subscription.
3. Create an API key on the [Keys page](https://openrouter.ai/keys) and copy it somewhere safe (it's only shown once).
4. In Yozakura's initial setup popup, under `Completions API Setup` (if you already closed the popup, the same fields are in the settings cog -> LLM Settings):
   - **Completions API URL**: `https://openrouter.ai/api/v1/chat/completions`
   - **Bearer/Auth Token**: your OpenRouter API key
   - **Model**: a model ID from the [models page](https://openrouter.ai/models), see below
5. Leave token streaming enabled (OpenRouter supports it), and click `Test Connection` to confirm everything works.

For the model, browse the OpenRouter models page and copy the ID of whatever appeals to you, for example `anthropic/claude-sonnet-4.5` (excellent but pricier) or `deepseek/deepseek-chat` (much cheaper and still strong). Each model's page shows its per-token pricing. Keep in mind that Yozakura makes a lot of LLM calls: every conversation is followed by a round of memory processing calls for each NPC involved, so a mid-priced workhorse model can be a better daily driver than a frontier model. There are also free model variants (marked `:free`) with daily rate limits. They're fine for kicking the tires, but Yozakura's call volume will run into those limits quickly.

One note on privacy: OpenRouter routes your prompts to the underlying model providers, and some free models may train on your inputs. You can restrict this in your OpenRouter privacy settings.

## Cloud Image Generation (OpenRouter)

OpenRouter can also handle image generation, and it works through the same chat completions endpoint as text. In the initial setup popup under `Image Generation Setup` (or the settings cog -> Image Generation):

1. Change **API Shape** to `OpenAI Completions Compatible`. The AUTOMATIC1111 shape is for local software; cloud providers including OpenRouter use the OpenAI shape.
2. **Image API URL**: `https://openrouter.ai/api/v1/chat/completions` (yes, the same URL as the text API)
3. **Bearer/Auth Token**: the same OpenRouter API key
4. **Model**: an image-capable model, for example `google/gemini-2.5-flash-image`. On the OpenRouter models page you can filter by image output to see what's available.
5. Click `Test Connection`.

Image generation is typically priced per image rather than per token, usually a few cents per image depending on the model.

The cloud image models are generally stronger at understanding natural language than the tag-trained local Stable Diffusion models, so they tend to work well with Yozakura's generated scene prompts out of the box. If you want to steer the overall style, the image prompt prefix in the Image Generation settings is the place to do it. Image size and aspect ratio options live there too.

## GPU Settings

On NVIDIA graphics cards, you may want to consider changing the `CUDA - Sysmem Fallback Policy` to `Prefer No Sysmem Fallback` in the NVIDIA Control Panel, especially if you're pushing the limits of what can fit in your GPU's VRAM. This will prevent your graphics card from partially offloading models to system RAM, which tends to make them unusably slow. The system will do its best to squeeze everything into GPU VRAM instead, but if there's really just not enough space, your LLM or image gen application will crash.
