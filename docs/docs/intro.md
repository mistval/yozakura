---
title: Introduction to Yozakura
sidebar_label: Intro
sidebar_position: 8
description: Yozakura is an AI-powered social simulation where dozens of LLM-driven characters move around a map, chat, generate images, and form evolving memories. Take a tour of the main features.
keywords:
  - yozakura
  - ai social simulation
  - llm characters
  - ai roleplay
  - generative agents
  - npc simulation
  - character ai
  - ai sandbox
---

#

<div class="yozakura-logo-holder">
![yozakura logo](/img/yozakura_logo_horizontal.svg)
</div>

Yozakura is an AI-powered social simulation in which characters (including the user) move around a map, interact with each other via the user's LLM of choice, and form memories and intentions towards each other, creating a dynamically evolving narrative with up to dozens or even hundreds of characters.

This article gives a brief peek at the main features of Yozakura via screenshots.

## Chat

During the user turn, choose one or more characters to chat with (below, Beatrix is the user in a three-way chat).

![group chat image](/img/in_chat_image_2.png)

## Memories

After each chat, NPC memories are updated. The memory system is designed for continuity and narrative momentum, and several different types of memory are maintained. You can read more about the memory system [here](memory-system.md).

![group chat memories](/img/memories.png)

## NPC Chat

Once the user's turn is finished, NPCs each get a chance to move around the map or talk to other characters (including the user). If an image API is configured, images can be generated automatically as NPCs converse with each other. NPC chats appear in the UI while NPCs each take their turn. You can control how often NPCs chats happen and how long they last.

The user character is not privileged (unless you tweak certain settings). It's possible to play without a user character too, by running Yozakura in auto mode. You could sleep with it running and you might wake up with an interesting tale to read.

![group chat memories](/img/npc_chat.png)

## Import Characters

The character editor supports importing CharacterTavern/SillyTavern style character cards. Upload the card image and for best results, select "Convert" when it asks you what you want to do with it. It will use your LLM to re-write the character information to work better in Yozakura, while remaining true to the character's basic personality.

You can also of course create new characters from scratch.

![character create dialogue](/img/char_create.png)

The [wardrobe](chat.md#wardrobes) system can automatically enable different combinations of image model tags each day.

## Create Your Own Worlds

Maps in Yozakura are just a list of locations, their names, descriptions, and which other locations they are connected to. It's the character interactions that add all the color. You can create your own map in no time with the map editor.

![map visualization](/img/map.png)

## Prompt Templates

Yozakura prompt templates can be edited and the templating system is very powerful. Context documents are generated automatically so you can upload them to a frontier LLM (Claude, ChatGPT, Gemini, etc...) to do the edits for you, which may be complex, depending on what you're going for. Read more about the templating system [here](template-system.md).

![prompt template](/img/template.png)

![AI context doc for prompt templates](/img/ai_assist.png)

## Get Started

Continue to the [getting started guide](getting-started.md) for installation instructions.
