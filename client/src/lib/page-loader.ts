export function createPageLoader<T>(importPage: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(importPage).catch(error => {
        // A failed speculative preload must not permanently poison navigation.
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}

export function canPreloadPages(connection?: { saveData?: boolean; effectiveType?: string }): boolean {
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType || "");
}
