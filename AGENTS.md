# Coding Agent Instructions

- Do not run prettier (formatting).
- Only run tests or builds when you reasonably suspect you might have broken one.
- Do not use `any` or explicit casting except when really necessary. Use Zod when complex casting is needed.
- Never swallow errors indiscriminately. Prefer failing loudly.
- Always prefer explicit database migrations over runtime backwards compatibility.
- Prefer undefined over null.
- Avoid excessively defensive programming.
- Use the latest browser, JS, and TS features.
- Keep the backend as ignorant of data shapes as possible. It's just a storage layer.
- Prefer manual dependency injection over vitest mocking.
