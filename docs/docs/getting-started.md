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

There are three main ways to run Yozakura. The native electron application is the fastest to set up for most users and is dead easy. The Docker image has some advantages for more advanced users who are familiar with Docker, especially on Linux or MacOS. Cloning from GitHub is mainly for development and modifications.

## Electron

Prerequisites:

1. You need access to an LLM via a completions API. Check out the [API setup](api-setup.md) guide if you don't have this already.

Installation:

1. Find the latest release on [GitHub](https://github.com/mistval/yozakura/releases) and download the zip file for your operating system.
2. Extract the zip file anywhere on your machine.
3. Run the `yozakura` executable file inside. You might have to click through a warning about running an unsigned executable. Then follow the in-app instructions.
4. Note that a `yozakura_data` folder will be created next to `yozakura.exe`, this is where generated images live if you want to access those directly.

## Docker

Prerequisites:

1. You need access to an LLM via a completions API.
2. You need to have [Docker](https://docs.docker.com/desktop/) installed

Installation:

1. Run `docker run -p 4396:4396 -d ghcr.io/mistval/yozakura:latest`

If you want to use local models, you generally need to add `--network=host` to your Docker command, which **might not work at all on Windows**. As a workaround, you could create a Docker network, run your models inside Docker containers too, and network them together, but that's beyond the scope of this article.

If you want to put your yozakura_data directory somewhere easily accessible, add a volume option to the command like: `docker run -p 4396:4396 -d -v /d/yozakura_data:/app/data ghcr.io/mistval/yozakura:latest`. If you don't do this, yozakura will create an anonymous volume, but you'll have to deal with re-attaching it to the new container if you ever pull a new image.

Give it just a few moments to start, then visit `http://localhost:4396` in your web browser.

## Git clone

Check the [README in the GitHub repo](https://github.com/mistval/yozakura) for the latest development setup instructions.
