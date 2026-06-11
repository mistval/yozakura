## Don't use catch-all error catching

Generally speaking, catch blocks should be used to do specific things for known error conditions. Every catch block should examine the error and do something based on the type of the error, or re-throw if it doesn't recognize the error.

## Minimize casting

Casting ("as" statement) and the "any" type should be avoided. Usage of Zod is encouraged. Zod can be used to do complex casts safely, throwing an error if the data doesn't match the Zod schema.

## No live migrations

When we change data shapes, we never need to do a live (runtime) migration. Instead, we should write a one-time manual migration script that the user can run.

## DRY

Look for opportunities to keep code clean and concise by consolidating similar code into shared functions.

## Thin API, thin UI

This project can be thought to consist of three parts:

1. The API (express.js)
2. The UI (react)
3. The engine (plain TypeScript, runs in the frontend in the browser)

Business logic should be concentrated in the engine. The API should be a thin layer that essentially acts as a filesystem proxy and a CORS proxy. The UI should be a presentation layer that displays what's happening in the engine, and calls into it when the user interacts with the UI.

## Simple but clean

We should prefer simple solutions when they are sufficiently clean and robust.

Avoid complex error handling or special case handling. Prefer existing generic error handling classes (mainly InteractiveRetry).

## Evolving codebase

When we add new features, it's important that we integrate those features cleanly into the project. This may involve refactoring existing code. Refactoring existing code to make the integration clean is preferred over hacking the new feature in the quick and dirty way, even when refactoring requires more time and larger changes.

## Browser Features

You may always assume that the latest browser features are available in the user's browser. There is no need to support older browsers.
