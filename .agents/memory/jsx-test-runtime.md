---
name: JSX test runtime
description: Why valid browser components can fail when rendered by standalone Node tests.
---

Use the automatic JSX runtime for browser-component rendering tests, matching the Vite build.

**Why:** Some shared UI components intentionally omit a React runtime import because the browser build uses the automatic JSX transform. Standalone tsx defaults under this project's JSX-preserving TypeScript configuration can instead use the classic transform, producing a misleading “React is not defined” failure even when the production browser build is correct.

**How to apply:** Run rendering tests with the dedicated test TypeScript configuration, or an equivalent automatic-runtime transform. Check this mismatch before changing otherwise valid shared UI components merely to satisfy a Node rendering test.
