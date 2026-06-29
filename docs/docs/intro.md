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

# ![Yozakura — an AI-powered social simulation](/img/yozakura_logo_horizontal.svg)

Yozakura is an AI-powered social simulation in which characters (including the user) move around a map, interact with each other via the user's LLM of choice, and form memories and intentions towards each other, creating a dynamically evolving narrative with up to dozens or even hundreds of characters.

This article gives a brief peek at the main features of Yozakura via screenshots. There's also a [YouTube](https://www.youtube.com/watch?v=DqU5ZbXK8JY) video showing some of the same features in action (turn on subtitles) (it's a little outdated and doesn't show some newer features, but covers the core ideas).

## Chat

During the user turn, choose one or more characters to chat with (below, Beatrix is the user in a three-way chat).

![group chat image](/img/in_chat_image_2.png)

## Memories

After each chat, NPC memories are updated. The memory system is designed for continuity and narrative momentum, and several different types of memory are maintained. You can read more about the memory system [here](memory-system.md).

![group chat memories](/img/memories.png)

## NPC Chat

Once the user's turn is finished, NPCs each get a chance to move around the map or talk to other characters (including the user).

You can see this happening from the NPC's perspective. Each chat displays onscreen as it happens. If an image API is configured, images can be generated automatically as NPCs converse with each other.

You can use the `Pause` button at any time to take control: add/remove characters from the chat (including yourself if you want), choose who speaks next, generate images, delete or edit messages, set instructions for each character, move characters, and more.

By default, NPC chats end after a fixed number of messages, but you can also configure an LLM judge to decide when the chat has reached a good stopping point.

![npc chat image](/img/npc_chat.png)

## Import Characters

The character editor supports importing CharacterTavern/SillyTavern style character cards. Upload the card image and for best results, select "Convert" when it asks you what you want to do with it. It will use your LLM to re-write the character information to work better in Yozakura, while remaining true to the character's basic personality. There is also a bulk importer to upload many cards at once.

You can also of course create new characters from scratch.

![character create dialogue](/img/char_create.png)

The [wardrobe](chat.md#wardrobes) system can automatically enable different combinations of image model tags each day.

## Create Your Own Worlds

Maps in Yozakura are just a list of locations, their names, descriptions, and which other locations they are connected to. It's the character interactions that add all the color. You can create your own map in no time with the map editor.

![map visualization](/img/map.png)

## Control Character Schedules

Characters can be grouped together and given [schedules](schedules.md), controlling how/when/why they move around the map. The enables concepts like characters going to work, retiring to their homes at night, going dungeon crawling together on the weekend, and more. Characters who are grouped together will naturally interact more due to shared proximity, forming closer (but not always necessarily positive) relationships.

![The schedule timeline with a few segments, the now marker, and a segment's detail panel open](/img/schedule_editor_yozakura.png)

## Control Calendar, Weather, World Event Timeline

The [temporal context system](temporal-context.md) allows customization of weather and other global world state that changes over time. It's scriptable, with a context doc you can give to an AI assistant to write a script for you. The temporal context is both displayed in the UI, and also injected into character prompts, so when there's a heat wave, everyone knows it and can commiserate.

![The Temporal Context setting, showing the provider dropdown and its controls](/img/temporal_settings_yozakura.png)

## Prompt Templates

Yozakura [prompt templates](template-system.md) can be edited and the templating system is very powerful. Context documents are generated automatically so you can upload them to a frontier LLM (Claude, ChatGPT, Gemini, etc...) to do the edits for you, which may be complex, depending on what you're going for.

![prompt template](/img/template.png)

![AI context doc for prompt templates](/img/ai_assist.png)

## Get Started

Continue to the [getting started guide](getting-started.md) for installation instructions.
