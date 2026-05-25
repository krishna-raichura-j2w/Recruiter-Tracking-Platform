import type { ReactNode } from "react";

interface ScrollListProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
  divided?: boolean;
}

interface ScrollContainerProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Vertical scrollable list with a subtle styled scrollbar. */
export function ScrollList({
  children,
  maxHeight = "320px",
  className = "",
  divided = true,
}: ScrollListProps) {
  return (
    <div
      className={`overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent ${divided ? "divide-y divide-slate-50" : ""} ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}

/** Horizontal scrollable container with a subtle styled scrollbar. */
export function ScrollContainer({ children, className = "", style }: ScrollContainerProps) {
  return (
    <div
      className={`overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pb-1 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
