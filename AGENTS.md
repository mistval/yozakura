# Coding Agent Instructions

- Do not run prettier (it runs automatically on commit).
- Only run tests or builds when you reasonably suspect you might have broken one.
- Do not use `any` or explicit casting except when really necessary. Use Zod when complex casting is needed.
- Never swallow errors indiscriminately. Prefer failing loudly.
- Always prefer explicit database migrations over runtime backwards compatibility.
- Prefer undefined over null.
- Avoid excessively defensive programming. When something is wrong, we want to blow up as soon as possible, not silently fall back and pretend we're respecting the contract.
- Treat application state and domain objects as immutable across the app. Never mutate them in place, and trust that invariant instead of defensively cloning (e.g., avoid unnecessary `structuredClone`).
- Use the latest browser, JS, and TS features.
- Keep the backend as ignorant of data shapes as possible. It's just a storage layer. Migrations are an exception, they can be high-context when necessary.
- Prefer manual dependency injection over vitest mocking.
- KISS YAGNI. Don't add unrequested extra functionality/dynamism/flexibility that we don't need right now.
- Avoid introducing complexity to solve practical non-issues.
- JSX files should be named with Pascal case, all others with snake case.
- Avoid conditional object spreading (`...(cond ? { prop: val } : {})`). Instead, set properties directly (e.g., `prop: cond ? val : prevVal`).
- You may install Ubuntu packages and tools to help you do your job.
- If something is unclear, ask for clarification before proceeding.
