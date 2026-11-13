function isPageDownloadError(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(message);
}

export function createPageLoader<T>(
  importPage: () => Promise<T>,
  options: { retryDelays?: readonly number[]; wait?: (milliseconds: number) => Promise<void> } = {},
): () => Promise<T> {
  let pending: Promise<T> | undefined;
  const retryDelays = options.retryDelays ?? [250, 750];
  const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));

  async function downloadPage(): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await importPage();
      } catch (error) {
        // Retry only module downloads, before React.lazy permanently caches a
        // rejected promise. Rendering, syntax and application errors still fail.
        if (!isPageDownloadError(error) || attempt >= retryDelays.length) throw error;
        await wait(retryDelays[attempt]);
      }
    }
  }

  return () => {
    if (!pending) {
      pending = Promise.resolve().then(downloadPage).catch(error => {
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
