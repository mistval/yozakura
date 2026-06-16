# Contributing

Thanks for your interest in contributing to Yozakura.

This is a new project without particularly formal contribution requirements. Please just heed the following guidelines.

1. Before working on a major feature, consider starting a discussion in [discussions](https://github.com/mistval/yozakura/discussions) and propose your motivation and intended approach.
2. Pull requests should go to the `dev` branch.
3. Most significant pull requests will likely require at least a couple rounds of code review.
4. Please make an effort to strictly adhere to type-safe coding approaches (using Zod for validation) and immutability.
5. You must be the author of any code you contribute.
6. AI-generated code counts, but contributors must understand the code and are responsible for it, so strictly vibe-coded features likely won't get merged.

## Scope & Vision

Features added as core features in Yozakura should be applicable to any imaginable scenario.

For example something like a "theft" system might not be a good fit, as the consequences of stealing can vary dramatically between different fictional worlds.

There are some gray areas, for example the existing memory system clearly wouldn't work in a world where "people don't have memories". So it's not always 100% clear-cut what fits the core vision and what doesn't, and it can be a discussion.

Ultimately, a key roadmap item is to add internal tool calling for agents so that users could implement a theft system where their LLM has the ability to `moveCharacter()` into the prison if they do something untoward.

I would say that the core scope of Yozakura is essentially: character CRUD, map CRUD, scenario CRUD, the turn loop, character movement, the chat loop, the memory system. With the caveat that I intend to spin off the memory system into something more extensible and less fundamental to the system (user-defined memory processing steps and memory types).
