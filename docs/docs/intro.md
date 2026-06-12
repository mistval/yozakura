---
title: Intro
sidebar_position: 8
---

Yozakura is an AI-powered social simulation in which characters (including the user) move around a map, interact with each other via the user's LLM of choice, and form memories and intentions towards each other, creating a dynamically evolving narrative with up to dozens or even hundreds of characters.

This article gives a brief peek at the main features of Yozakura via screenshots. Alternatively, this YouTube video covers most of the same material (and a little more). TODO

If you have the Yozakura electron app, some of the links in this document will open the mentioned windows in the app.

## Chat

During the user turn, choose one or more characters to chat with.

## Memories

After each chat, NPC memories are updated. The memory system is designed for continuity and narrative momentum, and several different types of memory are maintained. You can read more about the memory system here.

## NPC Chat

Once the user's turn is finished, NPCs each get a chance to move around the map or talk to other characters (potentially including the user). If an image API is configured, images can be generated automatically as NPCs converse with each other.

The user character is not privileged (unless you tweak certain settings). It's possible to play without a user character too, by running Yozakura in auto mode. You could sleep with it running and you might wake up to an entirely different world.

## Prompt templates

Yozakura prompt templates can be edited and the templating system is very powerful. Context documents are generated automatically so you can upload them to a frontier LLM (Claude, ChatGPT, Gemini, etc...) to do the edits for you, which may be complex, depending on what you're going for. Read more about the templating system here.

## Import characters

The character editor supports importing CharacterTavern/SillyTavern style character cards. Upload the card image and for best results, select "Convert".

You can also create new characters from scratch.

## Create your own worlds

Maps in Yozakura are just a list of locations, their names, descriptions, and which other locations they are connected to. It's the character interactions that add all the color. You can create your own map in no time in the map editor.
