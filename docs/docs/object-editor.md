---
title: AI Object Editor
sidebar_label: AI Object Editor
sidebar_position: 8
description: Edit maps, characters, and relationships in plain language using the AI Object Editor, review changes, inspect results in context, and accept or discard safely.
keywords:
  - yozakura object editor
  - ai edit
  - edit map with ai
  - edit character with ai
  - edit relationship with ai
  - raw json
---

The **AI Object Editor** (**🤖 AI Edit**) lets you chat with an LLM in plain language to ask questions about, create, or modify your Yozakura data. Instead of clicking through every field by hand, you can describe what you want — like building out a connected multi-room map, filling in a character's descriptions and wardrobes, or rewriting relationship memories — and let the AI apply those changes for you.

## Where to Find It

You can open the AI Object Editor from several places:

- **Maps:** Open any map (from **Manage Maps** or inside an active scenario) and click **🤖 AI Edit** in the top bar to update the map's name, description, locations, connections, or zones.
- **Characters:** Click **🤖 AI Edit** in **Character Overview** to edit a character in the active scenario, or in the **Create / Edit Character** window.
- **Character Relationships:** Select two characters in **Character Overview** and click **🤖 AI Edit** to inspect or adjust both sides of their relationship together (familiarity, memories, goals, relationship tags, and summaries).

## Reviewing, Inspecting, and Reverting Changes

The Object Editor is designed so you can experiment freely without committing half-finished changes:

- **Nothing is saved until you click Accept:** Chat with the AI for as many turns as you like. Click **Accept** when you're happy with the result, or click **Discard** (or close the window and confirm) to undo everything from the session.
- **Change summaries and ↻ Revert:** Each edit shows a collapsible summary of what was added, updated, or removed with before/after values. Click **↻ Revert** on any change to undo back to before that step (if there are newer changes after it, Yozakura asks before rolling those back too). Use **Reset Chat** to clear the chat history while keeping your current edits.
- **🔍 Inspect:** Available when editing saved maps, scenario characters, and relationships. Clicking **🔍 Inspect** opens the regular visual editor (such as the map graph or character overview) right on top of the Object Editor so you can check how your changes look or tweak things by hand. When you close the Inspect window, any edits you made to that object show up in the Object Editor log and stay part of the same **Accept** / **Discard** session.
- **Raw JSON & AI Assistant Instructions:** Expand **Raw JSON** to view or copy the current JSON, edit it directly (edits apply when you click outside the box), or click **AI Assistant Instructions** to copy a ready-made prompt for an external AI assistant (ChatGPT, Claude, Gemini, etc.) and paste its updated JSON back in.

## Choosing a Model

- **Stronger models do better:** Editing structured data with interconnected parts — like keeping map connections consistent or filling out detailed character fields — benefits noticeably from stronger models. You can configure a dedicated model just for the **Object Editor** group in **Settings → LLM Settings** without affecting the models you use for chat or background memories — see [Using Different Models for Different Prompt Types](how-to-different-models-per-prompt.md) and [Suggested Models](suggested-models.md).
- **Agentic capabilities are not required:** This feature does not use tool calling, though it still benefits from a model that's good at JSON syntax.

:::info[Coming Later: Agentic Mode]
A planned future **agentic mode** will let the AI make coordinated edits across multiple different data types in a single session (for example, updating a map, characters, groups, and relationships together) when using models that support agentic capabilities.
:::
