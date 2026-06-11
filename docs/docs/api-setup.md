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

## GPU Settings

On NVIDIA graphics cards, you may want to consider changing the `CUDA - Sysmem Fallback Policy` to `Prefer No Sysmem Fallback` in the NVIDIA Control Panel, especially if you're pushing the limits of what can fit in your GPU's VRAM. This will prevent your graphics card from partially offloading models to system RAM, which tends to make them unusably slow. The system will do its best to squeeze everything into GPU VRAM instead, but if there's really just not enough space, your LLM or image gen application will crash.

## Electron

Prerequisites:

1. You need access to an LLM via a completions API. TODO

Installation:

1. Download the latest version for your operating system from TODO
2. Extract the zip file anywhere on your machine
3. Run the `yozakura` executable file inside then follow the in-app instructions
4. Note that a `yozakura_data` folder will be created next to `yozakura.exe`, this is where images live if you want to access those directly

## Docker

Prerequisites:

1. You need access to an LLM via a completions API.
2. You need to have Docker installed TODO

Installation:

1. Run TODO Docker command with port and without data dir

If you want to put your yozakura_data directory somewhere easily accessible, add a volume option to the command like: `docker run -v` TODO

Give it just a few moments to start, then visit `http://localhost:4396` in your web browser.

## Git clone

Check the README in the GitHub repo for the latest development setup instructions. TODO
