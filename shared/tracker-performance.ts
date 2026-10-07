export const TRACKER_PAGE_SIZE = 50;
export const TRACKER_SEARCH_DELAY = 150;

export function trackerPage<T>(records: readonly T[], requestedPage: number, pageSize = TRACKER_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const start = (page - 1) * pageSize;
  return { page, pageCount, start, end: Math.min(start + pageSize, records.length), rows: records.slice(start, start + pageSize) };
}

export function createDebouncedSearch(emit: (value: string) => void, delay = TRACKER_SEARCH_DELAY) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | undefined;
  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  }
  function flush() {
    const value = pending;
    cancel();
    if (value !== undefined) emit(value);
  }
  return {
    schedule(value: string) {
      cancel();
      pending = value;
      timer = setTimeout(flush, delay);
    },
    cancel,
    flush,
  };
}
