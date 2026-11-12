---
name: Lazy page download recovery
description: Why transient page-code downloads need recovery before reaching React.lazy.
---

Retry recognized transient module-download errors before allowing the promise supplied to React.lazy to reject. Keep retries bounded and let syntax, rendering, and application errors fail normally.

**Why:** React.lazy caches a rejected loader promise independently of the page loader's own cache. Clearing only the loader cache permits another preload but does not recover the already-failed lazy component. A Board navigation failed after a temporary module fetch failure even though the same module subsequently returned HTTP 200.

**How to apply:** Preserve shared in-flight imports across preloading and navigation. Test recovery through a real React.lazy render, not only a second standalone loader call. Do not automatically reload the application in a loop or treat an authentication failure as a module-download error.
