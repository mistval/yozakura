# Image Generation Providers

Yozakura supports several different _shapes_ of image generation providers.

Some shapes are able to support many different providers. You just need to provide the correct URL and any required authentication details.

This document describes the different shapes and lists providers that are known (or reasonably believed) to conform to each shape.

If you test one of these that I haven't tested, please let me know your results so I can update this document. You can contact via [GitHub](https://github.com/mistval/yozakura/discussions) or [Discord](https://discord.com/invite/S92qCjbNHt).

Similarly if you use a provider that is unlisted below, let me know. If it doesn't conform to any of these shapes, we can likely add support fairly easily.

## AUTOMATIC1111 Style

Normally used for local image generation software.

| Provider                                                                 | Typical API URL                             | Tested? | Notes                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [KoboldCpp](https://github.com/lostruins/koboldcpp)                      | http://127.0.0.1:5001/sdui/sdapi/v1/txt2img | ✅      | Probably the easiest way to run a local model. Yozakura's default settings already match KoboldCpp. See [Getting Started](getting-started.md) for more information. |
| [AUTOMATIC1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | http://127.0.0.1:7860/sdapi/v1/txt2img      | ✅      | Older software but still widely used. Can be somewhat difficult to set up.                                                                                          |
| [Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge)      | http://127.0.0.1:7860/sdapi/v1/txt2img      | ✅      | A fork of AUTOMATIC1111 with performance improvements and other fixes. Usually easier to set up. Also somewhat outdated.                                            |
| [ComfyUI-SDAPI](https://github.com/SaladTechnologies/comfyui-api)        | http://127.0.0.1:8188/sdapi/v1/txt2img      | ❌      | Some ComfyUI extensions expose an AUTOMATIC1111-compatible API layer.                                                                                               |
| [LibertAI](https://docs.libertai.io/apis/image/)                         | https://api.libertai.io/sdapi/v1/txt2img    | ❌      | Cloud-hosted service exposing an sdapi-compatible endpoint.                                                                                                         |

## OpenAI Chat Completions Style

A common shape for cloud providers that expose image generation through chat/completions APIs.

| Provider                                | Typical API URL                                        | Tested? | Notes                                                                       |
| --------------------------------------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------------------- |
| [OpenRouter](https://openrouter.ai/)    | https://openrouter.ai/api/v1/chat/completions          | ✅      | Routes requests to many different model providers.                          |
| [OpenAI](https://platform.openai.com/)  | https://api.openai.com/v1/chat/completions             | ❌      | Some image-capable models can be accessed through the chat/completions API. |
| [Together AI](https://www.together.ai/) | https://api.together.xyz/v1/chat/completions           | ❌      | Supports OpenAI-compatible chat APIs and several image models.              |
| [Groq](https://groq.com/)               | https://api.groq.com/openai/v1/chat/completions        | ❌      | OpenAI-compatible API. Image support depends on model selection.            |
| [DeepInfra](https://deepinfra.com/)     | https://api.deepinfra.com/v1/openai/chat/completions   | ❌      | OpenAI-compatible API for multiple model families.                          |
| [Fireworks AI](https://fireworks.ai/)   | https://api.fireworks.ai/inference/v1/chat/completions | ❌      | OpenAI-compatible API with multimodal support.                              |

## OpenAI Images Generations Style

Another common shape for cloud providers, originally introduced by OpenAI.

| Provider                                                     | Typical API URL                                       | Tested? | Notes                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| [NanoGPT](https://nano-gpt.com)                              | https://nano-gpt.com/api/v1/images/generations        | ✅      | Privacy-focused service that supports cryptocurrency payments.               |
| [OpenAI](https://platform.openai.com/)                       | https://api.openai.com/v1/images/generations          | ❌      | The original Images API implementation.                                      |
| [LibertAI](https://docs.libertai.io/apis/image/)             | https://api.libertai.io/v1/images/generations         | ❌      | Explicitly provides an OpenAI Images-compatible endpoint.                    |
| [Runcrate](https://www.runcrate.ai/)                         | https://api.runcrate.ai/v1/images/generations         | ❌      | OpenAI-compatible image generation endpoint supporting SDXL and FLUX models. |
| [OpenOctopus](https://openoctopus.com/)                      | https://api.openoctopus.com/v1/images/generations     | ❌      | Unified API for multiple image-generation providers.                         |
| [Lumenfall](https://lumenfall.ai/)                           | https://api.lumenfall.ai/openai/v1/images/generations | ❌      | OpenAI-compatible unified API covering many image providers.                 |
| [stdapi.ai](https://stdapi.ai/)                              | https://stdapi.ai/v1/images/generations               | ❌      | OpenAI-compatible Images API backed by AWS Bedrock image models.             |
| [Aquiles Image](https://github.com/Aquiles-ai/Aquiles-Image) | http://127.0.0.1:8000/v1/images/generations           | ❌      | Self-hosted OpenAI-compatible image generation server.                       |

## ComfyUI

Specific to [ComfyUI](https://comfy.org/).

| Provider                              | Typical API URL                           | Tested? | Notes                                                             |
| ------------------------------------- | ----------------------------------------- | ------- | ----------------------------------------------------------------- |
| [ComfyUI](https://comfy.org/)         | http://127.0.0.1:8188                     | ✅      | Powerful node-based workflow system with a higher learning curve. |
| [RunComfy](https://www.runcomfy.com/) | https://[your deployment id].runcomfy.net | ❌      | Hosted ComfyUI deployments.                                       |
| Self-hosted ComfyUI Cloud Deployments | Varies                                    | ❌      | Many cloud providers expose the standard ComfyUI API.             |

## Cloudflare Workers AI

| Provider                                                                 | Typical API URL                                                                   | Tested? | Notes                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| [Cloudflare Workers AI](https://www.cloudflare.com/products/workers-ai/) | https://api.cloudflare.com/client/v4/accounts/[your account id]/ai/run/[model id] | ✅      | Generous free tier and easy deployment. |
