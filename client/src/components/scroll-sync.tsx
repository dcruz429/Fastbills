import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function ScrollSync({ children, className }: Props) {
  const topBarRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const onTopScroll = useCallback(() => {
    if (syncingRef.current) return;
    if (contentRef.current && topBarRef.current) {
      syncingRef.current = true;
      contentRef.current.scrollLeft = topBarRef.current.scrollLeft;
      syncingRef.current = false;
    }
  }, []);

  const onContentScroll = useCallback(() => {
    if (syncingRef.current) return;
    if (topBarRef.current && contentRef.current) {
      syncingRef.current = true;
      topBarRef.current.scrollLeft = contentRef.current.scrollLeft;
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return;

    const updateWidth = () => {
      if (topInnerRef.current) {
        topInnerRef.current.style.width = `${inner.scrollWidth}px`;
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(inner);
    updateWidth();

    return () => observer.disconnect();
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
      <div
        ref={contentRef}
        className="overflow-auto flex-1 min-h-0 always-show-scrollbar"
        onScroll={onContentScroll}
      >
        <div ref={innerRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
