import { memo, useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { createDebouncedSearch } from "@shared/tracker-performance";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

// Draft typing stays in this small component, not in a page with thousands of
// records. Filtering runs after a short pause, or immediately on Enter/blur.
export const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value, onValueChange, onBlur, onKeyDown, onCompositionStart, onCompositionEnd, ...props
}: Props) {
  const [draft, setDraft] = useState(value);
  const lastEmitted = useRef(value);
  const callback = useRef(onValueChange);
  const composing = useRef(false);
  callback.current = onValueChange;
  const search = useMemo(() => createDebouncedSearch(next => {
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      callback.current(next);
    }
  }), []);

  useEffect(() => {
    // Don't overwrite newer typing when the parent acknowledges an older draft.
    if (value !== lastEmitted.current) {
      search.cancel();
      lastEmitted.current = value;
      setDraft(value);
    }
  }, [value, search]);
  useEffect(() => () => search.cancel(), [search]);

  return (
    <Input
      {...props}
      aria-label={props["aria-label"] || props.placeholder || "Search records"}
      value={draft}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (!composing.current) {
          search.schedule(next);
          if (!next) search.flush();
        }
      }}
      onBlur={event => { search.flush(); onBlur?.(event); }}
      onKeyDown={event => {
        if (event.key === "Enter" && !composing.current) search.flush();
        onKeyDown?.(event);
      }}
      onCompositionStart={event => {
        composing.current = true;
        search.cancel();
        onCompositionStart?.(event);
      }}
      onCompositionEnd={event => {
        composing.current = false;
        search.schedule(event.currentTarget.value);
        onCompositionEnd?.(event);
      }}
    />
  );
});
