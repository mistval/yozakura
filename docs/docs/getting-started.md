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

There are three main ways to run Yozakura. The native electron application is the fastest to set up for most users and is dead easy. The Docker image has some advantages for more advanced users who are familiar with Docker, especially on Linux or MacOS. Cloning from GitHub is mainly intended for development and modifications, but is also a viable way to install and run Yozakura if that's your preference.

## Electron

Prerequisites:

1. You need access to an LLM via a completions API. Check out the [API setup](api-setup.md) guide if you don't have this already.

Installation:

1. Find the latest release on [GitHub](https://github.com/mistval/yozakura/releases) and download the zip file for your operating system.
2. Extract the zip file anywhere on your machine.
3. Run the `yozakura` executable file inside. You might have to click through a warning about running an unsigned executable. Then follow the in-app instructions.
4. Note that a `yozakura_data` folder will be created next to `yozakura.exe`, this is where generated images live if you want to access those directly.

## Docker

### Prerequisites:

1. You need access to an LLM via a completions API.
2. You need to have [Docker](https://docs.docker.com/desktop/) installed

### Installation:

**Using Docker compose**: Save this [docker-compose.yml](https://github.com/mistval/yozakura/blob/main/docker-compose.yml) file somewhere and run `docker compose up -d` in that directory.

**Or without compose**: Run `docker run --network host -v ./yozakura_data:/app/data -d ghcr.io/mistval/yozakura:latest`.

In both cases, your data will be saved to a `yozakura_data` folder in the current working directory.

Both methods use host network mode in order to have access to APIs you're running on your local machine. If you are not running text completions or image generation APIs on your local machine, you can remove the host network mode option. Note that host network mode **might not work at all on Windows**.

Give it just a few moments to start, then visit `http://localhost:4396` in your web browser.

## Git clone

Check the [README in the GitHub repo](https://github.com/mistval/yozakura) for the latest development setup instructions.
