---
title: Getting Started
sidebar_position: 3
description: Install and run Yozakura via the native Electron app, Docker, or by cloning from GitHub. Step-by-step setup instructions to get your AI social simulation running.
keywords:
  - yozakura install
  - yozakura setup
  - getting started
  - electron app
  - docker
  - ai simulation
---

There are three main ways to run Yozakura. The **Electron** app is recommended for most users running Yozakura on a computer.

Looking to use Yozakura on your phone? Check the [Mobile Devices](mobile-devices.md) guide.

## Electron (Recommended)

Prerequisites:

1. You need access to an LLM via a completions API. Check out the [model setup](api-setup.md) guide if you don't have this already.

Installation:

1. Find the latest release on [GitHub](https://github.com/mistval/yozakura/releases) and download the zip file for your operating system.
2. Extract the zip file anywhere on your machine.
3. Run the `yozakura` executable file inside. You might have to click through a warning about running an unsigned executable. Then follow the in-app instructions.
4. Note that a `yozakura_data` folder will be created next to the yozakura executable, this is where generated images live if you want to access those directly.

:::info[Web Browser]

If you want to use web browser features in Yozakura (like ctrl+f to find), just go to [http://localhost:4396](http://localhost:4396) in your web browser after launching Yozakura.

:::

## Docker

Prerequisites:

1. You need access to an LLM via a completions API.
2. You need to have [Docker](https://docs.docker.com/desktop/) installed.

Installation:

**Using Docker compose**: Save this [docker-compose.yml](https://github.com/mistval/yozakura/blob/main/docker-compose.yml) file somewhere and run `docker compose up -d` in that directory.

**Or without compose**: Run `docker run --network host -v ./yozakura_data:/app/yozakura_data -d ghcr.io/mistval/yozakura:latest`.

In both cases, your data will be saved to a `yozakura_data` folder in the current working directory.

Both methods use host network mode in order to have access to APIs you're running on your local machine. On **Windows (where host network mode may not work) you may need to make some changes**:

1. Replace `network_mode: host` with `ports: ["127.0.0.1:4396:4396"]` and `environment: ["HOST=0.0.0.0"]` in `docker-compose.yml` (or replace `--network host` with `-p 127.0.0.1:4396:4396 -e HOST=0.0.0.0` in `docker run`).
2. When configuring local APIs in Yozakura's settings, use `host.docker.internal` instead of `localhost` or `127.0.0.1` (for example, `http://host.docker.internal:5001/v1/chat/completions`).

Give it just a few moments to start, then visit `http://localhost:4396` in your web browser.

## Git Clone

Check the [README in the GitHub repo](https://github.com/mistval/yozakura) for setup and development instructions.
