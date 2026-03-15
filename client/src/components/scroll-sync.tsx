import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function ScrollSync({ children, className }: Props) {
  const topBarRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    // Shadcn's <Table> wraps content in a div with overflow-x-auto.
    // We sync with that inner scroll container rather than a wrapper we add ourselves.
    const found = inner.querySelector("div.overflow-x-auto") as HTMLElement | null;
    const scrollEl: HTMLElement = found ?? inner;
    scrollElRef.current = scrollEl;

    const updateWidth = () => {
      if (topInnerRef.current) {
        topInnerRef.current.style.width = `${scrollEl.scrollWidth}px`;
      }
    };

    const onScrollElScroll = () => {
      if (syncingRef.current) return;
      const top = topBarRef.current;
      if (top) {
        syncingRef.current = true;
        top.scrollLeft = scrollEl.scrollLeft;
        syncingRef.current = false;
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollEl);
    updateWidth();
    scrollEl.addEventListener("scroll", onScrollElScroll);

    return () => {
      observer.disconnect();
      scrollEl.removeEventListener("scroll", onScrollElScroll);
    };
  }, []);

  const onTopScroll = useCallback(() => {
    if (syncingRef.current) return;
    const scrollEl = scrollElRef.current;
    const top = topBarRef.current;
    if (scrollEl && top) {
      syncingRef.current = true;
      scrollEl.scrollLeft = top.scrollLeft;
      syncingRef.current = false;
    }
  }, []);

  return (
    <div className={cn("flex flex-col min-h-0 flex-1 min-w-0 overflow-hidden", className)}>
      <div
        ref={topBarRef}
        className="scroll-sync-top shrink-0"
        style={{ height: "10px" }}
        onScroll={onTopScroll}
      >
        <div ref={topInnerRef} style={{ height: "1px", minWidth: "100%" }} />
      </div>
      <div ref={innerRef} className="flex-1 min-h-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
