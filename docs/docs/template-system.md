---
title: Prompt Template System
sidebar_position: 5
---

The prompt template system controls the wording used for prompts, and the dynamic scenario state information that's injected into prompts. The template system is very flexible and has access to practically the entire scenario state. On the other hand, it's a pain to read and write. The suggested workflow is to have a frontier LLM do significant changes for you.

## Accessing templates

Go to the settings cog -> Prompt Templates -> drill down to find the one you want.

## The Robot Button

Each group of related prompts has an "AI Assistant Instructions" button right up at the top. Click it and it generates a context document for consumption by an AI assistant. Copy it to your AI of choice, tell it what changes you want, and follow its instructions. Modern frontier LLMs tend to be very good at this.

### Example

> **Me**: (uploads document for intelligent next speaker selection) Can you make the character named Wendy more talkative when it's windy in real-world Chicago? But only when Jill isn't around, she makes Wendy feel intimidated.

> **AI**: Only the system prompt template needs to change — the parser stays exactly as-is (it still just maps a name to an ID).

> Here's how I interpreted your request, so you can adjust if I got something wrong:

> - **Wendy** only gets boosted if she's actually one of the speaker candidates this turn.
> - **"Jill isn't around"** = Jill is not a participant in the current conversation (`it.participants`). If she's present, no boost.
> - **"Windy in Chicago"** = live wind speed ≥ 20 mph from a real weather API.

> For the weather I used [Open‑Meteo](https://open-meteo.com), because it's free, needs no API key, and sends `Access-Control-Allow-Origin: *`, so it works straight from the browser **without a CORS proxy** (which Yozakura doesn't provide). The result is cached in `globalWritableContext` for 10 minutes so you're not hitting the API on every single speaker selection. If the fetch ever fails, it silently falls back to normal behavior.

> Update the "Moderation Next Speaker (System)" textarea

> Replace the entire contents with this:

> `<updated prompt template, too big to include here>`

## Format

Yozakura prompts are rendered by [Eta](https://www.npmjs.com/package/eta) which is essentially equivalent to [EJS](https://www.npmjs.com/package/ejs) except faster. All EJS syntax is supported, and `await` is also supported inside of templates.

## Prompt Template Chain Context Docs

If you want to get your hands dirty, you find the documentation for the context object of each prompt group below.

### Conversation Templates

1. [Chat System Prompt (`gen_npc_response`)](pathname:///prompt_docs/template_chain_context_schemas/gen_npc_response.context.schema.html)
2. [Next Speaker Selection (`gen_intelligent_next_speaker_select`)](pathname:///prompt_docs/template_chain_context_schemas/gen_intelligent_next_speaker_select.context.schema.html)
3. [Chat Scene Image Generation (`gen_chat_scene_image_prompt`)](pathname:///prompt_docs/template_chain_context_schemas/gen_chat_scene_image_prompt.context.schema.html)
4. [Memory RAG Prompt Templates (`gen_memory_rag_insert_template`)](pathname:///prompt_docs/template_chain_context_schemas/gen_memory_rag_insert_template.context.schema.html)

### Memory Processing

1. [Conversation Summarization (`gen_convo_summary`)](pathname:///prompt_docs/template_chain_context_schemas/gen_convo_summary.context.schema.html)
2. [Global Memory Rewrite (`gen_global_memory`)](pathname:///prompt_docs/template_chain_context_schemas/gen_global_memory.context.schema.html)
3. [Pairwise Memory Rewrite (`gen_pairwise_memory`)](pathname:///prompt_docs/template_chain_context_schemas/gen_pairwise_memory.context.schema.html)
4. [Next Conversation Goal (`gen_convo_goal`)](pathname:///prompt_docs/template_chain_context_schemas/gen_convo_goal.context.schema.html)
5. [Relationship Descriptor Update (`gen_relationship_descriptor`)](pathname:///prompt_docs/template_chain_context_schemas/gen_relationship_descriptor.context.schema.html)
6. [Offscreen Memory Extraction (`gen_offscreen_learned_information`)](pathname:///prompt_docs/template_chain_context_schemas/gen_offscreen_learned_information.context.schema.html)
7. [Offscreen Conversation Goal Update (`gen_offscreen_character_binary_update_next_convo_goal`)](pathname:///prompt_docs/template_chain_context_schemas/gen_offscreen_character_binary_update_next_convo_goal.context.schema.html)

### Character Generation Templates

1. [Extract Character Description (`gen_extract_character_description`)](pathname:///prompt_docs/template_chain_context_schemas/gen_extract_character_description.context.schema.html)
2. [Example Dialogue Generation (`gen_character_example_dialog`)](pathname:///prompt_docs/template_chain_context_schemas/gen_character_example_dialog.context.schema.html)
3. [Character Description Generation (`gen_character_internal_description`)](pathname:///prompt_docs/template_chain_context_schemas/gen_character_internal_description.context.schema.html)
4. [External Description Generation (`gen_character_external_description`)](pathname:///prompt_docs/template_chain_context_schemas/gen_character_external_description.context.schema.html)
5. [Base Appearance Generation (`gen_character_base_appearance`)](pathname:///prompt_docs/template_chain_context_schemas/gen_character_base_appearance.context.schema.html)
6. [Wardrobe Generation (`gen_character_wardrobe`)](pathname:///prompt_docs/template_chain_context_schemas/gen_character_wardrobe.context.schema.html)
